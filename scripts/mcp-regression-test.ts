import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { MCPTools } from '../src/main/core/MCPTools'
import MCPAudit from '../src/main/core/MCPAudit'
import ServiceProcessManager from '../src/main/core/ServiceProcess'
import ServiceVersionManager from '../src/main/core/ServiceVersionManager'

type ForkCall = {
  module: string
  fn: string
  args: any[]
}

function makeVersion(flag: string, version: string): any {
  return {
    typeFlag: flag as any,
    version,
    bin: `/opt/${flag}/${version}/bin`,
    path: `/opt/${flag}/${version}`,
    num: 1,
    enable: true,
    run: false,
    running: false
  }
}

function createSendResult(result: { code: number; data?: any; msg?: string }) {
  const promise = Promise.resolve(result)
  return {
    on() {
      return this
    },
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise)
  }
}

class FakeForkManager {
  calls: ForkCall[] = []
  installedByFlag: Record<string, any[]> = {}
  onlineByFlag: Record<string, any[]> = {}
  stopFailures = new Set<string>()

  send(module: string, fn: string, ...args: any[]) {
    this.calls.push({ module, fn, args })

    if (module === 'version' && fn === 'allInstalledVersions') {
      const flags = Array.isArray(args[0]) ? args[0] : []
      const data: Record<string, any[]> = {}
      for (const flag of flags) {
        data[flag] = this.installedByFlag[flag] ?? []
      }
      return createSendResult({ code: 0, data })
    }

    if (fn === 'fetchAllOnlineVersion') {
      return createSendResult({ code: 0, data: this.onlineByFlag[module] ?? [] })
    }

    if (fn === 'installSoft') {
      return createSendResult({ code: 0, data: { installed: true } })
    }

    if (fn === 'stopService') {
      const version = args[0]
      if (version?.bin && this.stopFailures.has(version.bin)) {
        return createSendResult({ code: 1, msg: `stop failed for ${version.bin}` })
      }
      return createSendResult({ code: 0, data: {} })
    }

    return createSendResult({ code: 0, data: {} })
  }
}

class FakeMcpConfigManager {
  store: Record<string, any>

  constructor(store?: Record<string, any>) {
    this.store = {
      enabledTools: [],
      approval: {},
      allowRemote: false,
      host: '127.0.0.1',
      port: 0,
      token: 'test-token',
      transport: { http: true, stdio: false },
      maskSecrets: false,
      ...(store ?? {})
    }
  }

