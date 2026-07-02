import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

const url = process.argv[2] || 'http://127.0.0.1:7682'
const token = process.argv[3]

const fetchWithAuth = (target: any, init: any) => {
  const h = new Headers(init?.headers)
  h.set('Authorization', `Bearer ${token}`)
  return fetch(target, { ...(init || {}), headers: h })
}

async function call(name: string, args: any) {
  const client = new Client({ name: 'quick-test', version: '1.0.0' })
  const transport = new StreamableHTTPClientTransport(new URL(url), { fetch: fetchWithAuth })
  await client.connect(transport)
  try {
    const result = await client.callTool({ name, arguments: args })
    console.log(`\n=== ${name} ===`)
    console.log(JSON.stringify(result, null, 2))
  } finally {
    await client.close().catch(() => {})
    await transport.close().catch(() => {})
  }
}

async function main() {
  await call('list_sites', {})
  await call('list_online_versions', { flag: 'nginx' })
  await call('service_status', { flags: ['nginx'] })
}

main().catch((e) => {
  console.error('ERROR:', e?.message || e)
  process.exit(1)
})
