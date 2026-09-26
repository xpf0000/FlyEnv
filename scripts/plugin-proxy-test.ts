import assert from 'node:assert/strict'
import http from 'node:http'
import { AddressInfo } from 'node:net'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import PluginManager from '../src/main/plugins/PluginManager'

const catalogBody = (id: string) =>
  JSON.stringify({
    plugins: [
      {
        id,
        name: id,
        version: '1.0.0',
        artifact: { url: 'https://example.test/x.flyenv-plugin', sha256: '0'.repeat(64) }
      }
    ]
  })

const listen = (server: http.Server) =>
  new Promise<number>((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port))
  )

let directHits = 0
let proxyHits = 0
const direct = http.createServer((req, res) => {
  directHits += 1
  res.end(catalogBody('direct.plugin'))
})
const proxy = http.createServer((req, res) => {
  proxyHits += 1
  res.end(catalogBody('via-proxy.plugin'))
})

const directPort = await listen(direct)
const proxyPort = await listen(proxy)
const root = await mkdtemp(join(tmpdir(), 'flyenv-plugin-proxy-test-'))

try {
  const previousRegistry = process.env.FLYENV_PLUGIN_REGISTRY_URL
  process.env.FLYENV_PLUGIN_REGISTRY_URL = `http://127.0.0.1:${directPort}/registry.json`
  const manager = new PluginManager({
    pluginsRoot: join(root, 'plugins'),
    statePath: join(root, 'plugins.json')
  })

  // Case 1: proxy configured -> request must go through the proxy
  ;(globalThis as any).Server = { Proxy: { http_proxy: `http://127.0.0.1:${proxyPort}` } }
  const viaProxy = await manager.listCatalog()
  assert.equal(proxyHits, 1, 'expected registry request to hit the proxy')
  assert.equal(directHits, 0, 'registry request bypassed the proxy')
  assert.equal(viaProxy[0]?.id, 'via-proxy.plugin')

  // Case 2: no proxy -> direct request
  delete (globalThis as any).Server.Proxy
  const directCatalog = await manager.listCatalog()
  assert.equal(directHits, 1, 'expected a direct registry request')
  assert.equal(proxyHits, 1, 'proxy should not be hit without proxy config')
  assert.equal(directCatalog[0]?.id, 'direct.plugin')

  if (previousRegistry === undefined) delete process.env.FLYENV_PLUGIN_REGISTRY_URL
  else process.env.FLYENV_PLUGIN_REGISTRY_URL = previousRegistry
  console.log('plugin proxy test passed')
} finally {
  delete (globalThis as any).Server
  direct.close()
  proxy.close()
  await rm(root, { recursive: true, force: true })
}
