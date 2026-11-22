const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const outcomes = new Set([
  'success',
  'partial',
  'failed',
  'conflict',
  'unknown',
  'deleted',
  'already_deleted',
  'busy',
  'cancelled',
  'disabled'
])
export const PLUGIN_ERROR_CODES = new Set([
  'tool_unavailable',
  'tool_disabled',
  'plugin_stale_generation',
  'plugin_owner_stopping',
  'plugin_owner_busy',
  'plugin_closed_or_stopping',
  'plugin_unavailable',
  'plugin_initialization_failed',
  'plugin_exit_timeout',
  'plugin_result_unknown',
  'plugin_request_failed',
  'invalid_input',
  'cancelled',
  'operation_failed'
])
export type PluginAuditEntry = {
  call_id: number
  time: string
  tool: string
  pluginId?: string
  id?: string
  request_id?: string
  revision?: number
  outcome: string
  duration_ms?: number
  hit_count?: number
  truncated?: boolean
  error_code?: string
  client?: { name: string; version?: string; source: 'self-reported' }
  request?: Record<string, any>
  response?: Record<string, any>
}
type AuditInput = {
  args?: any
  result?: any
  durationMs?: number
  client?: { name?: string; version?: string }
}

const withoutContent = (value: any): any => {
  if (Array.isArray(value)) return value.map(withoutContent)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== 'content')
      .map(([key, item]) => [key, withoutContent(item)])
  )
}

const requestFields: Record<string, string[]> = {
  flyenv_memory_search: [
    'scope',
    'project_path',
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
  flyenv_memory_get: ['scope', 'project_path', 'id', 'revision'],
  flyenv_memory_store: [
    'scope',
    'project_path',
    'type',
    'topic',
    'title',
    'summary',
    'tags',
    'source',
    'status',
    'pinned',
    'expires_at',
    'occurred_at',
    'request_id',
    'create_project'
  ],
  flyenv_memory_update: [
    'scope',
    'project_path',
    'id',
    'expected_revision',
    'request_id',
    'reason',
    'changes'
  ],
  flyenv_memory_forget: ['scope', 'project_path', 'id', 'expected_revision', 'request_id']
}

const requestSnapshot = (tool: string, args: any) => {
  const snapshot = Object.fromEntries(
    (requestFields[tool] ?? [])
      .filter((key) => key !== 'cursor' && args?.[key] !== undefined)
      .map((key) => [key, withoutContent(args[key])])
  )
  if (tool === 'flyenv_memory_search' && args?.cursor !== undefined) snapshot.cursor_provided = true
  return snapshot
}

const responseSnapshot = (tool: string, result: any) => {
  const outcome = outcomes.has(result?.outcome) ? result.outcome : 'failed'
  const detailed = requestFields[tool] !== undefined
  const errorCode = result?.error_code
  const knownError =
    PLUGIN_ERROR_CODES.has(errorCode) || (detailed && errorCode === 'project_unregistered')
  const snapshot = withoutContent({
    outcome,
    ...(errorCode !== undefined ? { error_code: knownError ? errorCode : 'operation_failed' } : {}),
    ...(detailed && result?.data !== undefined ? { data: result.data } : {}),
    ...(detailed && result?.warnings !== undefined ? { warnings: result.warnings } : {}),
    ...(result?.isError !== undefined ? { isError: result.isError === true } : {})
  })
  if (tool === 'flyenv_memory_search' && snapshot.data?.next_cursor !== undefined) {
    snapshot.data.has_next_cursor = true
    delete snapshot.data.next_cursor
  }
  return snapshot
}

/** Only this projection may retain plugin call details; content and raw errors are excluded. */
export class PluginMCPAudit {
  private readonly tools = new Map<string, string>()
  private readonly entries: PluginAuditEntry[] = []
  private sequence = 0
  register(pluginId: string, names: string[]) {
    for (const name of names) this.tools.set(name, pluginId)
  }
  has(tool: string) {
    return this.tools.has(tool)
  }
  owner(tool: string) {
    return this.tools.get(tool)
  }
  log(tool: string, input: AuditInput = {}) {
    const pluginId = this.tools.get(tool)
    const result = input.result
    const response = responseSnapshot(tool, result)
    const row: PluginAuditEntry = {
      call_id: ++this.sequence,
      time: new Date().toISOString(),
      tool: pluginId ? tool : 'unknown_tool',
      ...(pluginId ? { pluginId } : {}),
      outcome: outcomes.has(result?.outcome) ? result.outcome : 'failed',
      request: requestSnapshot(tool, input.args),
      response,
      ...(response.error_code !== undefined ? { error_code: response.error_code } : {})
    }
    for (const key of ['id', 'request_id'] as const) {
      const value = result?.[key] ?? result?.data?.[key] ?? input.args?.[key]
      if (typeof value === 'string' && uuid.test(value)) row[key] = value
    }
    const revision = result?.revision ?? result?.data?.revision
    if (Number.isSafeInteger(revision) && revision > 0) row.revision = revision
    if (Number.isFinite(input.durationMs) && input.durationMs! >= 0)
      row.duration_ms = Math.round(input.durationMs!)
    const hits = result?.data?.results ?? result?.data?.hits
    if (Array.isArray(hits)) row.hit_count = hits.length
    if (typeof result?.data?.truncated === 'boolean') row.truncated = result.data.truncated
    if (input.client) {
      const name = ['codex', 'kimi', 'claude', 'claude-code', 'flyenv'].includes(
        input.client.name?.toLowerCase() ?? ''
      )
        ? input.client.name!.toLowerCase()
        : 'other'
      const version = input.client.version
      row.client = {
        name,
        source: 'self-reported',
        ...(typeof version === 'string' && /^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(version)
          ? { version }
          : {})
      }
    }
    this.entries.push(row)
    if (this.entries.length > 200) this.entries.shift()
  }
  list(pluginId: string) {
    return this.entries
      .filter((row) => row.pluginId === pluginId)
      .map((row) => structuredClone(row))
  }
}
export const pluginMCPAudit = new PluginMCPAudit()
