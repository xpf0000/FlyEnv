import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { open, mkdir, realpath, lstat } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, sep } from 'node:path'
import type {
  MemoryInputs,
  MemoryRecord,
  MemoryResult,
  MemorySnapshot,
  MemoryTombstone,
  MemoryView,
  MutationReceipt,
  ScopeBudgets
} from '../shared'
import { INPUT_LIMITS } from '../core/limits'
import { isUuid, MemoryFault, validateInput, validateRecordDocument } from '../core/validation'
import { AtomicFile, AtomicWriteFailure } from './AtomicFile'
import type { ScopeLease, ScopeUncertainty } from './ScopeCoordinator'

type RecordMutation = MemoryResult<MutationReceipt> & {
  committed?: MemorySnapshot
  changed?: boolean
}
const sha = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex')
function canonical(value: any): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
    .join(',')}}`
}
const isDeleted = (value: MemoryRecord | MemoryTombstone): value is MemoryTombstone =>
  'operation' in value
export function memoryStoreId(scope: string, request: string) {
  const bytes = Buffer.from(
    sha(`flyenv-ai-memory/store/v1\0${scope}\0${request}`).slice(0, 32),
    'hex'
  )
  bytes[6] = (bytes[6] & 15) | 128
  bytes[8] = (bytes[8] & 63) | 128
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
export function requestDigest(lease: ScopeLease, operation: string, input: Record<string, any>) {
  const normalized = { ...input }
  delete normalized.project_path
  delete normalized.scope
  return sha(canonical({ scope: lease.scope.key, operation, input: normalized }))
}

export class RecordStore {
  constructor(
    readonly budgets: ScopeBudgets,
    readonly atomic: Pick<AtomicFile, 'replace'> = new AtomicFile()
  ) {}
  private failure(error: unknown): MemoryResult<never> {
    if (error instanceof MemoryFault) return { outcome: error.outcome, error_code: error.code }
    return { outcome: 'failed', error_code: 'record_unavailable' }
  }
  assertScope(lease: ScopeLease, input: { scope: string }) {
    lease.assertActive()
    if ((input.scope === 'project') !== !!lease.scope.projectId)
      throw new MemoryFault('scope_mismatch')
  }
  assertWritable(lease: ScopeLease) {
    lease.assertActive()
    if (lease.unknown) throw new MemoryFault('scope_commit_unknown', 'unknown')
  }
  async ensureDirectory(lease: ScopeLease, path: string) {
    await mkdir(path, { recursive: true, mode: 0o700 })
    await this.assertManagedPath(lease, path)
  }
  async assertManagedPath(lease: ScopeLease, path: string) {
    const [scopeRoot, target, named] = await Promise.all([
      realpath(lease.scope.directory),
      realpath(path),
      lstat(path)
    ])
    const rel = relative(scopeRoot, target)
    if (named.isSymbolicLink() || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel))
      throw new MemoryFault('managed_path_invalid')
  }
  private async bytes(
    lease: ScopeLease,
    path: string,
    limit: number,
    missing: string,
    oversized: string
  ): Promise<Buffer> {
    try {
      await this.assertManagedPath(lease, dirname(path))
      const file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
      try {
        const metadata = await file.stat()
        if (!metadata.isFile()) throw new MemoryFault('managed_path_invalid')
        if (metadata.size > limit) throw new MemoryFault(oversized)
        const buffer = Buffer.alloc(Math.min(limit + 1, metadata.size + 1))
        let length = 0
        while (length < buffer.length) {
          const { bytesRead } = await file.read(buffer, length, buffer.length - length, length)
          if (!bytesRead) break
          length += bytesRead
        }
        if (length > limit) throw new MemoryFault(oversized)
        return buffer.subarray(0, length)
      } finally {
        await file.close()
      }
    } catch (error) {
      if (error instanceof MemoryFault) throw error
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new MemoryFault(missing)
      throw new MemoryFault('record_unavailable')
    }
  }
  async readDocument(
    lease: ScopeLease,
    id: string
  ): Promise<MemoryRecord | MemoryTombstone | undefined> {
    lease.assertActive()
    if (!isUuid(id)) throw new MemoryFault('invalid_input')
    let bytes: Buffer
    try {
      bytes = await this.bytes(
        lease,
        join(lease.scope.directory, 'records', `${id}.json`),
        this.budgets.recordBytes,
        'record_not_found',
        'record_too_large'
      )
    } catch (error) {
      if (error instanceof MemoryFault && error.code === 'record_not_found') return undefined
      throw error
    }
    let json: unknown
    try {
      json = JSON.parse(bytes.toString('utf8'))
    } catch {
      throw new MemoryFault('record_corrupt')
    }
    return validateRecordDocument(json, id)
  }
  private async body(lease: ScopeLease, snapshot: MemorySnapshot) {
    const bytes = await this.bytes(
      lease,
      join(lease.scope.directory, 'bodies', snapshot.body_ref),
      INPUT_LIMITS.bodyBytes,
      'body_missing',
      'body_corrupt'
    )
    if (bytes.length !== snapshot.body_bytes || sha(bytes) !== snapshot.body_sha256)
      throw new MemoryFault('body_corrupt')
    try {
      return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
    } catch {
      throw new MemoryFault('body_corrupt')
    }
  }
  private deleted(document: MemoryTombstone): MemoryResult<never> {
    return {
      outcome: 'deleted',
      id: document.id,
      revision: document.deleted_revision,
      error_code: 'deleted'
    }
  }
  private replay(
    record: MemoryRecord,
    operation: 'store' | 'update',
    request: string,
    digest: string
  ): RecordMutation | undefined {
    const snapshot = [...record.history, record.current].find(
      (item) => item.receipt.operation === operation && item.receipt.request_id === request
    )
    if (!snapshot) return undefined
    if (snapshot.receipt.request_digest !== digest)
      return {
        outcome: 'conflict',
        id: record.current.id,
        revision: record.current.revision,
        error_code: 'request_conflict'
      }
    return {
      outcome: 'success',
      data: { id: snapshot.id, revision: snapshot.revision },
      committed: structuredClone(record.current),
      changed: false
    }
  }
  async store(lease: ScopeLease, raw: MemoryInputs['store']): Promise<RecordMutation> {
    try {
      const input = validateInput('store', raw)
      this.assertScope(lease, input)
      this.assertWritable(lease)
      const id = memoryStoreId(lease.scope.key, input.request_id)
      const digest = requestDigest(lease, 'store', input)
      const existing = await this.readDocument(lease, id)
      if (existing) {
        if (isDeleted(existing)) return this.deleted(existing)
        return (
          this.replay(existing, 'store', input.request_id, digest) ?? {
            outcome: 'conflict',
            id,
            error_code: 'request_conflict'
          }
        )
      }
      const { scope: _scope, request_id, content, ...draft } = input
      delete (draft as any).project_path
      delete (draft as any).create_project
      const now = new Date().toISOString()
      const current: MemorySnapshot = {
        ...draft,
        id,
        revision: 1,
        created_at: now,
        updated_at: now,
        change_reason: 'initial',
        status: input.status!,
        pinned: input.pinned!,
        body_ref: `${id}/${randomUUID()}.md`,
        body_sha256: sha(content),
        body_bytes: Buffer.byteLength(content),
        receipt: { operation: 'store', request_id, request_digest: digest, result_revision: 1 }
      }
      return await this.commit(lease, { schema_version: 1, current, history: [] }, content)
    } catch (error) {
      return this.failure(error)
    }
  }
  async update(lease: ScopeLease, raw: MemoryInputs['update']): Promise<RecordMutation> {
    try {
      const input = validateInput('update', raw)
      this.assertScope(lease, input)
      this.assertWritable(lease)
      const record = await this.readDocument(lease, input.id)
      if (!record) throw new MemoryFault('record_not_found')
      if (isDeleted(record)) return this.deleted(record)
      const digest = requestDigest(lease, 'update', input)
      const replay = this.replay(record, 'update', input.request_id, digest)
      if (replay) return replay
      if (record.current.revision !== input.expected_revision)
        return {
          outcome: 'conflict',
          id: input.id,
          revision: record.current.revision,
          error_code: 'revision_conflict'
        }
      const { content, ...metadata } = input.changes
      const changedBody =
        content !== undefined &&
        (sha(content) !== record.current.body_sha256 ||
          Buffer.byteLength(content) !== record.current.body_bytes)
      if (!changedBody) await this.body(lease, record.current)
      const revision = record.current.revision + 1
      const current: MemorySnapshot = {
        ...record.current,
        ...metadata,
        revision,
        updated_at: new Date(
          Math.max(Date.now(), Date.parse(record.current.updated_at))
        ).toISOString(),
        change_reason: input.reason,
        ...(changedBody
          ? {
              body_ref: `${input.id}/${randomUUID()}.md`,
              body_sha256: sha(content!),
              body_bytes: Buffer.byteLength(content!)
            }
          : {}),
        receipt: {
          operation: 'update',
          request_id: input.request_id,
          request_digest: digest,
          result_revision: revision
        }
      }
      return await this.commit(
        lease,
        { schema_version: 1, current, history: [...record.history, record.current] },
        changedBody ? content : undefined
      )
    } catch (error) {
      return this.failure(error)
    }
  }
  private async commit(
    lease: ScopeLease,
    record: MemoryRecord,
    content?: string
  ): Promise<RecordMutation> {
    const current = record.current
    const json = JSON.stringify(record)
    if (Buffer.byteLength(json) > this.budgets.recordBytes)
      throw new MemoryFault('record_too_large')
    validateRecordDocument(record, current.id)
    await this.ensureDirectory(lease, join(lease.scope.directory, 'records'))
    if (content !== undefined) {
      const body = join(lease.scope.directory, 'bodies', current.body_ref)
      await this.ensureDirectory(lease, dirname(body))
      try {
        await this.atomic.replace(body, content)
      } catch {
        return {
          outcome: 'failed',
          id: current.id,
          error_code: 'body_write_failed',
          warnings: [{ code: 'unreferenced_body_pending', id: current.id }]
        }
      }
    }
    try {
      await this.atomic.replace(join(lease.scope.directory, 'records', `${current.id}.json`), json)
    } catch (error) {
      if (error instanceof AtomicWriteFailure && error.outcome === 'unknown') {
        lease.markUnknown({ id: current.id, ...current.receipt })
        return {
          outcome: 'unknown',
          id: current.id,
          revision: current.revision,
          error_code: 'record_commit_unknown'
        }
      }
      return {
        outcome: 'failed',
        id: current.id,
        error_code: 'record_write_failed',
        ...(content !== undefined
          ? { warnings: [{ code: 'unreferenced_body_pending', id: current.id }] }
          : {})
      }
    }
    lease.publishChange()
    return {
      outcome: 'success',
      data: { id: current.id, revision: current.revision },
      committed: structuredClone(current),
      changed: true
    }
  }
  async get(lease: ScopeLease, raw: MemoryInputs['get']): Promise<MemoryResult<MemoryView>> {
    try {
      const input = validateInput('get', raw)
      this.assertScope(lease, input)
      const record = await this.readDocument(lease, input.id)
      if (!record) throw new MemoryFault('record_not_found')
      if (isDeleted(record)) return this.deleted(record)
      const selected =
        input.revision === undefined
          ? record.current
          : [...record.history, record.current].find(
              (snapshot) => snapshot.revision === input.revision
            )
      if (!selected) throw new MemoryFault('revision_not_found')
      const content = await this.body(lease, selected)
      const {
        body_ref: _ref,
        body_sha256: _hash,
        body_bytes: _bytes,
        receipt: _receipt,
        ...metadata
      } = selected
      return { outcome: 'success', data: { ...metadata, content } }
    } catch (error) {
      return this.failure(error)
    }
  }
  async recover(lease: ScopeLease): Promise<MemoryResult<{ committed: boolean }>> {
    try {
      const pending: ScopeUncertainty | undefined = lease.unknown
      if (!pending) return { outcome: 'success', data: { committed: false } }
      const record = await this.readDocument(lease, pending.id)
      const receipt =
        record &&
        (isDeleted(record)
          ? pending.operation === 'forget'
            ? record
            : undefined
          : [...record.history, record.current]
              .map((item) => item.receipt)
              .find(
                (item) =>
                  item.operation === pending.operation && item.request_id === pending.request_id
              ))
      if (receipt && receipt.request_digest !== pending.request_digest)
        throw new MemoryFault('recovery_request_conflict')
      lease.clearUnknown()
      return { outcome: 'success', data: { committed: !!receipt } }
    } catch (error) {
      return this.failure(error)
    }
  }
}
