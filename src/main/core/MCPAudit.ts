import { appendFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { MCP_ALL_TOOLS } from '@shared/mcpToolCatalog'
import { PLUGIN_ERROR_CODES, pluginMCPAudit } from './PluginMCPAudit'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const pluginOutcomes = new Set([
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

export interface MCPAuditEntry {
  time: string
  tool: string
  args: Record<string, any>
  success: boolean
  error?: string
  pluginId?: string
  id?: string
  request_id?: string
  revision?: number
  outcome?: string
  duration_ms?: number
  client?: { name: string; version?: string; source: 'self-reported' }
}

/**
 * MCP 工具调用审计日志。
 *
 * 所有 tool 调用与 resource 读取（无论成败）都会追加到 `global.Server.BaseDir/mcp/audit.log`，
 * 方便用户在 Audit.vue 中查看 AI 客户端对 FlyEnv 做了什么操作。
 */
class MCPAudit {
  private get logFile(): string {
    return join(global.Server.BaseDir!, 'mcp', 'audit.log')
  }

  private ensureDir() {
    const dir = dirname(this.logFile)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
  }

  private append(entry: MCPAuditEntry) {
    try {
      this.ensureDir()
      appendFileSync(this.logFile, JSON.stringify(entry) + '\n', 'utf-8')
    } catch (e) {
      console.log('MCP audit log error: ', e)
    }
  }

  log(tool: string, args: Record<string, any>, success: boolean, error?: string) {
    if (
      pluginMCPAudit.has(tool) ||
      (!(MCP_ALL_TOOLS as readonly string[]).includes(tool) && tool !== 'read_resource')
    ) {
      try {
        pluginMCPAudit.log(tool, { args, result: { outcome: success ? 'success' : 'failed' } })
      } catch (e) {
        console.log('MCP audit log error: ', e)
      }
      return
    }
    this.append({
      time: new Date().toISOString(),
      tool,
      args: this.sanitizeArgs(args),
      success,
      error
    })
  }

  logPlugin(
    tool: string,
    pluginId: string,
    input: {
      args?: any
      result?: any
      durationMs?: number
      client?: { name?: string; version?: string }
    }
  ) {
    const result = input.result
    const outcome = pluginOutcomes.has(result?.outcome) ? result.outcome : 'failed'
    const entry: MCPAuditEntry = {
      time: new Date().toISOString(),
      tool,
      pluginId,
      args: {},
      success: ['success', 'already_deleted'].includes(outcome),
      outcome,
      ...(result?.error_code !== undefined
        ? {
            error: PLUGIN_ERROR_CODES.has(result.error_code)
              ? result.error_code
              : 'operation_failed'
          }
        : {})
    }
    for (const key of ['id', 'request_id'] as const) {
      const value = result?.[key] ?? result?.data?.[key] ?? input.args?.[key]
      if (typeof value === 'string' && uuid.test(value)) entry[key] = value
    }
    const revision = result?.revision ?? result?.data?.revision
    if (Number.isSafeInteger(revision) && revision > 0) entry.revision = revision
    if (Number.isFinite(input.durationMs) && input.durationMs! >= 0)
      entry.duration_ms = Math.round(input.durationMs!)
    if (input.client) {
      const name = ['codex', 'kimi', 'claude', 'claude-code', 'flyenv'].includes(
        input.client.name?.toLowerCase() ?? ''
      )
        ? input.client.name!.toLowerCase()
        : 'other'
      const version = input.client.version
      entry.client = {
        name,
        source: 'self-reported',
        ...(typeof version === 'string' && /^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(version)
          ? { version }
          : {})
      }
    }
    this.append(entry)
  }

  /** 避免日志里出现过长内容（如整段配置文件） */
  private sanitizeArgs(args: Record<string, any>): Record<string, any> {
    const out: Record<string, any> = {}
    for (const [k, v] of Object.entries(args)) {
      if (typeof v === 'string' && v.length > 500) {
        out[k] = v.slice(0, 500) + `...(${v.length} chars)`
      } else {
        out[k] = v
      }
    }
    return out
  }

  getLogFile(): string {
    return this.logFile
  }
}

export default new MCPAudit()
