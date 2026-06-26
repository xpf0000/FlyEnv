#!/usr/bin/env node
/**
 * MCP Smoke Test
 *
 * 用法：
 *   npx tsx scripts/mcp-smoke-test.ts [url] [token]
 *
 * 示例：
 *   npx tsx scripts/mcp-smoke-test.ts http://127.0.0.1:7682 <token>
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

const url = process.argv[2] || 'http://127.0.0.1:7682'
const token = process.argv[3]

if (!token) {
  console.error('Usage: npx tsx scripts/mcp-smoke-test.ts <url> <token>')
  process.exit(1)
}

const fetchWithAuth = (target: any, init: any) => {
  const headers = new Headers(init?.headers)
  headers.set('Authorization', `Bearer ${token}`)
  return fetch(target, { ...(init || {}), headers })
}

async function connect() {
  const client = new Client({ name: 'flyenv-mcp-smoke-test', version: '1.0.0' })
  const transport = new StreamableHTTPClientTransport(new URL(url), { fetch: fetchWithAuth })
  await client.connect(transport)
  return { client, transport }
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`ASSERT FAILED: ${message}`)
  }
}

function hasTextContent(result: any) {
  return (
    Array.isArray(result?.content) &&
    result.content.some((c: any) => c?.type === 'text' && typeof c?.text === 'string')
  )
}

async function main() {
  console.log(`\n[smoke] target: ${url}`)

  // 1. 错误 token 应连不上 / 被拒绝
  {
    console.log('[smoke] testing invalid token...')
    const badClient = new Client({ name: 'flyenv-mcp-smoke-test-bad', version: '1.0.0' })
    const badTransport = new StreamableHTTPClientTransport(new URL(url), {
      fetch: (target: any, init: any) => {
        const headers = new Headers(init?.headers)
        headers.set('Authorization', 'Bearer wrong-token')
        return fetch(target, { ...(init || {}), headers })
      }
    })
    try {
      await badClient.connect(badTransport)
      await badClient.listTools()
      throw new Error('invalid token should be rejected')
    } catch (e: any) {
      if (e?.message?.includes('should be rejected')) {
        throw e
      }
      console.log('[smoke] invalid token rejected as expected')
    } finally {
      await badClient.close().catch(() => {})
      await badTransport.close().catch(() => {})
    }
  }

  // 2. 正确 token 连接
  const { client, transport } = await connect()
  try {
    // 3. 列出工具
    console.log('[smoke] listing tools...')
    const tools = await client.listTools()
    assert(Array.isArray(tools?.tools), 'tools should be an array')
    const toolNames = tools.tools.map((t: any) => t.name)
    console.log(`[smoke] tools: ${toolNames.join(', ')}`)
    assert(toolNames.includes('list_services'), 'list_services tool missing')
    assert(toolNames.includes('list_config_files'), 'list_config_files tool missing')
    assert(toolNames.includes('list_log_files'), 'list_log_files tool missing')

    // 4. 调用 list_services（不传 flags，返回主进程缓存的全部服务）
    console.log('[smoke] calling list_services...')
    const services = await client.callTool({
      name: 'list_services',
      arguments: {}
    })
    assert(hasTextContent(services), 'list_services should return text content')
    console.log('[smoke] list_services OK')

    // 5. 调用 service_status（以 nginx 为例）
    console.log('[smoke] calling service_status nginx...')
    const status = await client.callTool({
      name: 'service_status',
      arguments: { flag: 'nginx' }
    })
    assert(hasTextContent(status), 'service_status should return text content')
    console.log('[smoke] service_status OK')

    // 6. 调用 list_config_files / list_log_files（以 nginx 为例）
    for (const toolName of ['list_config_files', 'list_log_files']) {
      console.log(`[smoke] calling ${toolName} nginx...`)
      const result = await client.callTool({
        name: toolName,
        arguments: { flag: 'nginx' }
      })
      assert(hasTextContent(result), `${toolName} should return text content`)
      console.log(`[smoke] ${toolName} OK`)
    }

    // 7. 调用 list_online_versions（以 nginx 为例）
    console.log('[smoke] calling list_online_versions nginx...')
    const versions = await client.callTool({
      name: 'list_online_versions',
      arguments: { flag: 'nginx' }
    })
    assert(hasTextContent(versions), 'list_online_versions should return text content')
    console.log('[smoke] list_online_versions OK')

    // 8. 列出资源
    console.log('[smoke] listing resources...')
    const resources = await client.listResources()
    assert(Array.isArray(resources?.resources), 'resources should be an array')
    console.log(`[smoke] resources: ${resources.resources.map((r: any) => r.uri).join(', ')}`)

    console.log('\n[smoke] all checks passed ✓')
  } finally {
    await client.close().catch(() => {})
    await transport.close().catch(() => {})
  }
}

main().catch((e) => {
  console.error('\n[smoke] FAILED:', e?.message || e)
  process.exit(1)
})