  getConfig(key?: string, defaultValue?: any) {
    if (typeof key === 'undefined' && typeof defaultValue === 'undefined') {
      return this.store
    }
    if (typeof key === 'undefined') {
      return defaultValue
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

function resetManagers() {
  ;(ServiceVersionManager as any).cache = {}
  ;(ServiceVersionManager as any).notifyCallbacks = []
  ;(ServiceProcessManager as any).servicePID = {}
}

async function testInstallServiceRefreshesCacheAndNotifiesVersions() {
  resetManagers()
  const forkManager = new FakeForkManager()
  forkManager.onlineByFlag.nginx = [{ version: '1.30.0', url: 'https://example.com/nginx.zip' }]
  forkManager.installedByFlag.nginx = [makeVersion('nginx', '1.30.0')]

  const payloads: any[] = []
  ServiceVersionManager.onMcpNotify((payload) => {
    payloads.push(payload)
  })

  const tools = new MCPTools(forkManager as any, new FakeMcpConfigManager() as any)
  await tools.installService('nginx', '1.30.0')

  assert.deepEqual(
    forkManager.calls.map((item) => `${item.module}:${item.fn}`),
    ['nginx:fetchAllOnlineVersion', 'nginx:installSoft', 'version:allInstalledVersions']
  )
  assert.equal(ServiceVersionManager.getCache().nginx?.[0]?.version, '1.30.0')
  assert.equal(payloads.length, 1)
  assert.equal(payloads[0]?.flag, 'nginx')
  assert.equal(payloads[0]?.versions?.[0]?.version, '1.30.0')
}

async function testStopAllServiceKeepsFailedInstancesInStatus() {
  resetManagers()
  const forkManager = new FakeForkManager()
  const php83 = makeVersion('php', '8.3.0')
  const php84 = makeVersion('php', '8.4.0')
  forkManager.stopFailures.add(php84.bin)
  ServiceVersionManager.updateCache({ php: [php83, php84] })
  ServiceProcessManager.addPid('php', '1001', php83)
  ServiceProcessManager.addPid('php', '1002', php84)

  const tools = new MCPTools(forkManager as any, new FakeMcpConfigManager() as any)
  const result = await tools.stopAllService('php')
  const status = ServiceProcessManager.statusOf('php')

  assert.deepEqual(result.stopped, ['8.3.0'])
  assert.equal(status.instances.length, 1)
  assert.equal(status.instances[0]?.bin, php84.bin)
}

async function testResourcePolicyHelpersAndAudit() {
  resetManagers()
  const tempDir = mkdtempSync(join(tmpdir(), 'flyenv-mcp-regression-'))
  ;(global as any).Server = { BaseDir: tempDir }

  const helper = await import('../src/shared/mcpResourcePolicy')

  try {
    assert.deepEqual(helper.listEnabledResources(['list_services']), ['flyenv://services'])
    assert.equal(helper.canReadResource(['list_services'], 'flyenv://services'), true)
    assert.equal(helper.canReadResource(['list_services'], 'flyenv://sites'), false)

    MCPAudit.log('read_resource', { uri: 'flyenv://services' }, true)
    MCPAudit.log('read_resource', { uri: 'flyenv://sites' }, false, 'resource not enabled')

    const logFile = join(tempDir, 'mcp', 'audit.log')
    const lines = readFileSync(logFile, 'utf-8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line))

    assert(
      lines.some(
        (entry) =>
          entry.tool === 'read_resource' &&
          entry.args?.uri === 'flyenv://services' &&
          entry.success === true
      ),
      'successful read_resource should be audited'
    )
    assert(
      lines.some(
        (entry) =>
          entry.tool === 'read_resource' &&
          entry.args?.uri === 'flyenv://sites' &&
          entry.success === false
      ),
      'failed read_resource should be audited'
    )
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}

async function testClientConfigHelpers() {
  const helper = await import('../src/shared/mcpClientConfig')

  assert.equal(
    helper.getMcpServerUrl({ host: '0.0.0.0', port: 7682, allowRemote: false }),
    'http://127.0.0.1:7682'
  )
  assert.equal(
    helper.getMcpServerUrl({ host: '0.0.0.0', port: 7682, allowRemote: true }),
    'http://127.0.0.1:7682'
  )

  const claude = JSON.parse(
    helper.buildHttpClientConfigSnippet('claudeCode', 'http://127.0.0.1:7682', 'abc')
  )
  assert.equal(claude.mcpServers.flyenv.type, 'http')

  const codex = helper.parseCodexToml(
    helper.buildHttpClientConfigSnippet('codex', 'http://127.0.0.1:7682', 'abc')
  )
  assert.equal(codex.features.rmcp_client, true)
  assert.equal(codex.mcp_servers.flyenv.url, 'http://127.0.0.1:7682')

  const openCode = JSON.parse(
    helper.buildHttpClientConfigSnippet('openCode', 'http://127.0.0.1:7682', 'abc')
  )
  assert.equal(openCode.mcp.flyenv.type, 'remote')
}

async function main() {
  await testInstallServiceRefreshesCacheAndNotifiesVersions()
  await testStopAllServiceKeepsFailedInstancesInStatus()
  await testResourcePolicyHelpersAndAudit()
  await testClientConfigHelpers()
  console.log('mcp regression tests passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
