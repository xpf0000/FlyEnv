import Store from 'electron-store'
import { randomUUID } from 'crypto'
import { type Options } from 'electron-store'

/**
 * MCP Server 配置 —— 独立于 user.json 的 electron-store（落盘为 mcp.json）。
 * 之所以单拆一个 store，是因为现有 ConfigManager 的 ConfigOptions 已相当臃肿，
 * MCP 的开关 / 端口 / token / 工具白名单 / 审批策略不应再往里塞。
 */
export interface MCPConfigOptions {
  /** MCP Server 是否启用（用户在面板里的开关，决定 App 启动时是否自动拉起） */
  enabled: boolean
  /** 传输方式开关。一期只实现 http；stdio 预留 */
  transport: {
    http: boolean
    stdio: boolean
  }
  /** 监听地址，默认仅回环 */
  host: string
  /** 监听端口 */
  port: number
  /** Bearer token，启动时若为空则自动生成 */
  token: string
  /** 工具白名单：只有列在这里的 tool 才会注册给 MCP Client */
  enabledTools: string[]
  /** 各 tool 的审批策略：auto 直接执行，confirm 需要原生确认框 */
  approval: Record<string, 'auto' | 'confirm'>
  /** 是否允许非回环地址访问。默认 false（强制 127.0.0.1） */
  allowRemote: boolean
  /**
   * 是否对出站内容做密钥掩码（日志/配置里的 password= 等）。默认 false。
   * FlyEnv 是本地开发工具，bin/path/凭据本就是 AI 代理执行任务所需，默认不屏蔽；
   * 仅给「会共享屏幕 / 担心云端日志」的谨慎用户保留可选开关。
   */
  maskSecrets: boolean
}

/**
 * 默认开启的工具：只读 + 启停。写配置 / 安装 / 删除站点等高风险工具默认不在白名单内。
 * 与方案 §5.3「默认安全」对齐。
 */
export const MCP_DEFAULT_ENABLED_TOOLS: string[] = [
  'list_services',
  'service_status',
  'read_log',
  'list_sites',
  'start_service',
  'stop_service',
  'restart_service'
]

/** 高风险工具：即使被加入白名单，默认也要求确认 */
export const MCP_DEFAULT_APPROVAL: Record<string, 'auto' | 'confirm'> = {
  start_service: 'confirm',
  stop_service: 'confirm',
  restart_service: 'confirm'
}

export const MCP_DEFAULT_PORT = 7682
export const MCP_DEFAULT_HOST = '127.0.0.1'

export default class MCPConfigManager {
  config?: Store<MCPConfigOptions>

  constructor() {
    this.initConfig()
  }

  initConfig() {
    const options: Options<MCPConfigOptions> = {
      name: 'mcp',
      defaults: {
        enabled: false,
        transport: {
          http: true,
          stdio: false
        },
        host: MCP_DEFAULT_HOST,
        port: MCP_DEFAULT_PORT,
        token: '',
        enabledTools: [...MCP_DEFAULT_ENABLED_TOOLS],
        approval: { ...MCP_DEFAULT_APPROVAL },
        allowRemote: false,
        maskSecrets: false
      }
    }
    this.config = new Store<MCPConfigOptions>(options)

    // 首次启动或 token 丢失时生成一个随机 token
    if (!this.config.get('token')) {
      this.config.set('token', randomUUID().replace(/-/g, ''))
    }
  }

  getConfig(key?: any, defaultValue?: any) {
    if (typeof key === 'undefined' && typeof defaultValue === 'undefined') {
      return this.config?.store
    }
    return this.config?.get(key, defaultValue)
  }

  setConfig(key: string | Partial<MCPConfigOptions>, ...args: any) {
    // @ts-ignore electron-store 同时支持 set(key, value) 与 set(object)
    this.config?.set(key, ...args)
    return this.config?.store
  }

  /** 重置为默认值，并重新生成 token */
  reset() {
    this.config?.clear()
    this.initConfig()
  }
}
