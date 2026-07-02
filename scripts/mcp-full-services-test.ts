#!/usr/bin/env node

import assert from 'node:assert/strict'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { AppModuleEnum } from '@/core/type'

const url = process.argv[2] || 'http://127.0.0.1:7682'
const token = process.argv[3]

if (!token) {
  console.error('Usage: npx tsx scripts/mcp-full-services-test.ts <url> <token>')
  process.exit(1)
}

const fetchWithAuth = (target: any, init: any) => {
  const headers = new Headers(init?.headers)
  headers.set('Authorization', `Bearer ${token}`)
  return fetch(target, { ...(init || {}), headers })
}

function withTimeout<T>(label: string, promise: Promise<T>, timeoutMs = 5000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timeout after ${timeoutMs}ms`)), timeoutMs)
    })
  ])
}

function hasTextContent(result: any) {
  return (
    Array.isArray(result?.content) &&
    result.content.some((c: any) => c?.type === 'text' && typeof c?.text === 'string')
  )
}

async function main() {
  const client = new Client({ name: 'flyenv-mcp-full-services-test', version: '1.0.0' })
  const transport = new StreamableHTTPClientTransport(new URL(url), { fetch: fetchWithAuth })
  await client.connect(transport)

  try {
    const gitStatus = await withTimeout(
      'service_status git',
      client.callTool({ name: 'service_status', arguments: { flag: 'git' } })
    )
    assert.equal(gitStatus?.isError, false, 'service_status git should succeed')
    assert.equal(hasTextContent(gitStatus), true, 'service_status git should return text content')

    const allServices = await withTimeout(
      'list_services all flags',
      client.callTool({
        name: 'list_services',
        arguments: { flags: Object.values(AppModuleEnum) }
      })
    )
    assert.equal(allServices?.isError, false, 'list_services all flags should succeed')
    assert.equal(hasTextContent(allServices), true, 'list_services all flags should return text')

    const resource = await withTimeout(
      'read_resource flyenv://services',
      client.readResource({ uri: 'flyenv://services' })
    )
    assert.equal(resource?.contents?.[0]?.uri, 'flyenv://services')
    assert.equal(resource?.contents?.[0]?.mimeType, 'application/json')

    console.log('mcp full services test passed')
  } finally {
    await client.close().catch(() => {})
    await transport.close().catch(() => {})
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
