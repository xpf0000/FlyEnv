#!/usr/bin/env node
/**
 * 逐个 flag 调用 service_status，找出卡住的模块
 *
 * 用法：
 *   npx tsx scripts/mcp-diagnose-flags.ts [url] [token]
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { AppModuleEnum } from '@/core/type'

const url = process.argv[2] || 'http://127.0.0.1:7682'
const token = process.argv[3]

if (!token) {
  console.error('Usage: npx tsx scripts/mcp-diagnose-flags.ts <url> <token>')
  process.exit(1)
}

const flags = Object.values(AppModuleEnum)

const fetchWithAuth = (target: any, init: any) => {
  const headers = new Headers(init?.headers)
  headers.set('Authorization', `Bearer ${token}`)
  return fetch(target, { ...(init || {}), headers })
}

async function testFlag(client: Client, flag: string, timeoutMs = 30000) {
  return new Promise<{ flag: string; ok: boolean; time: number; error?: string }>((resolve) => {
    const start = Date.now()
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      resolve({ flag, ok: false, time: Date.now() - start, error: 'timeout' })
    }, timeoutMs)

    client
      .callTool({ name: 'service_status', arguments: { flag } })
      .then(() => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve({ flag, ok: true, time: Date.now() - start })
      })
      .catch((e: any) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve({ flag, ok: false, time: Date.now() - start, error: e?.message || `${e}` })
      })
  })
}

async function main() {
  console.log(`[diag] target: ${url}`)
  console.log(`[diag] flags count: ${flags.length}`)

  const client = new Client({ name: 'flyenv-mcp-diag', version: '1.0.0' })
  const transport = new StreamableHTTPClientTransport(new URL(url), { fetch: fetchWithAuth })
  await client.connect(transport)

  try {
    const results: Awaited<ReturnType<typeof testFlag>>[] = []
    for (const flag of flags) {
      process.stdout.write(`[diag] ${flag} ... `)
      const r = await testFlag(client, flag, 30000)
      results.push(r)
      if (r.ok) {
        console.log(`ok ${r.time}ms`)
      } else {
        console.log(`FAIL ${r.error} (${r.time}ms)`)
      }
    }

    const failed = results.filter((r) => !r.ok)
    console.log(`\n[diag] done. failed/timeout: ${failed.length}`)
    if (failed.length) {
      console.log(failed.map((r) => `  - ${r.flag}: ${r.error} (${r.time}ms)`).join('\n'))
    }
  } finally {
    await client.close().catch(() => {})
    await transport.close().catch(() => {})
  }
}

main().catch((e) => {
  console.error('\n[diag] ERROR:', e?.message || e)
  process.exit(1)
})
