import { MEMORY_TYPES, type MemoryInputs, type MemoryMethod, type MemoryOutcome } from '../shared'
import { INPUT_LIMITS as L, utf8Bytes } from './limits'

export class MemoryFault extends Error {
  constructor(
    readonly code: string,
    readonly outcome: MemoryOutcome = 'failed'
  ) {
    super(code)
  }
}
const invalid = (): never => {
  throw new MemoryFault('invalid_input')
}
export const isUuid = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
function object(v: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return invalid()
  if (Object.keys(v).some((k) => !keys.includes(k))) return invalid()
  return v as Record<string, unknown>
}
function text(v: unknown, max: number, trim = true): string {
  if (
    typeof v !== 'string' ||
    v.includes('\0') ||
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(v) ||
    [...v].length > max
  )
    return invalid()
  const result = trim ? v.trim() : v
  if (!result) return invalid()
  return result
}
function integer(v: unknown, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 1 || v > max) return invalid()
  return v
}
function boolean(v: unknown): boolean {
  if (typeof v !== 'boolean') return invalid()
  return v
}
function uuid(v: unknown): string {
  if (!isUuid(v)) return invalid()
  return v.toLowerCase()
}
function strings(v: unknown, count: number, length: number): string[] {
  if (!Array.isArray(v) || v.length > count) return invalid()
  return v.map((item) => text(item, length))
}
const normalize = (v: string) => v.normalize('NFKC').toLowerCase()
function tags(v: unknown): string[] {
  return [...new Set(strings(v, L.tags, L.tag).map(normalize))]
}
function timestamp(v: unknown): string | null {
  if (v === null) return null
  const result = text(v, 40)
  if (
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(result) ||
    !Number.isFinite(Date.parse(result))
  )
    return invalid()
  const [date] = result.split('T')
  if (new Date(result).toISOString().slice(0, 10) !== date) return invalid()
  return new Date(result).toISOString()
}
const draftKeys = [
  'type',
  'topic',
  'title',
  'summary',
  'tags',
  'content',
  'source',
  'status',
  'pinned',
  'expires_at',
  'occurred_at'
] as const
function draft(v: Record<string, unknown>, partial: boolean): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (
    !partial &&
    ['type', 'topic', 'title', 'summary', 'tags', 'content', 'source'].some(
      (k) => v[k] === undefined
    )
  )
    return invalid()
  for (const key of draftKeys) {
    if (v[key] === undefined) continue
    const value = v[key]
    switch (key) {
      case 'type':
        if (!MEMORY_TYPES.includes(value as never)) return invalid()
        out[key] = value
        break
      case 'title':
      case 'summary':
      case 'topic':
        out[key] = text(value, L[key])
        break
      case 'tags':
        out[key] = tags(value)
        break
      case 'content': {
        const content = text(value, L.bodyBytes, false)
        if (utf8Bytes(content) > L.bodyBytes) return invalid()
        out[key] = content
        break
      }
      case 'source': {
        const source = object(value, ['kind', 'agent', 'description', 'uri', 'session_id'])
        if (
          !['user_statement', 'tool_result', 'document', 'agent_inference'].includes(
            source.kind as string
          )
        )
          return invalid()
        out[key] = {
          kind: source.kind,
          agent: text(source.agent, L.agent),
          description: text(source.description, L.description),
          ...(source.uri === undefined ? {} : { uri: text(source.uri, L.uri) }),
          ...(source.session_id === undefined
            ? {}
            : { session_id: text(source.session_id, L.session) })
        }
        break
      }
      case 'status':
        if (value !== 'active' && value !== 'archived') return invalid()
        out[key] = value
        break
      case 'pinned':
        out[key] = boolean(value)
        break
      case 'expires_at':
      case 'occurred_at':
        out[key] = timestamp(value)
        break
    }
  }
  if (partial && Object.keys(out).length === 0) return invalid()
  return out
}
const methodKeys = {
  search: [
    'queries',
    'type',
    'topic',
    'tags',
    'include_global',
    'status',
    'include_expired',
    'limit',
    'cursor'
  ],
  get: ['id', 'revision'],
  store: [...draftKeys, 'request_id', 'create_project'],
  update: ['id', 'expected_revision', 'changes', 'reason', 'request_id'],
  forget: ['id', 'expected_revision', 'request_id']
} as const
export function validateInput<M extends MemoryMethod>(method: M, input: unknown): MemoryInputs[M] {
  if (!Object.hasOwn(methodKeys, method)) return invalid()
  const v = object(input, ['scope', 'project_path', ...methodKeys[method]])
  const out: Record<string, unknown> = { scope: v.scope }
  if (v.scope === 'project') {
    const path = text(v.project_path, L.path, false)
    if (!/^(?:\/|[A-Za-z]:[\\/]|\\\\[^\\]+\\[^\\]+)/.test(path)) return invalid()
    out.project_path = path
  } else if (v.scope !== 'global' || v.project_path !== undefined) return invalid()
  if (method === 'store') {
    Object.assign(out, draft(v, false), {
      request_id: uuid(v.request_id),
      status: v.status ?? 'active',
      pinned: v.pinned ?? false
    })
    if (v.create_project !== undefined) {
      if (v.scope !== 'project') return invalid()
      out.create_project = boolean(v.create_project)
    }
  } else if (method === 'update') {
    Object.assign(out, {
      id: uuid(v.id),
      expected_revision: integer(v.expected_revision),
      request_id: uuid(v.request_id),
      reason: text(v.reason, L.reason),
      changes: draft(object(v.changes, draftKeys), true)
    })
  } else if (method === 'forget') {
    Object.assign(out, {
      id: uuid(v.id),
      expected_revision: integer(v.expected_revision),
      request_id: uuid(v.request_id)
    })
  } else if (method === 'get') {
    out.id = uuid(v.id)
    if (v.revision !== undefined) out.revision = integer(v.revision)
  } else {
    out.limit = v.limit === undefined ? 8 : integer(v.limit, L.searchLimit)
    if (v.queries !== undefined) out.queries = strings(v.queries, L.queries, L.query)
    if (v.tags !== undefined) out.tags = tags(v.tags)
    if (v.topic !== undefined) out.topic = text(v.topic, L.topic)
    if (v.type !== undefined) {
      if (!MEMORY_TYPES.includes(v.type as never)) return invalid()
      out.type = v.type
    }
    if (v.status !== undefined) {
      if (v.status !== 'active' && v.status !== 'archived') return invalid()
      out.status = v.status
    }
    if (v.include_global !== undefined) {
      if (v.scope !== 'project') return invalid()
      out.include_global = boolean(v.include_global)
    }
    if (v.include_expired !== undefined) out.include_expired = boolean(v.include_expired)
    if (v.cursor !== undefined) out.cursor = text(v.cursor, L.cursor)
  }
  return out as MemoryInputs[M]
}

