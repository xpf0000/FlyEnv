#!/usr/bin/env node
/**
 * FlyEnv MCP stdio bridge
 *
 * Thin proxy that exposes FlyEnv's MCP HTTP endpoint over stdio.
 * AI clients (Claude Desktop, Cursor, Cline, Windsurf, ...) can add this script
 * as an MCP server; it forwards JSON-RPC messages to the running FlyEnv app.
 *
 * Environment variables:
 *   FLYENV_MCP_URL   - FlyEnv MCP HTTP endpoint, default http://127.0.0.1:7682
 *   FLYENV_MCP_TOKEN - Bearer token for authentication
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema
} from '@modelcontextprotocol/sdk/types.js'

const url = process.env.FLYENV_MCP_URL || 'http://127.0.0.1:7682'
const token = process.env.FLYENV_MCP_TOKEN

if (!token) {
  console.error('[flyenv-mcp-stdio] FLYENV_MCP_TOKEN is not set.')
  console.error('[flyenv-mcp-stdio] Please copy the token from FlyEnv MCP panel.')
  process.exit(1)
}

async function main() {
  let client
  try {
    client = new Client({ name: 'flyenv-mcp-bridge', version: '1.0.0' })
    const fetchWithAuth = (target, init) => {
      const headers = new Headers(init?.headers)
      headers.set('Authorization', `Bearer ${token}`)
      return fetch(target, { ...(init || {}), headers })
    }
    const transport = new StreamableHTTPClientTransport(new URL(url), { fetch: fetchWithAuth })
    await client.connect(transport)
  } catch (e) {
    console.error(`[flyenv-mcp-stdio] Cannot connect to FlyEnv at ${url}: ${e?.message || e}`)
    console.error('[flyenv-mcp-stdio] Make sure FlyEnv is running and the MCP Server is started.')
    process.exit(1)
  }

  const server = new Server(
    { name: 'flyenv-mcp-stdio-bridge', version: '1.0.0' },
    { capabilities: { tools: {}, resources: {} } }
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => client.listTools())
  server.setRequestHandler(CallToolRequestSchema, async (request) =>
    client.callTool(request.params)
  )
  server.setRequestHandler(ListResourcesRequestSchema, async () => client.listResources())
  server.setRequestHandler(ReadResourceRequestSchema, async (request) =>
    client.readResource({ uri: request.params.uri })
  )

  const stdioTransport = new StdioServerTransport()
  await server.connect(stdioTransport)

  // Keep the process alive until stdin closes
  process.stdin.on('end', () => {
    client.close().catch(() => {})
    server.close().catch(() => {})
  })
}

main().catch((e) => {
  console.error('[flyenv-mcp-stdio] Unexpected error:', e)
  process.exit(1)
})
