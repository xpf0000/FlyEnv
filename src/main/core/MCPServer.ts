import {
  createServer,
  type Server as HttpServer,
  type IncomingMessage,
  type ServerResponse
} from 'http'
import { dialog } from 'electron'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema
} from '@modelcontextprotocol/sdk/types.js'
import { AppModuleEnum } from '@/core/type'
import { getEnabledResourceDefs } from '@shared/mcpResourcePolicy'
import type { GetManagedFileMapInput } from '@shared/mcpContext'
import type { ForkManager } from './ForkManager'
import type MCPConfigManager from './MCPConfigManager'
import MCPAudit from './MCPAudit'
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

const MODULE_FLAGS = Object.values(AppModuleEnum)

function resultText(result: MCPToolResult): string | undefined {
  const parts = result?.content
    ?.filter((item) => item?.type === 'text' && typeof item?.text === 'string')
    .map((item) => item.text)
    .filter(Boolean)
  if (!parts?.length) {
    return undefined
  }
  return parts.join('\n')
}

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

  private enabledResourceDefs() {
    const enabled: string[] = (this.mcpConfig.getConfig('enabledTools', []) as string[]) ?? []
    return getEnabledResourceDefs(enabled)
  }

  private buildToolDefs() {
    const flagEnum = { type: 'string', enum: MODULE_FLAGS }
    const databaseFlagEnum = {
      type: 'string',
      enum: ['mysql', 'mariadb', 'postgresql', 'redis', 'mongodb', 'memcached']
    }

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
              description: 'Service flags to query. Omit or pass [] to return all cached services.'
            }
          }
        },
        handler: async (args) => textResult(await this.tools.listServices(args?.flags))
      },
      {
        name: 'service_status',
        description: 'Get installed versions and running state for a single FlyEnv service.',
        inputSchema: {
          type: 'object',
          properties: { flag: flagEnum },
          required: ['flag']
        },
        handler: async (args) => {
          const flag = Array.isArray(args.flag) ? args.flag[0] : args.flag
          return textResult(await this.tools.serviceStatus(flag))
        }
      },
      {
        name: 'list_sites',
        description:
          'List local development sites managed by FlyEnv (domain, root, type, PHP version, SSL).',
        inputSchema: { type: 'object', properties: {} },
        handler: async () => textResult(await this.tools.listSites())
      },
      {
        name: 'get_database_connection_info',
        description:
          'Return FlyEnv-known connection facts for a managed local database or cache service, including host, port, socket, credentials, config files, and logs.',
        inputSchema: {
          type: 'object',
          properties: {
            flag: databaseFlagEnum,
            version: {
              type: 'string',
              description:
                'Optional installed version. If omitted, prefer the running version, otherwise the enabled version.'
            }
          },
          required: ['flag']
        },
        handler: async (args) =>
          textResult(await this.tools.getDatabaseConnectionInfo(args.flag, args.version))
      },
      {
        name: 'resolve_site_runtime',
        description:
          'Resolve a FlyEnv-managed site into its hosted runtime facts: site root, PHP runtime, preferred web server, managed files, and project runtime metadata.',
        inputSchema: {
          type: 'object',
          properties: {
            siteName: { type: 'string' }
          },
          required: ['siteName']
        },
        handler: async (args) => textResult(await this.tools.resolveSiteRuntime(args.siteName))
      },
      {
        name: 'get_service_exec_info',
        description:
          'Return executable/runtime facts for a FlyEnv-managed service version, including bin, path, phpBin/phpConfig when present, config files, logs, and exec hints.',
        inputSchema: {
          type: 'object',
          properties: {
            flag: flagEnum,
            version: { type: 'string' }
          },
          required: ['flag']
        },
        handler: async (args) => textResult(await this.tools.getServiceExecInfo(args.flag, args.version))
      },
      {
        name: 'resolve_site_urls',
        description:
          'Return the canonical URL set for a FlyEnv-managed site, including aliases, SSL entrypoints, port summary, and reverse proxy declarations.',
        inputSchema: {
          type: 'object',
          properties: {
            siteName: { type: 'string' }
          },
          required: ['siteName']
        },
        handler: async (args) => textResult(await this.tools.resolveSiteUrls(args.siteName))
      },
      {
        name: 'get_managed_file_map',
        description:
          'Return the important FlyEnv-managed file paths for a site or service, grouped by env/config/log/cert/runtime/data.',
        inputSchema: {
          type: 'object',
          properties: {
            scope: {
              type: 'string',
              enum: ['site', 'service']
            },
            name: {
              type: 'string',
              description: 'Required when scope=site.'
            },
            flag: {
              type: 'string',
              description: 'Required when scope=service.'
            },
            version: {
              type: 'string',
              description: 'Optional version when scope=service.'
            }
          },
          required: ['scope']
        },
        handler: async (args) =>
          textResult(await this.tools.getManagedFileMap(args as GetManagedFileMapInput))
      },
      {
        name: 'list_log_files',
        description:
          "List a service's log files as {name, path, exists}. Returns paths only (not contents) — read the files yourself. Modules without specific log files return an empty list.",
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
          "List a service's config files as {name, path, exists}. Returns paths only (not contents) — read the files yourself. Modules without specific config files return an empty list. Pass version for version-scoped configs.",
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
        name: 'list_online_versions',
        description:
          'List online available versions of a FlyEnv-managed module. Use this before install_service to pick an existing version.',
        inputSchema: {
          type: 'object',
          properties: { flag: flagEnum },
          required: ['flag']
        },
        handler: async (args) => textResult(await this.tools.listOnlineVersions(args.flag))
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
          if (res?.failed?.length) {
            return textResult(
              {
                flag: args.flag,
                stopped: res?.stopped ?? [],
                failed: res.failed
              },
              true
            )
          }
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
      },
      {
        name: 'create_site',
        description:
          'Create a new local development site in FlyEnv. Requires name (domain) and root (absolute directory).',
        risky: true,
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Site domain, e.g. demo.test' },
            root: { type: 'string', description: 'Absolute path to the site root directory.' },
            alias: { type: 'string', description: 'Line-separated aliases.' },
            phpVersion: {
              type: 'number',
              description: 'PHP version number for the site (e.g. 83).'
            },
            useSSL: { type: 'boolean' },
            autoSSL: { type: 'boolean' },
            ssl: {
              type: 'object',
              properties: { cert: { type: 'string' }, key: { type: 'string' } }
            },
            port: {
              type: 'object',
              properties: {
                nginx: { type: 'number' },
                nginx_ssl: { type: 'number' },
                apache: { type: 'number' },
                apache_ssl: { type: 'number' },
                caddy: { type: 'number' },
                caddy_ssl: { type: 'number' }
              }
            },
            nginx: {
              type: 'object',
              properties: { rewrite: { type: 'string' } }
            }
          },
          required: ['name', 'root']
        },
        handler: async (args) => {
          const data = await this.tools.createSite(args)
          return textResult({ created: args.name, data })
        }
      },
      {
        name: 'update_site',
        description:
          'Update an existing local site in FlyEnv. Only the fields you provide are changed.',
        risky: true,
        inputSchema: {
          type: 'object',
          properties: {
            siteName: { type: 'string', description: 'Current domain name of the site to update.' },
            name: { type: 'string', description: 'New primary domain name for the site.' },
            alias: { type: 'string' },
            mark: { type: 'string' },
            root: { type: 'string' },
            phpVersion: { type: 'number' },
            useSSL: { type: 'boolean' },
            autoSSL: { type: 'boolean' },
            ssl: {
              type: 'object',
              properties: { cert: { type: 'string' }, key: { type: 'string' } }
            },
            port: {
              type: 'object',
              properties: {
                nginx: { type: 'number' },
                nginx_ssl: { type: 'number' },
                apache: { type: 'number' },
                apache_ssl: { type: 'number' },
                caddy: { type: 'number' },
                caddy_ssl: { type: 'number' },
                frankenphp: { type: 'number' },
                frankenphp_ssl: { type: 'number' },
                tomcat: { type: 'number' },
                tomcat_ssl: { type: 'number' }
              }
            },
            nginx: {
              type: 'object',
              properties: { rewrite: { type: 'string' } }
            },
            reverseProxy: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  path: { type: 'string' },
                  url: { type: 'string' }
                }
              }
            }
          },
          required: ['siteName']
        },
        handler: async (args) => {
          const { siteName, ...patch } = args
          const data = await this.tools.updateSite(siteName, patch)
          return textResult({ updated: siteName, data })
        }
      },
      {
        name: 'delete_site',
        description: 'Delete a local site managed by FlyEnv.',
        risky: true,
        inputSchema: {
          type: 'object',
          properties: {
            siteName: { type: 'string', description: 'Domain name of the site to delete.' }
          },
          required: ['siteName']
        },
        handler: async (args) => {
          const data = await this.tools.deleteSite(args.siteName)
          return textResult({ deleted: args.siteName, data })
        }
      },
      {
        name: 'install_service',
        description: 'Download and install a specific version of a FlyEnv-managed service.',
        risky: true,
        inputSchema: {
          type: 'object',
          properties: {
            flag: flagEnum,
            version: { type: 'string', description: 'Version to install (e.g. "1.29.0").' }
          },
          required: ['flag', 'version']
        },
        handler: async (args) => {
          const data = await this.tools.installService(args.flag, args.version)
          return textResult(data)
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
        const msg = `Tool not enabled or unknown: ${name}`
        MCPAudit.log(name ?? 'unknown_tool', args, false, msg)
        return textResult(msg, true)
      }
      const approval = this.mcpConfig.getConfig('approval', {}) as Record<
        string,
        'auto' | 'confirm'
      >
      const needsConfirm = def.risky && (approval[name] ?? 'auto') === 'confirm'
      if (needsConfirm) {
        const confirmed = await this.confirmTool(name, args)
        if (!confirmed) {
          const msg = `Tool ${name} was cancelled by user`
          MCPAudit.log(name, args, false, msg)
          return textResult(msg, true)
        }
      }
      try {
        const result = await def.handler(args)
        const success = !result?.isError
        MCPAudit.log(name, args, success, success ? undefined : resultText(result))
        return result
      } catch (e) {
        const msg = e instanceof Error ? e.message : `${e}`
        MCPAudit.log(name, args, false, msg)
        return textResult(`Tool ${name} failed: ${msg}`, true)
      }
    })

    server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: this.enabledResourceDefs().map((item) => ({
          uri: item.uri,
          name: item.name,
          mimeType: item.mimeType
        }))
      }
    })

    server.setRequestHandler(ReadResourceRequestSchema, async (request: any) => {
      const uri = request?.params?.uri
      try {
        const def = this.enabledResourceDefs().find((item) => item.uri === uri)
        if (!def) {
          throw new Error(`Resource not enabled or unknown: ${uri}`)
        }

        let data: any
        if (uri === 'flyenv://services') {
          data = await this.tools.listServices(MODULE_FLAGS)
        } else if (uri === 'flyenv://sites') {
          data = await this.tools.listSites()
        } else {
          throw new Error(`Unknown resource: ${uri}`)
        }

        MCPAudit.log('read_resource', { uri }, true)
        return {
          contents: [{ uri, mimeType: def.mimeType, text: JSON.stringify(data, null, 2) }]
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : `${e}`
        MCPAudit.log('read_resource', { uri }, false, msg)
        throw e
      }
    })

    return server
  }

  /** 高风险 tool 的原生确认框 */
  private async confirmTool(name: string, args: Record<string, any>): Promise<boolean> {
    try {
      const detail = Object.entries(args)
        .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
        .join('\n')
      const { response } = await dialog.showMessageBox({
        type: 'warning',
        buttons: ['Cancel', 'Confirm'],
        defaultId: 0,
        cancelId: 0,
        title: 'FlyEnv MCP',
        message: `Allow MCP tool "${name}"?`,
        detail: detail || undefined
      })
      return response === 1
    } catch (e) {
      console.log('MCP confirmTool error: ', e)
      return false
    }
  }

  /** 校验请求鉴权 + 来源 + Origin */
  private checkAuth(req: IncomingMessage): { ok: boolean; reason?: string } {
    const cfg = this.mcpConfig.getConfig() as any
    const remoteAddr = req.socket.remoteAddress ?? ''
    const isLoopback =
      remoteAddr === '127.0.0.1' ||
      remoteAddr === '::1' ||
      remoteAddr === '::ffff:127.0.0.1' ||
      remoteAddr.endsWith('127.0.0.1')
    if (!cfg?.allowRemote && !isLoopback) {
      return { ok: false, reason: 'remote access disabled' }
    }

    // Origin 校验：浏览器型客户端会带 Origin，必须匹配当前服务地址或回环
    const origin = this.headerValue(req, 'origin')
    if (origin) {
      const port: number = cfg?.port ?? 7682
      const host: string = cfg?.allowRemote ? cfg?.host : '127.0.0.1'
      const allowed = [
        `http://127.0.0.1:${port}`,
        `https://127.0.0.1:${port}`,
        `http://localhost:${port}`,
        `https://localhost:${port}`
      ]
      if (cfg?.allowRemote && host && host !== '127.0.0.1') {
        allowed.push(`http://${host}:${port}`, `https://${host}:${port}`)
      }
      if (!allowed.includes(origin)) {
        return { ok: false, reason: 'invalid origin' }
      }
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

  private headerValue(req: IncomingMessage, name: string): string | undefined {
    const v = req.headers[name.toLowerCase()]
    if (Array.isArray(v)) return v[0]
    return v
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
