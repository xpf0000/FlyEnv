import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

const url = process.argv[2] || 'http://127.0.0.1:7682'
const token = process.argv[3]

const fetchWithAuth = (target: any, init: any) => {
  const h = new Headers(init?.headers)
  h.set('Authorization', `Bearer ${token}`)
  return fetch(target, { ...(init || {}), headers: h })
}

async function main() {
  const client = new Client({ name: 'ss-test', version: '1.0.0' })
  const transport = new StreamableHTTPClientTransport(new URL(url), { fetch: fetchWithAuth })
  await client.connect(transport)
  try {
    const result = await client.callTool({ name: 'service_status', arguments: { flag: 'nginx' } })
    console.log(JSON.stringify(result, null, 2))
  } finally {
    await client.close().catch(() => {})
    await transport.close().catch(() => {})
  }
}

main().catch((e) => {
  console.error('ERROR:', e?.message || e)
  process.exit(1)
})
