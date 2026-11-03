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
}
type AuditInput = {
  args?: any
  result?: any
  durationMs?: number
  client?: { name?: string; version?: string }
}

/** Only this projection may retain plugin diagnostics; never args, raw errors or worker reports. */
export class PluginMCPAudit {
  private readonly tools = new Map<string, string>()
  private readonly entries: PluginAuditEntry[] = []
  register(pluginId: string, names: string[]) {
    for (const name of names) this.tools.set(name, pluginId)
  }
  has(tool: string) {
    return this.tools.has(tool)
  }
  log(tool: string, input: AuditInput = {}) {
    const pluginId = this.tools.get(tool)
    const result = input.result
    const row: PluginAuditEntry = {
      time: new Date().toISOString(),
      tool: pluginId ? tool : 'unknown_tool',
      ...(pluginId ? { pluginId } : {}),
      outcome: outcomes.has(result?.outcome) ? result.outcome : 'failed'
    }
    for (const key of ['id', 'request_id'] as const) {
      const value = result?.[key] ?? input.args?.[key]
      if (typeof value === 'string' && uuid.test(value)) row[key] = value
    }
    if (Number.isSafeInteger(result?.revision) && result.revision > 0)
      row.revision = result.revision
    if (Number.isFinite(input.durationMs) && input.durationMs! >= 0)
      row.duration_ms = Math.round(input.durationMs!)
    if (Array.isArray(result?.data?.hits)) row.hit_count = result.data.hits.length
    if (typeof result?.data?.truncated === 'boolean') row.truncated = result.data.truncated
    if (PLUGIN_ERROR_CODES.has(result?.error_code)) row.error_code = result.error_code
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
