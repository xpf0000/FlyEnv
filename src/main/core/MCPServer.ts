import { createServer, type Server as HttpServer, type IncomingMessage, type ServerResponse } from 'http'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema
} from '@modelcontextprotocol/sdk/types.js'
import type { ForkManager } from './ForkManager'
import type MCPConfigManager from './MCPConfigManager'
import { MCPTools, textResult } from './MCPTools'
import type { MCPToolResult } from './MCPTools'

/**
 * MCPServer —— FlyEnv 作为 MCP Server 的宿主（main 进程内）。
 *
 * 设计要点（见方案 §4）：
 *   - 跑在 main 进程，长期持有 ForkManager 句柄
 *   - 一期只实现 Streamable HTTP transport，绑定 127.0.0.1
 *   - Bearer token 鉴权；非回环访问默认拒绝
 *   - 工具白名单 + 审批策略由 MCPConfigManager 提供
 */

/** 工具定义：name + 描述 + JSON Schema（不依赖 zod，手写 inputSchema） */
interface ToolDef {
  name: string
  description: string
  inputSchema: Record<string, any>
  /** 是否高风险（用于审批策略默认值与提示） */
  risky?: boolean
  handler: (args: Record<string, any>) => Promise<MCPToolResult>
}

const MODULE_FLAGS = [
  'nginx',
  'apache',
  'caddy',
  'php',
  'mysql',
  'mariadb',
  'postgresql',
  'redis',
  'memcached',
  'mongodb'
]

export default class MCPServer {
  private mcpConfig: MCPConfigManager
  private tools: MCPTools

  private httpServer?: HttpServer
  private running = false
  private toolDefs: ToolDef[] = []

  constructor(
    forkManager: ForkManager,
    mcpConfig: MCPConfigManager,
    appConfig?: { getConfig: (k?: any, d?: any) => any; setConfig: (k: string, ...a: any) => any }
  ) {
    this.mcpConfig = mcpConfig
    this.tools = new MCPTools(forkManager, mcpConfig, appConfig)
    this.buildToolDefs()
  }

  isRunning() {
    return this.running
  }

  status() {
    const cfg = this.mcpConfig.getConfig() as any
    return {
      running: this.running,
      host: cfg?.host,
      port: cfg?.port,
      token: cfg?.token,
      transport: cfg?.transport,
      enabledTools: cfg?.enabledTools ?? []
    }
  }

  /** 当前白名单允许的工具定义 */
  private enabledToolDefs(): ToolDef[] {
    const enabled: string[] = (this.mcpConfig.getConfig('enabledTools', []) as string[]) ?? []
    return this.toolDefs.filter((t) => enabled.includes(t.name))
  }

  private buildToolDefs() {
    const flagEnum = { type: 'string', enum: MODULE_FLAGS }

    this.toolDefs = [
      {
        name: 'list_services',
        description:
          'List FlyEnv-managed services with their installed versions and running state. Returns a map keyed by service flag.',
        inputSchema: {
          type: 'object',
          properties: {
            flags: {
              type: 'array',
              items: flagEnum,
              description: 'Service flags to query. Omit to query the common set.'
            }
          }
        },
        handler: async (args) => {
          const flags: string[] =
            Array.isArray(args?.flags) && args.flags.length ? args.flags : MODULE_FLAGS
          return textResult(await this.tools.listServices(flags))
        }
      },
      {
        name: 'service_status',
        description: 'Get installed versions and running state for a single FlyEnv service.',
        inputSchema: {
          type: 'object',
          properties: { flag: flagEnum },
          required: ['flag']
        },
        handler: async (args) => textResult(await this.tools.serviceStatus(args.flag))
      },
      {
        name: 'list_sites',
        description:
          'List local development sites managed by FlyEnv (domain, root, type, PHP version, SSL).',
        inputSchema: { type: 'object', properties: {} },
        handler: async () => textResult(await this.tools.listSites())
      },
      {
        name: 'list_log_files',
        description:
          'List a service\'s log files as {name, path, exists}. Returns paths only (not contents) — read the files yourself. Supported: nginx, apache, mysql, mariadb, redis, mongodb, postgresql.',
        inputSchema: {
          type: 'object',
          properties: {
            flag: flagEnum,
            version: { type: 'string', description: 'Version for version-scoped paths.' }
          },
          required: ['flag']
        },
        handler: async (args) => textResult(await this.tools.listLogFiles(args.flag, args.version))
      },
      {
        name: 'list_config_files',
        description:
          'List a service\'s config files as {name, path, exists}. Returns paths only (not contents) — read the files yourself. Supported: nginx, apache, mysql, mariadb, redis, mongodb, postgresql. Pass version for version-scoped configs (redis/mongodb/postgresql/apache/mysql/mariadb).',
        inputSchema: {
          type: 'object',
          properties: {
            flag: flagEnum,
            version: { type: 'string', description: 'Version for version-scoped configs.' }
          },
          required: ['flag']
        },
        handler: async (args) =>
          textResult(await this.tools.listConfigFiles(args.flag, args.version))
      },
      {
        name: 'start_service',
        description: 'Start a FlyEnv service. Optionally specify an installed version.',
        risky: true,
        inputSchema: {
          type: 'object',
          properties: { flag: flagEnum, version: { type: 'string' } },
          required: ['flag']
        },
        handler: async (args) => {
          await this.tools.startService(args.flag, args.version)
          return textResult(`${args.flag} started`)
        }
      },
      {
        name: 'stop_service',
        description:
          'Stop a FlyEnv service. With "version", stops only that version; without it, stops all running versions of the service.',
        risky: true,
        inputSchema: {
          type: 'object',
          properties: { flag: flagEnum, version: { type: 'string' } },
          required: ['flag']
        },
        handler: async (args) => {
          if (args.version) {
            await this.tools.stopService(args.flag, args.version)
            return textResult(`${args.flag} ${args.version} stopped`)
          }
          const res = await this.tools.stopAllService(args.flag)
          return textResult(
            `${args.flag} stopped${res?.stopped?.length ? ` (${res.stopped.join(', ')})` : ''}`
          )
        }
      },
      {
        name: 'restart_service',
        description: 'Restart a FlyEnv service.',
        risky: true,
        inputSchema: {
          type: 'object',
          properties: { flag: flagEnum, version: { type: 'string' } },
          required: ['flag']
        },
        handler: async (args) => {
          await this.tools.restartService(args.flag, args.version)
          return textResult(`${args.flag} restarted`)
        }
      }
    ]
  }

