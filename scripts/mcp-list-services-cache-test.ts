import assert from 'node:assert/strict'
import { MCPTools } from '../src/main/core/MCPTools'
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

function createSendResult(data: any) {
  const promise = Promise.resolve({ code: 0, data })
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
  private versionsByFlag: Record<string, any[]>

  constructor(versionsByFlag: Record<string, any[]> = {}) {
    this.versionsByFlag = versionsByFlag
  }

  send(module: string, fn: string, ...args: any[]) {
    this.calls.push({ module, fn, args })
    if (module !== 'version' || fn !== 'allInstalledVersions') {
      return createSendResult({})
    }
    const flags = Array.isArray(args[0]) ? args[0] : []
    const data: Record<string, any[]> = {}
    for (const flag of flags) {
      data[flag] = this.versionsByFlag[flag] ?? []
    }
    return createSendResult(data)
  }
}

function createTools(versionsByFlag: Record<string, any[]> = {}) {
  const forkManager = new FakeForkManager(versionsByFlag)
  const mcpConfig = {
    getConfig(_key?: string, defaultValue?: any) {
      return defaultValue
    }
  }
  const tools = new MCPTools(forkManager as any, mcpConfig as any)
  return { tools, forkManager }
}

function resetManagers() {
  ;(ServiceVersionManager as any).cache = {}
  ;(ServiceProcessManager as any).servicePID = {}
}

async function testNoFlagsUsesCacheOnly() {
  resetManagers()
  const { tools, forkManager } = createTools()
  ServiceVersionManager.updateCache({
    nginx: [makeVersion('nginx', '1.29.0')],
    mysql: [makeVersion('mysql', '8.4.0')]
  })

  const result = await tools.listServices(undefined as any)

  assert.deepEqual(Object.keys(result).sort(), ['mysql', 'nginx'])
  assert.equal(result.nginx.versions[0].version, '1.29.0')
  assert.equal(result.mysql.versions[0].version, '8.4.0')
  assert.equal(forkManager.calls.length, 0)
}

async function testEmptyFlagsUsesCacheOnly() {
  resetManagers()
  const { tools, forkManager } = createTools()
  ServiceVersionManager.updateCache({
    redis: [makeVersion('redis', '7.4.0')]
  })

  const result = await tools.listServices([])

  assert.deepEqual(Object.keys(result), ['redis'])
  assert.equal(result.redis.versions[0].version, '7.4.0')
  assert.equal(forkManager.calls.length, 0)
}

async function testFlagsRefreshOnlyMissingEntries() {
  resetManagers()
  const { tools, forkManager } = createTools({
    mysql: [makeVersion('mysql', '8.4.0')]
  })
  ServiceVersionManager.updateCache({
    nginx: [makeVersion('nginx', '1.29.0')]
  })

  const result = await tools.listServices(['nginx', 'mysql'])

  assert.equal(forkManager.calls.length, 1)
  assert.equal(forkManager.calls[0]?.module, 'version')
  assert.equal(forkManager.calls[0]?.fn, 'allInstalledVersions')
  assert.deepEqual(forkManager.calls[0]?.args[0], ['mysql'])
  assert.equal(result.nginx.versions[0].version, '1.29.0')
  assert.equal(result.mysql.versions[0].version, '8.4.0')
}

async function testCachedEmptyArrayDoesNotRefresh() {
  resetManagers()
  const { tools, forkManager } = createTools({
    mysql: [makeVersion('mysql', '8.4.0')]
  })
  ServiceVersionManager.updateCache({
    mysql: []
  })

  const result = await tools.listServices(['mysql'])

  assert.equal(forkManager.calls.length, 0)
  assert.deepEqual(result.mysql.versions, [])
}

async function main() {
  await testNoFlagsUsesCacheOnly()
  await testEmptyFlagsUsesCacheOnly()
  await testFlagsRefreshOnlyMissingEntries()
  await testCachedEmptyArrayDoesNotRefresh()
  console.log('mcp list_services cache behavior tests passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
