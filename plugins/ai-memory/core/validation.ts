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
  if (typeof v !== 'string' || v.includes('\0') || [...v].length > max) return invalid()
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
