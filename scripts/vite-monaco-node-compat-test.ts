import assert from 'node:assert/strict'
import { createServer } from 'vite'
import viteConfigs from '../configs/vite.config'

const server = await createServer(viteConfigs.serverConfig)

try {
  assert.ok(server.middlewares)
} finally {
  await server.close()
}

console.log('vite monaco Node compatibility test passed')
