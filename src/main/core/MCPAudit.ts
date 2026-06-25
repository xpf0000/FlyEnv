import { appendFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

export interface MCPAuditEntry {
  time: string
  tool: string
  args: Record<string, any>
  success: boolean
  error?: string
}

/**
 * MCP 工具调用审计日志。
 *
 * 所有 tool 调用（无论成败）都会追加到 `global.Server.BaseDir/mcp/audit.log`，
 * 方便用户在 Audit.vue 中查看 AI 客户端对 FlyEnv 做了什么操作。
 */
class MCPAudit {
  private logFile: string

  constructor() {
    this.logFile = join(global.Server.BaseDir!, 'mcp', 'audit.log')
  }

  private ensureDir() {
    const dir = dirname(this.logFile)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
  }

  log(tool: string, args: Record<string, any>, success: boolean, error?: string) {
    try {
      this.ensureDir()
      const entry: MCPAuditEntry = {
        time: new Date().toISOString(),
        tool,
        args: this.sanitizeArgs(args),
        success,
        error
      }
      appendFileSync(this.logFile, JSON.stringify(entry) + '\n', 'utf-8')
    } catch (e) {
      console.log('MCP audit log error: ', e)
    }
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
