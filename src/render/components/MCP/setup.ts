import IPC from '@/util/IPC'
import { reactiveBind } from '@/util/Index'
import { clipboard } from '@/util/NodeFn'
import { MessageError, MessageSuccess } from '@/util/Element'
import { I18nT } from '@lang/index'
import {
  buildHttpClientConfigSnippet,
  buildStdioClientConfigSnippet,
  getMcpServerUrl,
  type MCPHttpClientFlag
} from '@shared/mcpClientConfig'

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
  maskSecrets: boolean
}

export const ALL_TOOLS: string[] = [
  'list_services',
  'service_status',
  'list_log_files',
  'list_config_files',
  'list_online_versions',
  'list_sites',
  'start_service',
  'stop_service',
  'restart_service',
  'create_site',
  'update_site',
  'delete_site',
  'install_service'
]

export const RISKY_TOOLS: string[] = [
  'start_service',
  'stop_service',
  'restart_service',
  'create_site',
  'update_site',
  'delete_site',
  'install_service'
]

class MCP {
  loading = false
  starting = false
  running = false
  bridgePath = ''
  config: MCPConfig = {
    enabled: false,
    transport: { http: true, stdio: false },
    host: '127.0.0.1',
    port: 7682,
    token: '',
    enabledTools: [...ALL_TOOLS],
    approval: {
      start_service: 'confirm',
      stop_service: 'confirm',
      restart_service: 'confirm',
      create_site: 'confirm',
      update_site: 'confirm',
      delete_site: 'confirm',
      install_service: 'confirm'
    },
    allowRemote: false,
    maskSecrets: false
  }

  init() {
    this.fetchConfig()
    this.fetchStatus()
    this.fetchBridgePath()
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

  fetchBridgePath() {
    IPC.send('mcp:getBridgePath').then((key: string, res: any) => {
      IPC.off(key)
      if (res?.code === 0 && res?.data) {
        this.bridgePath = res.data
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

  start(): Promise<boolean> {
    return new Promise((resolve) => {
      if (this.starting) {
        resolve(false)
        return
      }
      this.starting = true
      IPC.send('mcp:start').then((key: string, res: any) => {
        IPC.off(key)
        this.starting = false
        if (res?.code === 0) {
          this.running = true
          MessageSuccess(I18nT('mcp.running'))
          resolve(true)
        } else {
          MessageError(res?.msg ?? I18nT('base.fail'))
          resolve(false)
        }
      })
    })
  }

  stop(): Promise<boolean> {
    return new Promise((resolve) => {
      if (this.starting) {
        resolve(false)
        return
      }
      this.starting = true
      IPC.send('mcp:stop').then((key: string, res: any) => {
        IPC.off(key)
        this.starting = false
        if (res?.code === 0) {
          this.running = false
          MessageSuccess(I18nT('mcp.stopped'))
          resolve(true)
        } else {
          MessageError(res?.msg ?? I18nT('base.fail'))
          resolve(false)
        }
      })
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

  setApproval(tool: string, policy: 'auto' | 'confirm') {
    this.saveConfig({
      approval: { ...this.config.approval, [tool]: policy }
    })
  }

  get serverUrl(): string {
    return getMcpServerUrl(this.config)
  }

  get clientConfigSnippet(): string {
    return this.httpConfigSnippet('claudeCode')
  }

  httpConfigSnippet(client: MCPHttpClientFlag): string {
    return buildHttpClientConfigSnippet(client, this.serverUrl, this.config.token)
  }

  get stdioConfigSnippet(): string {
    const bridgePath = this.bridgePath || '<FlyEnv>/mcp/flyenv-mcp-stdio.mjs'
    return buildStdioClientConfigSnippet(bridgePath, this.serverUrl, this.config.token)
  }

  copySnippet(client: MCPHttpClientFlag = 'claudeCode') {
    clipboard.writeText(this.httpConfigSnippet(client)).then(() => {
      MessageSuccess(I18nT('mcp.copied'))
    })
  }

  copyStdioSnippet() {
    clipboard.writeText(this.stdioConfigSnippet).then(() => {
      MessageSuccess(I18nT('mcp.copied'))
    })
  }

  /** 一键把 FlyEnv 注册进某个 AI CLI 的 MCP 列表（复用现有 addMcp） */
  addToClient(clientFlag: 'claudeCode' | 'codex' | 'openCode' | 'kimi') {
    // 各 CLI 对 HTTP/SSE 型 MCP 的 type 标识不同
    const typeMap: Record<typeof clientFlag, string> = {
      claudeCode: 'http',
      codex: 'http',
      openCode: 'remote',
      kimi: 'http'
    }
    return new Promise((resolve) => {
      IPC.send(
        `app-fork:${clientFlag}`,
        'addMcp',
        'flyenv',
        typeMap[clientFlag],
        this.serverUrl,
        this.config.token
      ).then((key: string, res: any) => {
        IPC.off(key)
        if (res?.code === 0) {
          MessageSuccess(I18nT('base.success'))
        } else {
          MessageError(res?.msg ?? I18nT('base.fail'))
        }
        resolve(res?.code === 0)
      })
    })
  }
}

export const MCPSetup = reactiveBind(new MCP())
