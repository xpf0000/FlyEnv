import assert from 'node:assert/strict'
import { MCPRuntime } from '../src/main/core/MCPRuntime'

class FakeServer {
  starts = 0
  stops = 0

  async start() {
    this.starts += 1
    return { running: true }
  }

  async stop() {
    this.stops += 1
    return { running: false }
  }

  status() {
    return { running: this.starts > this.stops, host: '127.0.0.1', port: 7682 }
  }
}

let autoStart = false
let loads = 0
const server = new FakeServer()
const config = {
  getConfig(key?: string, fallback?: any) {
    if (key === 'autoStart') return autoStart
    if (key) return fallback
    return { host: '127.0.0.1', port: 7682, transport: { http: true }, enabledTools: [] }
  }
}
const runtime = new MCPRuntime(config as any, async () => {
  loads += 1
  return server as any
})

assert.equal(await runtime.startOnLaunch(), false)
assert.equal(loads, 0, 'disabled auto-start must not load MCP')
assert.equal(runtime.status().running, false)
assert.deepEqual(await runtime.stopLoaded(), { running: false })
assert.equal(loads, 0, 'status and shutdown must not load MCP')

autoStart = true
assert.equal(await runtime.startOnLaunch(), true)
assert.equal(loads, 1)
assert.equal(server.starts, 1)
assert.equal(runtime.status().running, true)
await runtime.stopLoaded()
assert.equal(server.stops, 1)

console.log('MCP lazy runtime tests passed')
