import { pluginToolIsError } from '@shared/plugin/PluginMCP'
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
import { getEnabledResourceDefs } from '@shared/mcpResourcePolicy'
import type { GetManagedFileMapInput } from '@shared/mcpContext'
import type { ForkManager } from './ForkManager'
import type MCPConfigManager from './MCPConfigManager'
import MCPAudit from './MCPAudit'
import type { PluginMCPRegistry } from './PluginMCPRegistry'
import { MCPTools, textResult } from './MCPTools'
import type { MCPToolResult } from './MCPTools'
import { stopHttpServer } from '@shared/httpServerStop'
import { I18nT } from '@lang/runtime'
import {
  MCP_DATABASE_FLAGS,
  MCP_FLAG_DESCRIPTIONS,
  MCP_INSTALLABLE_FLAGS,
  MCP_LIFECYCLE_FLAGS,
  MCP_PARAM_DESCRIPTIONS,
  MCP_QUERYABLE_FLAGS,
  MCP_TOOL_DESCRIPTIONS
} from './mcpToolMetadata'

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

/** 审批框按钮下标,与 confirmTool 里 buttons 数组的顺序一一对应 */
const APPROVAL_BUTTON = { cancel: 0, confirm: 1, always: 2 } as const

const MCP_CORS_METHODS = ['GET', 'POST', 'DELETE']
const MCP_CORS_HEADERS = [
  'accept',
  'authorization',
  'content-type',
  'mcp-protocol-version',
  'mcp-session-id',
  'last-event-id'
]