/** Validate persisted JSON without reading any Markdown body. */
export function validateRecordDocument(
  value: unknown,
  id: string
): import('../shared').MemoryRecord | import('../shared').MemoryTombstone {
  const corrupt = (): never => {
    throw new MemoryFault('record_corrupt')
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return corrupt()
  const raw = value as Record<string, any>
  if (raw.schema_version !== 1) throw new MemoryFault('record_schema_unsupported')
  if (!isUuid(id)) return corrupt()
  const digest = (v: unknown) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v)
  try {
    if (raw.operation === 'forget') {
      object(raw, [
        'schema_version',
        'id',
        'deleted_revision',
        'operation',
        'request_id',
        'request_digest',
        'cleanup_state',
        'outcome'
      ])
      if (
        raw.id !== id ||
        integer(raw.deleted_revision) < 2 ||
        !isUuid(raw.request_id) ||
        !digest(raw.request_digest) ||
        !['pending', 'complete'].includes(raw.cleanup_state) ||
        raw.outcome !== (raw.cleanup_state === 'complete' ? 'success' : 'partial')
      )
        return corrupt()
      return raw as import('../shared').MemoryTombstone
    }
    object(raw, ['schema_version', 'current', 'history'])
    if (!Array.isArray(raw.history) || !raw.current) return corrupt()
    const receipts = new Set<string>()
    for (const [index, snapshot] of [...raw.history, raw.current].entries()) {
      object(snapshot, [
        ...draftKeys.filter((key) => key !== 'content'),
        'id',
        'revision',
        'created_at',
        'updated_at',
        'change_reason',
        'body_ref',
        'body_sha256',
        'body_bytes',
        'receipt'
      ])
      if (
        snapshot.id !== id ||
        snapshot.revision !== index + 1 ||
        !digest(snapshot.body_sha256) ||
        integer(snapshot.body_bytes, L.bodyBytes) < 1
      )
        return corrupt()
      if (
        typeof snapshot.body_ref !== 'string' ||
        !snapshot.body_ref.startsWith(`${id}/`) ||
        !snapshot.body_ref.endsWith('.md') ||
        !isUuid(snapshot.body_ref.slice(id.length + 1, -3))
      )
        return corrupt()
      const metadata = Object.fromEntries(
        draftKeys
          .filter((key) => key !== 'content')
          .filter((key) => snapshot[key] !== undefined)
          .map((key) => [key, snapshot[key]])
      )
      draft({ ...metadata, content: 'validated separately' }, false)
      if (!['active', 'archived'].includes(snapshot.status) || typeof snapshot.pinned !== 'boolean')
        return corrupt()
      if (
        typeof snapshot.created_at !== 'string' ||
        typeof snapshot.updated_at !== 'string' ||
        timestamp(snapshot.created_at) !== snapshot.created_at ||
        timestamp(snapshot.updated_at) !== snapshot.updated_at ||
        snapshot.created_at !== raw.current.created_at
      )
        return corrupt()
      text(snapshot.change_reason, L.reason)
      if (index === 0 && snapshot.change_reason !== 'initial') return corrupt()
      const receipt = object(snapshot.receipt, [
        'operation',
        'request_id',
        'request_digest',
        'result_revision'
      ])
      if (
        receipt.operation !== (index === 0 ? 'store' : 'update') ||
        !isUuid(receipt.request_id) ||
        !digest(receipt.request_digest) ||
        receipt.result_revision !== snapshot.revision
      )
        return corrupt()
      const key = `${receipt.operation}:${receipt.request_id}`
      if (receipts.has(key)) return corrupt()
      receipts.add(key)
    }
    return raw as import('../shared').MemoryRecord
  } catch {
    return corrupt()
  }
}
