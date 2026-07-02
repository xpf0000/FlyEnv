import assert from 'node:assert/strict'
import {
  startMcpOnLaunchIfNeeded,
  startMcpRuntime,
  stopMcpRuntime
} from '../src/main/core/MCPLifecycle'

class FakeMcpConfigManager {
  store: Record<string, any>

  constructor(store?: Record<string, any>) {
    this.store = {
      autoStart: false,
      independentService: false,
      host: '127.0.0.1',
      port: 7682,
      token: 'test-token',
      transport: { http: true, stdio: false },
      enabledTools: [],
      approval: {},
      allowRemote: false,
      maskSecrets: false,
      ...(store ?? {})
    }
  }

  getConfig(key?: string, defaultValue?: any) {
    if (typeof key === 'undefined') {
      return this.store
    }
    return this.store[key] ?? defaultValue
  }

  setConfig(key: string | Record<string, any>, value?: any) {
    if (typeof key === 'string') {
      this.store[key] = value
    } else {
      Object.assign(this.store, key)
    }
    return this.store
  }
}

class FakeMcpServer {
  starts = 0
  stops = 0
  failStart = false

  async start() {
    this.starts += 1
    if (this.failStart) {
      throw new Error('EADDRINUSE')
    }
    return { running: true, host: '127.0.0.1', port: 7682 }
  }

  async stop() {
    this.stops += 1
    return { running: false }
  }

  status() {
    return { running: this.starts > this.stops }
  }
}

async function testRuntimeHelpersDoNotMutatePreferences() {
  const config = new FakeMcpConfigManager({ autoStart: true, independentService: true })
  const server = new FakeMcpServer()

  await startMcpRuntime(server as any)
  assert.equal(server.starts, 1)
  assert.equal(config.getConfig('autoStart'), true)
  assert.equal(config.getConfig('independentService'), true)
  assert.equal(config.getConfig('enabled'), undefined)

  await stopMcpRuntime(server as any)
  assert.equal(server.stops, 1)
  assert.equal(config.getConfig('autoStart'), true)
  assert.equal(config.getConfig('independentService'), true)
  assert.equal(config.getConfig('enabled'), undefined)
}

async function testAppLaunchAutoStart() {
  const disabledConfig = new FakeMcpConfigManager({ autoStart: false })
  const disabledServer = new FakeMcpServer()
  assert.equal(await startMcpOnLaunchIfNeeded(disabledConfig as any, disabledServer as any), false)
  assert.equal(disabledServer.starts, 0)

  const enabledConfig = new FakeMcpConfigManager({ autoStart: true })
  const enabledServer = new FakeMcpServer()
  assert.equal(await startMcpOnLaunchIfNeeded(enabledConfig as any, enabledServer as any), true)
  assert.equal(enabledServer.starts, 1)

  const failingServer = new FakeMcpServer()
  failingServer.failStart = true
  const errors: string[] = []
  assert.equal(
    await startMcpOnLaunchIfNeeded(enabledConfig as any, failingServer as any, (error) => {
      errors.push(String(error))
    }),
    false
  )
  assert.match(errors[0] ?? '', /EADDRINUSE/)
}

async function main() {
  await testRuntimeHelpersDoNotMutatePreferences()
  await testAppLaunchAutoStart()
  console.log('mcp-lifecycle-preferences-test: ok')
}

main().catch((error) => {
  console.error('mcp-lifecycle-preferences-test: failed', error)
  process.exit(1)
})
