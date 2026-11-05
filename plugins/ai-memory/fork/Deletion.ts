import { opendir, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import type {
  MemoryInputs,
  MemoryOutputs,
  MemoryResult,
  MemoryTombstone,
  MemoryWarning
} from '../shared'
import { isUuid, MemoryFault, validateInput, validateRecordDocument } from '../core/validation'
import { AtomicWriteFailure } from './AtomicFile'
import { RecordStore, requestDigest } from './RecordStore'
import type { ScopeLease } from './ScopeCoordinator'

type CleanupItem = {
  kind: 'body' | 'temporary' | 'directory'
  status: 'completed' | 'failed' | 'skipped'
  error_code?: string
}
export type CleanupSummary = {
  completed: number
  failed: number
  skipped: number
  items: CleanupItem[]
  truncated: boolean
}
type DeletionResult = MemoryResult<MemoryOutputs['forget']> & { cleanup?: CleanupSummary }
type RecoveryResult = MemoryResult<{
  scanned: number
  recovered: number
  pending: number
  skipped: number
}>

/** Logical deletion and physical cleanup use the caller's same scope lease. */
export class Deletion {
  constructor(
    private readonly records: RecordStore,
    private readonly io: { unlink(path: string): Promise<void> } = { unlink }
  ) {}
  private failure(error: unknown): MemoryResult<never> {
    if (error instanceof MemoryFault) return { outcome: error.outcome, error_code: error.code }
    return { outcome: 'failed', error_code: 'deletion_unavailable' }
  }
  private receipt(tombstone: MemoryTombstone) {
    return {
      id: tombstone.id,
      revision: tombstone.deleted_revision,
      cleanup_state: tombstone.cleanup_state
    }
  }
  private async commit(
    lease: ScopeLease,
    tombstone: MemoryTombstone
  ): Promise<'success' | 'failed' | 'unknown'> {
    validateRecordDocument(tombstone, tombstone.id)
    const bytes = JSON.stringify(tombstone)
    if (Buffer.byteLength(bytes) > this.records.budgets.recordBytes) return 'failed'
    try {
      await this.records.atomic.replace(
        join(lease.scope.directory, 'records', `${tombstone.id}.json`),
        bytes
      )
    } catch (error) {
      if (error instanceof AtomicWriteFailure && error.outcome === 'unknown') {
        lease.markUnknown({
          id: tombstone.id,
          operation: 'forget',
          request_id: tombstone.request_id,
          request_digest: tombstone.request_digest
        })
        return 'unknown'
      }
      return 'failed'
    }
    lease.publishChange()
    return 'success'
  }
  async forget(lease: ScopeLease, raw: MemoryInputs['forget']): Promise<DeletionResult> {
    try {
      const input = validateInput('forget', raw)
      this.records.assertScope(lease, input)
      this.records.assertWritable(lease)
      const document = await this.records.readDocument(lease, input.id)
      if (!document) throw new MemoryFault('record_not_found')
      const digest = requestDigest(lease, 'forget', input)
      if ('operation' in document) {
        if (document.request_id === input.request_id) {
          if (document.request_digest !== digest)
            return { outcome: 'conflict', id: input.id, error_code: 'request_conflict' }
          return document.cleanup_state === 'complete'
            ? { outcome: 'success', data: this.receipt(document) }
            : await this.finish(lease, document)
        }
        return document.cleanup_state === 'complete'
          ? { outcome: 'already_deleted', data: this.receipt(document) }
          : { outcome: 'partial', data: this.receipt(document), error_code: 'deletion_pending' }
      }
      if (document.current.revision !== input.expected_revision)
        return {
          outcome: 'conflict',
          id: input.id,
          revision: document.current.revision,
          error_code: 'revision_conflict'
        }
      const tombstone: MemoryTombstone = {
        schema_version: 1,
        id: input.id,
        deleted_revision: document.current.revision + 1,
        operation: 'forget',
        request_id: input.request_id,
        request_digest: digest,
        cleanup_state: 'pending',
        outcome: 'partial'
      }
      const committed = await this.commit(lease, tombstone)
      if (committed !== 'success')
        return {
          outcome: committed,
          id: input.id,
          error_code: committed === 'unknown' ? 'deletion_commit_unknown' : 'deletion_commit_failed'
        }
      // From here, reads only see the tombstone. Cleanup failure cannot restore the old record.
      return await this.finish(lease, tombstone)
    } catch (error) {
      return this.failure(error)
    }
  }
  async resumePending(lease: ScopeLease, id: string): Promise<DeletionResult> {
    try {
      this.records.assertWritable(lease)
      const document = await this.records.readDocument(lease, id)
      if (!document) throw new MemoryFault('record_not_found')
      if (!('operation' in document)) throw new MemoryFault('not_pending_deletion')
      return document.cleanup_state === 'complete'
        ? { outcome: 'already_deleted', data: this.receipt(document) }
        : await this.finish(lease, document)
    } catch (error) {
      return this.failure(error)
    }
  }
  private async clean(lease: ScopeLease, id: string): Promise<CleanupSummary> {
    const summary: CleanupSummary = {
      completed: 0,
      failed: 0,
      skipped: 0,
      items: [],
      truncated: false
    }
    const add = (item: CleanupItem) => {
      summary[item.status]++
      if (summary.items.length < 100) summary.items.push(item)
      else summary.truncated = true
    }
    const scan = async (directory: string, bodyDirectory: boolean) => {
      try {
        await this.records.assertManagedPath(lease, directory)
        const entries = await opendir(directory)
        for await (const entry of entries) {
          let kind: CleanupItem['kind'] | undefined
          if (bodyDirectory) {
            if (entry.name.endsWith('.md') && isUuid(entry.name.slice(0, -3))) kind = 'body'
            else {
              const match = entry.name.match(/^\.memory-([a-f0-9-]{36})\.md-([a-f0-9-]{36})\.tmp$/i)
              if (match && isUuid(match[1]) && isUuid(match[2])) kind = 'temporary'
            }
            if (!kind) {
              add({ kind: 'directory', status: 'skipped', error_code: 'unmanaged_file' })
              continue
            }
          } else {
            const prefix = `.memory-${id}.json-`
            if (
              entry.name.startsWith(prefix) &&
              entry.name.endsWith('.tmp') &&
              isUuid(entry.name.slice(prefix.length, -4))
            )
              kind = 'temporary'
            if (!kind) continue
          }
          if (!entry.isFile()) {
            add({ kind, status: 'failed', error_code: 'managed_path_invalid' })
            continue
          }
          try {
            await this.io.unlink(join(directory, entry.name))
            add({ kind, status: 'completed' })
          } catch (error) {
            add(
              (error as NodeJS.ErrnoException).code === 'ENOENT'
                ? { kind, status: 'completed' }
                : { kind, status: 'failed', error_code: 'cleanup_failed' }
            )
          }
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
          add({ kind: 'directory', status: 'failed', error_code: 'cleanup_scan_failed' })
      }
    }
    await scan(join(lease.scope.directory, 'bodies', id), true)
    await scan(join(lease.scope.directory, 'records'), false)
    return summary
  }
  private async finish(lease: ScopeLease, tombstone: MemoryTombstone): Promise<DeletionResult> {
    this.records.assertWritable(lease)
    const cleanup = await this.clean(lease, tombstone.id)
    if (cleanup.failed || cleanup.skipped)
      return {
        outcome: 'partial',
        data: this.receipt(tombstone),
        error_code: 'deletion_pending',
        cleanup
      }
    const complete: MemoryTombstone = {
      ...tombstone,
      cleanup_state: 'complete',
      outcome: 'success'
    }
    const committed = await this.commit(lease, complete)
    if (committed !== 'success')
      return {
        outcome: committed === 'unknown' ? 'unknown' : 'partial',
        data: this.receipt(tombstone),
        error_code:
          committed === 'unknown' ? 'deletion_receipt_unknown' : 'deletion_receipt_pending',
        warnings: [{ code: 'content_cleanup_complete' }],
        cleanup
      }
    return { outcome: 'success', data: this.receipt(complete), cleanup }
  }
  async recoverScope(lease: ScopeLease): Promise<RecoveryResult> {
    const data = { scanned: 0, recovered: 0, pending: 0, skipped: 0 }
    const warnings: MemoryWarning[] = []
    const warn = (code: string, id?: string) => {
      if (warnings.length < 100) warnings.push({ code, ...(id ? { id } : {}) })
    }
    try {
      this.records.assertWritable(lease)
      const directory = join(lease.scope.directory, 'records')
      await this.records.assertManagedPath(lease, directory)
      const entries = await opendir(directory)
      // One bounded JSON read at a time; search's aggregate budget cannot disable deletion recovery.
      for await (const entry of entries) {
        if (!entry.name.endsWith('.json') || !isUuid(entry.name.slice(0, -5))) continue
        const id = entry.name.slice(0, -5)
        data.scanned++
        if (!entry.isFile()) {
          data.skipped++
          warn('managed_path_invalid', id)
          continue
        }
        try {
          const document = await this.records.readDocument(lease, id)
          if (!document || !('operation' in document) || document.cleanup_state === 'complete')
            continue
          const result = await this.finish(lease, document)
          if (result.outcome === 'success') data.recovered++
          else {
            data.pending++
            warn(result.error_code ?? 'deletion_pending', id)
          }
          if (lease.unknown)
            return { outcome: 'unknown', data, warnings, error_code: 'scope_commit_unknown' }
        } catch (error) {
          data.skipped++
          warn(this.failure(error).error_code ?? 'record_unavailable', id)
        }
      }
      return { outcome: data.pending || data.skipped ? 'partial' : 'success', data, warnings }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        return { outcome: 'success', data, warnings }
      return { ...this.failure(error), data, warnings }
    }
  }
}
