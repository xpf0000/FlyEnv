import IPC from '@/util/IPC'
import { reactiveBind } from '@/util/Index'
import { clipboard } from '@/util/NodeFn'
import { MessageError, MessageSuccess } from '@/util/Element'
import { I18nT } from '@lang/index'

export interface MCPStatus {
  running: boolean
  host: string
  port: number
  token: string
  transport: { http: boolean; stdio: boolean }
  enabledTools: string[]
}

export interface MCPConfig {
  enabled: boolean
  transport: { http: boolean; stdio: boolean }
  host: string
  port: number
  token: string
  enabledTools: string[]
  approval: Record<string, 'auto' | 'confirm'>
  allowRemote: boolean
}

export const ALL_TOOLS: string[] = [
  'list_services',
  'service_status',
  'read_log',
  'read_config',
  'list_sites',
  'start_service',
  'stop_service',
  'restart_service'
]

export const RISKY_TOOLS: string[] = ['start_service', 'stop_service', 'restart_service']

class MCP {
  loading = false
  starting = false
  running = false
  config: MCPConfig = {
    enabled: false,
    transport: { http: true, stdio: false },
    host: '127.0.0.1',
    port: 7682,
    token: '',
    enabledTools: [...ALL_TOOLS],
    approval: {},
    allowRemote: false
  }

  init() {
    this.fetchConfig()
    this.fetchStatus()
  }

  fetchConfig() {
    this.loading = true
    IPC.send('mcp:getConfig').then((key: string, res: any) => {
      IPC.off(key)
      if (res?.code === 0 && res?.data) {
        this.config = { ...this.config, ...res.data }
      }
      this.loading = false
    })
  }

  fetchStatus() {
    IPC.send('mcp:status').then((key: string, res: any) => {
      IPC.off(key)
      if (res?.code === 0 && res?.data) {
        this.running = !!res.data.running
      }
    })
  }

  saveConfig(patch: Partial<MCPConfig>) {
    return new Promise((resolve) => {
      IPC.send('mcp:setConfig', JSON.parse(JSON.stringify(patch))).then((key: string, res: any) => {
        IPC.off(key)
        if (res?.code === 0 && res?.data) {
          this.config = { ...this.config, ...res.data }
        }
        resolve(true)
      })
    })
  }

  start() {
    if (this.starting) return
    this.starting = true
    IPC.send('mcp:start').then((key: string, res: any) => {
      IPC.off(key)
      if (res?.code === 0) {
        this.running = true
        MessageSuccess(I18nT('mcp.running'))
      } else {
        MessageError(res?.msg ?? I18nT('base.fail'))
      }
      this.starting = false
    })
  }

  stop() {
    if (this.starting) return
    this.starting = true
    IPC.send('mcp:stop').then((key: string, res: any) => {
      IPC.off(key)
      if (res?.code === 0) {
        this.running = false
        MessageSuccess(I18nT('mcp.stopped'))
      } else {
        MessageError(res?.msg ?? I18nT('base.fail'))
      }
      this.starting = false
    })
  }

  toggleTool(tool: string, on: boolean) {
    const set = new Set(this.config.enabledTools)
    if (on) {
      set.add(tool)
    } else {
      set.delete(tool)
    }
    this.saveConfig({ enabledTools: Array.from(set) })
  }

  get serverUrl(): string {
    const host = this.config.host || '127.0.0.1'
    return `http://${host}:${this.config.port}`
  }

  get clientConfigSnippet(): string {
    const snippet = {
      mcpServers: {
        flyenv: {
          type: 'http',
          url: this.serverUrl,
          headers: {
            Authorization: `Bearer ${this.config.token}`
          }
        }
      }
    }
    return JSON.stringify(snippet, null, 2)
  }

  copySnippet() {
    clipboard.writeText(this.clientConfigSnippet).then(() => {
      MessageSuccess(I18nT('mcp.copied'))
    })
  }

  /** 一键把 FlyEnv 注册进某个 AI CLI 的 MCP 列表（复用现有 addMcp） */
  addToClient(clientFlag: 'claudeCode' | 'codex' | 'openCode') {
    return new Promise((resolve) => {
      IPC.send(`app-fork:${clientFlag}`, 'addMcp', 'flyenv', 'http', this.serverUrl).then(
        (key: string, res: any) => {
          IPC.off(key)
          if (res?.code === 0) {
            MessageSuccess(I18nT('base.success'))
          } else {
            MessageError(res?.msg ?? I18nT('base.fail'))
          }
          resolve(res?.code === 0)
        }
      )
    })
  }
}

export const MCPSetup = reactiveBind(new MCP())