  /** 创建一个 MCP Server 实例并注册 handlers（每个连接一个 transport，但 Server 逻辑共享定义） */
  private createMcpServer(): Server {
    const server = new Server(
      { name: 'flyenv', version: '1.0.0' },
      { capabilities: { tools: {}, resources: {} } }
    )

    server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: this.enabledToolDefs().map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema
        }))
      }
    })

    server.setRequestHandler(CallToolRequestSchema, async (request: any): Promise<any> => {
      const name = request?.params?.name
      const args = request?.params?.arguments ?? {}
      const def = this.enabledToolDefs().find((t) => t.name === name)
      if (!def) {
        return textResult(`Tool not enabled or unknown: ${name}`, true)
      }
      try {
        return await def.handler(args)
      } catch (e) {
        return textResult(`Tool ${name} failed: ${e instanceof Error ? e.message : e}`, true)
      }
    })

    server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: [
          { uri: 'flyenv://services', name: 'FlyEnv services', mimeType: 'application/json' },
          { uri: 'flyenv://sites', name: 'FlyEnv local sites', mimeType: 'application/json' }
        ]
      }
    })

    server.setRequestHandler(ReadResourceRequestSchema, async (request: any) => {
      const uri = request?.params?.uri
      let data: any
      if (uri === 'flyenv://services') {
        data = await this.tools.listServices(MODULE_FLAGS)
      } else if (uri === 'flyenv://sites') {
        data = await this.tools.listSites()
      } else {
        throw new Error(`Unknown resource: ${uri}`)
      }
      return {
        contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(data, null, 2) }]
      }
    })

    return server
  }

  /** 校验请求鉴权 + 来源 */
  private checkAuth(req: IncomingMessage): { ok: boolean; reason?: string } {
    const cfg = this.mcpConfig.getConfig() as any
    // 来源限制：非回环且未允许远程 → 拒绝
    const remoteAddr = req.socket.remoteAddress ?? ''
    const isLoopback =
      remoteAddr === '127.0.0.1' ||
      remoteAddr === '::1' ||
      remoteAddr === '::ffff:127.0.0.1' ||
      remoteAddr.endsWith('127.0.0.1')
    if (!cfg?.allowRemote && !isLoopback) {
      return { ok: false, reason: 'remote access disabled' }
    }
    // token 校验
    const token: string = cfg?.token ?? ''
    if (token) {
      const auth = req.headers['authorization'] ?? ''
      const provided = Array.isArray(auth) ? auth[0] : auth
      if (provided !== `Bearer ${token}`) {
        return { ok: false, reason: 'invalid token' }
      }
    }
    return { ok: true }
  }

  async start(): Promise<{ running: boolean; port: number; host: string }> {
    if (this.running) {
      const cfg = this.mcpConfig.getConfig() as any
      return { running: true, port: cfg?.port, host: cfg?.host }
    }
    const cfg = this.mcpConfig.getConfig() as any
    const host: string = cfg?.allowRemote ? cfg?.host : '127.0.0.1'
    const port: number = cfg?.port ?? 7682

    const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      const auth = this.checkAuth(req)
      if (!auth.ok) {
        res.writeHead(401, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: auth.reason }))
        return
      }
      try {
        // 每个请求新建一个无状态 transport + server（stateless 模式：sessionIdGenerator: undefined）
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
        const server = this.createMcpServer()
        res.on('close', () => {
          transport.close().catch(() => {})
          server.close().catch(() => {})
        })
        await server.connect(transport)
        await transport.handleRequest(req, res)
      } catch (e) {
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: `${e instanceof Error ? e.message : e}` }))
        }
      }
    })

    await new Promise<void>((resolve, reject) => {
      httpServer.once('error', reject)
      httpServer.listen(port, host, () => {
        httpServer.removeListener('error', reject)
        resolve()
      })
    })

    this.httpServer = httpServer
    this.running = true
    return { running: true, port, host }
  }

  async stop(): Promise<{ running: boolean }> {
    if (this.httpServer) {
      await new Promise<void>((resolve) => {
        this.httpServer!.close(() => resolve())
      })
      this.httpServer = undefined
    }
    this.running = false
    return { running: false }
  }
}