type RequestAuthorization =
  | { ok: true; origin?: string; preflight?: true }
  | { ok: false; status: 401 | 403; reason: string; origin?: string }

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
  private activeTransports = new Set<StreamableHTTPServerTransport>()

  constructor(
    forkManager: ForkManager,
    mcpConfig: MCPConfigManager,
    appConfig?: { getConfig: (k?: any, d?: any) => any; setConfig: (k: string, ...a: any) => any },
    private readonly plugins?: PluginMCPRegistry,
    /** 审批框里选「始终允许」后回调,用于通知渲染进程刷新策略展示 */
    private readonly onApprovalChanged?: (tool: string) => void
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
    const queryableFlagEnum = { type: 'string', enum: [...MCP_QUERYABLE_FLAGS] }
    const lifecycleFlagEnum = { type: 'string', enum: [...MCP_LIFECYCLE_FLAGS] }
    const installableFlagEnum = { type: 'string', enum: [...MCP_INSTALLABLE_FLAGS] }
    const databaseFlagEnum = {
      type: 'string',
      enum: [...MCP_DATABASE_FLAGS]
    }

    this.toolDefs = [
      {
        name: 'list_services',
        description: MCP_TOOL_DESCRIPTIONS.listServices,
        inputSchema: {
          type: 'object',
          properties: {
            flags: {
              type: 'array',
              items: queryableFlagEnum,
              description:
                'Optional list of version-managed module flags to inspect. Omit or pass [] to return only currently cached version-managed modules.'
            }
          }
        },
        handler: async (args) => textResult(await this.tools.listServices(args?.flags))
      },
      {
        name: 'service_status',
        description: MCP_TOOL_DESCRIPTIONS.serviceStatus,
        inputSchema: {
          type: 'object',
          properties: {
            flag: {
              ...queryableFlagEnum,
              description: MCP_FLAG_DESCRIPTIONS.queryable
            }
          },
          required: ['flag']
        },
        handler: async (args) => {
          const flag = Array.isArray(args.flag) ? args.flag[0] : args.flag
          return textResult(await this.tools.serviceStatus(flag))
        }
      },
      {
        name: 'list_sites',
        description: MCP_TOOL_DESCRIPTIONS.listSites,
        inputSchema: { type: 'object', properties: {} },
        handler: async () => textResult(await this.tools.listSites())
      },
      {
        name: 'get_database_connection_info',
        description: MCP_TOOL_DESCRIPTIONS.getDatabaseConnectionInfo,
        inputSchema: {
          type: 'object',
          properties: {
            flag: {
              ...databaseFlagEnum,
              description: MCP_FLAG_DESCRIPTIONS.database
            },
            version: {
              type: 'string',
              description: MCP_PARAM_DESCRIPTIONS.installedVersion
            }
          },
          required: ['flag']
        },
        handler: async (args) =>
          textResult(await this.tools.getDatabaseConnectionInfo(args.flag, args.version))
      },
      {
        name: 'resolve_site_runtime',
        description: MCP_TOOL_DESCRIPTIONS.resolveSiteRuntime,
        inputSchema: {
          type: 'object',
          properties: {
            siteName: { type: 'string', description: MCP_PARAM_DESCRIPTIONS.siteName }
          },
          required: ['siteName']
        },
        handler: async (args) => textResult(await this.tools.resolveSiteRuntime(args.siteName))
      },
      {
        name: 'get_service_exec_info',
        description: MCP_TOOL_DESCRIPTIONS.getServiceExecInfo,
        inputSchema: {
          type: 'object',
          properties: {
            flag: {
              ...queryableFlagEnum,
              description: MCP_FLAG_DESCRIPTIONS.queryable
            },
            version: {
              type: 'string',
              description: MCP_PARAM_DESCRIPTIONS.installedVersion
            }
          },
          required: ['flag']
        },
        handler: async (args) =>
          textResult(await this.tools.getServiceExecInfo(args.flag, args.version))
      },
      {
        name: 'resolve_site_urls',
        description: MCP_TOOL_DESCRIPTIONS.resolveSiteUrls,
        inputSchema: {
          type: 'object',
          properties: {
            siteName: { type: 'string', description: MCP_PARAM_DESCRIPTIONS.siteName }
          },
          required: ['siteName']
        },
        handler: async (args) => textResult(await this.tools.resolveSiteUrls(args.siteName))
      },
      {
        name: 'get_managed_file_map',
        description: MCP_TOOL_DESCRIPTIONS.getManagedFileMap,
        inputSchema: {
          type: 'object',
          properties: {
            scope: {
              type: 'string',
              enum: ['site', 'service'],
              description: MCP_PARAM_DESCRIPTIONS.managedFileScope
            },
            name: {
              type: 'string',
              description: MCP_PARAM_DESCRIPTIONS.siteName
            },
            flag: {
              ...queryableFlagEnum,
              description: MCP_FLAG_DESCRIPTIONS.queryable
            },
            version: {
              type: 'string',
              description: MCP_PARAM_DESCRIPTIONS.managedFileVersion
            }
          },
          required: ['scope'],
          allOf: [
            {
              if: {
                properties: {
                  scope: { const: 'site' }
                }
              },
              then: { required: ['name'] }
            },
            {
              if: {
                properties: {
                  scope: { const: 'service' }
                }
              },
              then: { required: ['flag'] }
            }
          ]
        },
        handler: async (args) =>
          textResult(await this.tools.getManagedFileMap(args as GetManagedFileMapInput))
      },
      {
        name: 'list_log_files',
        description: MCP_TOOL_DESCRIPTIONS.listLogFiles,
        inputSchema: {
          type: 'object',
          properties: {
            flag: {
              ...queryableFlagEnum,
              description: MCP_FLAG_DESCRIPTIONS.queryable
            },
            version: {
              type: 'string',
              description: MCP_PARAM_DESCRIPTIONS.installedVersion
            }
          },
          required: ['flag']
        },
        handler: async (args) => textResult(await this.tools.listLogFiles(args.flag, args.version))
      },
      {
        name: 'list_config_files',
        description: MCP_TOOL_DESCRIPTIONS.listConfigFiles,
        inputSchema: {
          type: 'object',
          properties: {
            flag: {
              ...queryableFlagEnum,
              description: MCP_FLAG_DESCRIPTIONS.queryable
            },
            version: {
              type: 'string',
              description: MCP_PARAM_DESCRIPTIONS.installedVersion
            }
          },
          required: ['flag']
        },
        handler: async (args) =>
          textResult(await this.tools.listConfigFiles(args.flag, args.version))
      },
      {
        name: 'list_online_versions',
        description: MCP_TOOL_DESCRIPTIONS.listOnlineVersions,
        inputSchema: {
          type: 'object',
          properties: {
            flag: {
              ...installableFlagEnum,
              description: MCP_FLAG_DESCRIPTIONS.installable
            }
          },
          required: ['flag']
        },
        handler: async (args) => textResult(await this.tools.listOnlineVersions(args.flag))
      },
      {
        name: 'start_service',
        description: MCP_TOOL_DESCRIPTIONS.startService,
        risky: true,
        inputSchema: {
          type: 'object',
          properties: {
            flag: {
              ...lifecycleFlagEnum,
              description: MCP_FLAG_DESCRIPTIONS.lifecycle
            },
            version: {
              type: 'string',
              description: MCP_PARAM_DESCRIPTIONS.lifecycleVersion
            }
          },
          required: ['flag']
        },
        handler: async (args) => {
          await this.tools.startService(args.flag, args.version)
          return textResult(`${args.flag} started`)
        }
      },
      {
        name: 'stop_service',
        description: MCP_TOOL_DESCRIPTIONS.stopService,
        risky: true,
        inputSchema: {
          type: 'object',
          properties: {
            flag: {
              ...lifecycleFlagEnum,
              description: MCP_FLAG_DESCRIPTIONS.lifecycle
            },
            version: {
              type: 'string',
              description:
                'Optional installed version string to stop. If omitted, FlyEnv stops every running instance currently tracked for that lifecycle-managed service.'
            }
          },
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
        description: MCP_TOOL_DESCRIPTIONS.restartService,
        risky: true,
        inputSchema: {
          type: 'object',
          properties: {
            flag: {
              ...lifecycleFlagEnum,
              description: MCP_FLAG_DESCRIPTIONS.lifecycle
            },
            version: {
              type: 'string',
              description:
                'Optional installed version string to restart. If omitted, FlyEnv restarts the current enabled version for that lifecycle-managed service.'
            }
          },
          required: ['flag']
        },
        handler: async (args) => {
          await this.tools.restartService(args.flag, args.version)
          return textResult(`${args.flag} restarted`)
        }
      },
      {
        name: 'create_site',
        description: MCP_TOOL_DESCRIPTIONS.createSite,
        risky: true,
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: MCP_PARAM_DESCRIPTIONS.siteName },
            root: { type: 'string', description: MCP_PARAM_DESCRIPTIONS.siteRoot },
            alias: { type: 'string', description: MCP_PARAM_DESCRIPTIONS.siteAlias },
            url: { type: 'string', description: MCP_PARAM_DESCRIPTIONS.siteUrl },
            phpVersion: {
              type: 'number',
              description: MCP_PARAM_DESCRIPTIONS.sitePhpVersion
            },
            useSSL: { type: 'boolean', description: MCP_PARAM_DESCRIPTIONS.siteUseSsl },
            autoSSL: { type: 'boolean', description: MCP_PARAM_DESCRIPTIONS.siteAutoSsl },
            ssl: {
              type: 'object',
              properties: {
                cert: { type: 'string', description: MCP_PARAM_DESCRIPTIONS.siteSslCert },
                key: { type: 'string', description: MCP_PARAM_DESCRIPTIONS.siteSslKey }
              }
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
              properties: {
                rewrite: { type: 'string', description: MCP_PARAM_DESCRIPTIONS.rewriteSnippet }
              }
            },
            reverseProxy: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  path: { type: 'string', description: MCP_PARAM_DESCRIPTIONS.reverseProxyPath },
                  url: { type: 'string', description: MCP_PARAM_DESCRIPTIONS.reverseProxyUrl }
                }
              }
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
        description: MCP_TOOL_DESCRIPTIONS.updateSite,
        risky: true,
        inputSchema: {
          type: 'object',
          properties: {
            siteName: { type: 'string', description: MCP_PARAM_DESCRIPTIONS.siteName },
            name: { type: 'string', description: 'New primary FlyEnv site domain name.' },
            alias: { type: 'string', description: MCP_PARAM_DESCRIPTIONS.siteAlias },
            mark: { type: 'string', description: MCP_PARAM_DESCRIPTIONS.siteMark },
            bookmark: { type: 'string', description: MCP_PARAM_DESCRIPTIONS.siteBookmark },
            root: { type: 'string', description: MCP_PARAM_DESCRIPTIONS.siteRoot },
            url: { type: 'string', description: MCP_PARAM_DESCRIPTIONS.siteUrl },
            envFile: { type: 'string', description: MCP_PARAM_DESCRIPTIONS.siteEnvFile },
            phpVersion: { type: 'number', description: MCP_PARAM_DESCRIPTIONS.sitePhpVersion },
            phpVersionFull: {
              type: 'string',
              description: 'Optional full PHP version string stored with the FlyEnv site.'
            },
            useSSL: { type: 'boolean', description: MCP_PARAM_DESCRIPTIONS.siteUseSsl },
            autoSSL: { type: 'boolean', description: MCP_PARAM_DESCRIPTIONS.siteAutoSsl },
            ssl: {
              type: 'object',
              properties: {
                cert: { type: 'string', description: MCP_PARAM_DESCRIPTIONS.siteSslCert },
                key: { type: 'string', description: MCP_PARAM_DESCRIPTIONS.siteSslKey }
              }
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
              properties: {
                rewrite: { type: 'string', description: MCP_PARAM_DESCRIPTIONS.rewriteSnippet }
              }
            },
            projectName: { type: 'string', description: MCP_PARAM_DESCRIPTIONS.projectName },
            projectPort: { type: 'number', description: MCP_PARAM_DESCRIPTIONS.projectPort },
            startCommand: {
              type: 'string',
              description: MCP_PARAM_DESCRIPTIONS.projectStartCommand
            },
            reverseProxy: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  path: { type: 'string', description: MCP_PARAM_DESCRIPTIONS.reverseProxyPath },
                  url: { type: 'string', description: MCP_PARAM_DESCRIPTIONS.reverseProxyUrl }
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
        description: MCP_TOOL_DESCRIPTIONS.deleteSite,
        risky: true,
        inputSchema: {
          type: 'object',
          properties: {
            siteName: { type: 'string', description: MCP_PARAM_DESCRIPTIONS.siteName }
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
        description: MCP_TOOL_DESCRIPTIONS.installService,
        risky: true,
        inputSchema: {
          type: 'object',
          properties: {
            flag: {
              ...installableFlagEnum,
              description: MCP_FLAG_DESCRIPTIONS.installable
            },
            version: {
              type: 'string',
              description:
                'Exact downloadable version from list_online_versions, for example "1.3.14". Installation does not start the module.'
            }
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
        tools: [
          ...this.enabledToolDefs().map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema
          })),
          ...(this.plugins?.listTools() ?? [])
            .filter((tool) =>
              (this.mcpConfig.getConfig('enabledTools', []) as string[]).includes(tool.name)
            )
            .map((tool) => ({
              name: tool.name,
              description: tool.description,
              inputSchema: tool.inputSchema,
              annotations: {
                readOnlyHint: tool.readOnly,
                destructiveHint: tool.risky,
                openWorldHint: false
              }
            }))
        ]
      }
    })

    server.setRequestHandler(CallToolRequestSchema, async (request: any): Promise<any> => {
      const name = request?.params?.name
      const args = request?.params?.arguments ?? {}
      if (this.plugins?.has(name)) {
        const started = performance.now()
        const client = server.getClientVersion()
        const result = await this.plugins.invoke(
          name,
          args,
          () => this.confirmTool(name, args, true),
          client
        )
        try {
          MCPAudit.logPlugin(name, this.plugins.pluginId(name) ?? 'unknown', {
            args,
            result,
            durationMs: performance.now() - started,
            client
          })
        } catch (e) {
          console.log('MCP audit log error: ', e)
        }
        return textResult(result, pluginToolIsError(result))
      }
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
          data = await this.tools.listServices([...MCP_QUERYABLE_FLAGS])
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

  /**
   * 高风险 tool 的原生确认框。
   *
   * 按钮顺序即 response 的索引,请勿按界面上的视觉顺序改动:
   * macOS 会重排按钮外观,但 Electron 始终按传入数组下标回传 response
   * (测试夹具 test/fixtures/plugin-mcp-runtime-smoke-host.ts 就以 response=1 代表「允许本次」)。
   * defaultId/cancelId 保持 Cancel —— 回车与关闭窗口都等价于拒绝。
   */
  private async confirmTool(
    name: string,
    args: Record<string, any>,
    privateTool = false
  ): Promise<boolean> {
    try {
      const detail = Object.entries(args)
        .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
        .join('\n')
      const { response } = await dialog.showMessageBox({
        type: 'warning',
        buttons: [
          I18nT('mcp.approvalCancel'),
          I18nT('mcp.approvalAllowOnce'),
          I18nT('mcp.approvalAlways')
        ],
        defaultId: APPROVAL_BUTTON.cancel,
        cancelId: APPROVAL_BUTTON.cancel,
        title: 'FlyEnv MCP',
        message: I18nT('mcp.approvalMessage', { tool: name }),
        detail: [detail, I18nT('mcp.approvalAlwaysTip', { policy: I18nT('mcp.approvalAuto') })]
          .filter(Boolean)
          .join('\n\n')
      })
      if (response === APPROVAL_BUTTON.always) {
        // 先落盘再放行:下一次调用直接走「自动」策略,不再弹框。
        // 写盘失败不影响本次已批准的调用(最坏情况只是下次继续询问)。
        try {
          this.mcpConfig.setApproval(name, 'auto')
          this.onApprovalChanged?.(name)
        } catch (e) {
          console.log('MCP confirmTool persist error: ', e)
        }
      }
      return response === APPROVAL_BUTTON.confirm || response === APPROVAL_BUTTON.always
    } catch (e) {
      if (!privateTool) console.log('MCP confirmTool error: ', e)
      return false
    }
  }

  /** 校验请求鉴权 + 来源 + Origin */
  private checkAuth(req: IncomingMessage): RequestAuthorization {
    const cfg = this.mcpConfig.getConfig() as any
    const remoteAddr = req.socket.remoteAddress ?? ''
    const isLoopback =
      remoteAddr === '127.0.0.1' || remoteAddr === '::1' || remoteAddr === '::ffff:127.0.0.1'
    if (!cfg?.allowRemote && !isLoopback) {
      return { ok: false, status: 403, reason: 'remote access disabled' }
    }

    // 保留现有同源地址，并只接受用户明确添加的浏览器来源。
    const origin = this.headerValue(req, 'origin')
    if (origin !== undefined) {
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
      const configured = Array.isArray(cfg?.allowedOrigins) && cfg.allowedOrigins.includes(origin)
      if (!/^https?:\/\//.test(origin) || (!allowed.includes(origin) && !configured)) {
        return { ok: false, status: 403, reason: 'invalid origin' }
      }

      const method = this.headerValue(req, 'access-control-request-method')
      if (req.method === 'OPTIONS' && method !== undefined) {
        const headers = this.headerValue(req, 'access-control-request-headers')
        const requested =
          headers
            ?.toLowerCase()
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean) ?? []
        if (
          !MCP_CORS_METHODS.includes(method) ||
          requested.some((item) => !MCP_CORS_HEADERS.includes(item))
        ) {
          return { ok: false, status: 403, reason: 'invalid preflight', origin }
        }
        // Browser preflight carries no bearer token and must stop before the MCP transport.
        return { ok: true, origin, preflight: true }
      }
    }

    const token = cfg?.token
    if (
      typeof token !== 'string' ||
      !token.trim() ||
      this.headerValue(req, 'authorization') !== `Bearer ${token}`
    ) {
      return { ok: false, status: 401, reason: 'invalid token', origin }
    }
    return { ok: true, origin }
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
      res.setHeader(
        'Vary',
        req.method === 'OPTIONS'
          ? 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers'
          : 'Origin'
      )
      if (auth.origin) {
        res.setHeader('Access-Control-Allow-Origin', auth.origin)
        res.setHeader(
          'Access-Control-Expose-Headers',
          'Mcp-Session-Id, MCP-Protocol-Version, WWW-Authenticate'
        )
      }
      if (!auth.ok) {
        if (auth.status === 401) res.setHeader('WWW-Authenticate', 'Bearer')
        res.writeHead(auth.status, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: auth.reason }))
        return
      }
      if (auth.preflight) {
        res.setHeader('Access-Control-Allow-Methods', MCP_CORS_METHODS.join(', '))
        res.setHeader('Access-Control-Allow-Headers', MCP_CORS_HEADERS.join(', '))
        res.writeHead(204).end()
        return
      }
      try {
        // 每个请求新建一个无状态 transport + server（stateless 模式：sessionIdGenerator: undefined）
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
        const server = this.createMcpServer()
        this.activeTransports.add(transport)
        const cleanup = () => {
          this.activeTransports.delete(transport)
          transport.close().catch(() => {})
          server.close().catch(() => {})
        }
        res.on('close', cleanup)
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
      await stopHttpServer(this.httpServer, this.activeTransports)
      this.httpServer = undefined
    }
    this.activeTransports.clear()
    this.running = false
    return { running: false }
  }
}
