#!/usr/bin/env node

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

const url = process.argv[2] || 'http://127.0.0.1:7682'
const token = process.argv[3]

if (!token) {
  console.error('Usage: npx tsx scripts/mcp-context-smoke-test.ts <url> <token>')
  process.exit(1)
}

const fetchWithAuth = (target: any, init: any) => {
  const headers = new Headers(init?.headers)
  headers.set('Authorization', `Bearer ${token}`)
  return fetch(target, { ...(init || {}), headers })
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`ASSERT FAILED: ${message}`)
  }
}

function hasTextContent(result: any) {
  return (
    Array.isArray(result?.content) &&
    result.content.some((item: any) => item?.type === 'text' && typeof item?.text === 'string')
  )
}

function parseText(result: any) {
  const text = result?.content?.find((item: any) => item?.type === 'text')?.text
  assert(typeof text === 'string', 'tool result should contain text content')
  return JSON.parse(text)
}

async function connect() {
  const client = new Client({ name: 'flyenv-mcp-context-smoke-test', version: '1.0.0' })
  const transport = new StreamableHTTPClientTransport(new URL(url), { fetch: fetchWithAuth })
  await client.connect(transport)
  return { client, transport }
}

async function pickInstalledService(client: Client, flags: string[]) {
  for (const flag of flags) {
    const result = await client.callTool({
      name: 'service_status',
      arguments: { flag }
    })
    if (result?.isError) {
      continue
    }
    const data = parseText(result)
    if (data?.installed > 0 && Array.isArray(data?.versions) && data.versions.length > 0) {
      const version =
        data.versions.find((item: any) => item?.enable && item?.version)?.version ??
        data.versions.find((item: any) => item?.version)?.version
      if (version) {
        return { flag, version }
      }
    }
  }
  return undefined
}

async function main() {
  console.log(`[mcp-context-smoke] target: ${url}`)
  const { client, transport } = await connect()

  try {
    const tools = await client.listTools()
    const names = tools.tools.map((item: any) => item.name)
    for (const name of [
      'get_database_connection_info',
      'resolve_site_runtime',
      'get_service_exec_info',
      'resolve_site_urls',
      'get_managed_file_map'
    ]) {
      assert(names.includes(name), `${name} tool missing`)
    }

    const sitesResult = await client.callTool({
      name: 'list_sites',
      arguments: {}
    })
    assert(hasTextContent(sitesResult), 'list_sites should return text content')
    const sites = parseText(sitesResult)
    const firstSite = Array.isArray(sites) ? sites[0] : undefined

    if (firstSite?.name) {
      const runtime = await client.callTool({
        name: 'resolve_site_runtime',
        arguments: { siteName: firstSite.name }
      })
      assert(hasTextContent(runtime), 'resolve_site_runtime should return text content')
      const runtimeData = parseText(runtime)
      assert(runtimeData?.site?.name === firstSite.name, 'resolve_site_runtime should echo site name')

      const urls = await client.callTool({
        name: 'resolve_site_urls',
        arguments: { siteName: firstSite.name }
      })
      assert(hasTextContent(urls), 'resolve_site_urls should return text content')
      const urlData = parseText(urls)
      assert(Array.isArray(urlData?.urls), 'resolve_site_urls should return urls array')

      const files = await client.callTool({
        name: 'get_managed_file_map',
        arguments: { scope: 'site', name: firstSite.name }
      })
      assert(hasTextContent(files), 'site get_managed_file_map should return text content')
      const fileData = parseText(files)
      assert(fileData?.scope === 'site', 'site get_managed_file_map should return site scope')
    } else {
      console.log('[mcp-context-smoke] no managed site found, skipping site context calls')
    }

    const execService = await pickInstalledService(client, ['php', 'nginx', 'apache', 'caddy', 'frankenphp'])
    if (execService) {
      const execInfo = await client.callTool({
        name: 'get_service_exec_info',
        arguments: execService
      })
      assert(hasTextContent(execInfo), 'get_service_exec_info should return text content')
      const execData = parseText(execInfo)
      assert(execData?.flag === execService.flag, 'get_service_exec_info should echo flag')

      const files = await client.callTool({
        name: 'get_managed_file_map',
        arguments: {
          scope: 'service',
          flag: execService.flag,
          version: execService.version
        }
      })
      assert(hasTextContent(files), 'service get_managed_file_map should return text content')
      const fileData = parseText(files)
      assert(fileData?.scope === 'service', 'service get_managed_file_map should return service scope')
    } else {
      console.log('[mcp-context-smoke] no installed service found, skipping service exec calls')
    }

    const databaseService = await pickInstalledService(client, [
      'mysql',
      'mariadb',
      'postgresql',
      'redis',
      'mongodb',
      'memcached'
    ])
    if (databaseService) {
      const dbInfo = await client.callTool({
        name: 'get_database_connection_info',
        arguments: databaseService
      })
      assert(hasTextContent(dbInfo), 'get_database_connection_info should return text content')
      const dbData = parseText(dbInfo)
      assert(dbData?.flag === databaseService.flag, 'get_database_connection_info should echo flag')
      assert(typeof dbData?.port === 'number', 'get_database_connection_info should return numeric port')
    } else {
      console.log('[mcp-context-smoke] no installed database service found, skipping database calls')
    }

    console.log('[mcp-context-smoke] checks passed')
  } finally {
    await client.close().catch(() => {})
    await transport.close().catch(() => {})
  }
}

main().catch((error) => {
  console.error('[mcp-context-smoke] FAILED:', error?.message || error)
  process.exit(1)
})
