import { parseToml, stringifyToml } from '@shared/toml'
import { optionalBearerHeaders } from './aiCliMcp'

export type MCPHttpClientFlag =
  | 'claudeCode'
  | 'codex'
  | 'openCode'
  | 'kimi'
  | 'antigravity'
  | 'copilotCli'

type MCPServerUrlOptions = {
  host?: string
  port: number
  allowRemote: boolean
}

function effectiveHost(host: string | undefined, allowRemote: boolean): string {
  if (!allowRemote) {
    return '127.0.0.1'
  }
  if (!host || host === '0.0.0.0' || host === '::' || host === '[::]') {
    return '127.0.0.1'
  }
  return host
}

export function getMcpServerUrl(options: MCPServerUrlOptions): string {
  return `http://${effectiveHost(options.host, options.allowRemote)}:${options.port}`
}

export function buildHttpClientConfigSnippet(
  client: MCPHttpClientFlag,
  url: string,
  token: string
): string {
  const headers = optionalBearerHeaders(token)

  if (client === 'codex') {
    const data: any = {
      features: {
        rmcp_client: true
      },
      mcp_servers: {
        flyenv: { url }
      }
    }
    if (headers) {
      data.mcp_servers.flyenv.http_headers = headers
    }
    return stringifyToml(data)
  }

  if (client === 'openCode') {
    return JSON.stringify(
      {
        mcp: {
          flyenv: {
            type: 'remote',
            url,
            ...(headers ? { headers } : {})
          }
        }
      },
      null,
      2
    )
  }

  if (client === 'kimi') {
    return JSON.stringify(
      {
        mcpServers: {
          flyenv: {
            url,
            ...(headers ? { headers } : {})
          }
        }
      },
      null,
      2
    )
  }

  if (client === 'antigravity') {
    return JSON.stringify(
      {
        mcpServers: {
          flyenv: {
            serverUrl: url,
            ...(headers ? { headers } : {})
          }
        }
      },
      null,
      2
    )
  }

  if (client === 'copilotCli') {
    return JSON.stringify(
      {
        mcpServers: {
          flyenv: {
            tools: ['*'],
            type: 'http',
            url,
            source: 'user',
            ...(headers ? { headers } : {})
          }
        }
      },
      null,
      2
    )
  }

  return JSON.stringify(
    {
      mcpServers: {
        flyenv: {
          type: 'http',
          url,
          ...(headers ? { headers } : {})
        }
      }
    },
    null,
    2
  )
}

export function buildStdioClientConfigSnippet(
  bridgePath: string,
  url: string,
  token: string
): string {
  return JSON.stringify(
    {
      mcpServers: {
        flyenv: {
          command: 'node',
          args: [bridgePath],
          env: {
            FLYENV_MCP_URL: url,
            FLYENV_MCP_TOKEN: token
          }
        }
      }
    },
    null,
    2
  )
}

export function parseCodexToml(content: string): any {
  return parseToml(content)
}
