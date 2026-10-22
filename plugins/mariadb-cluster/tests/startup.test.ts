import assert from 'node:assert/strict'
import { test } from 'node:test'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { reactive } from 'vue'

async function fixture() {
  const state: any = {
    modules: reactive([]),
    store: reactive({ modules: {} }),
    visible: true,
    ready: true,
    calls: [],
    writes: 0,
    manager: reactive({
      initialized: false,
      allBusy: false,
      catalog: {
        schemaVersion: 1,
        clusters: [
          { id: 'g', name: 'Primary', mode: 'replication', memberIds: ['a', 'b'] },
          { id: 'h', name: 'Other', mode: 'standalone', memberIds: ['c'] }
        ],
        instances: ['a', 'b', 'c'].map((id) => ({ id, engine: { version: '10.11.10' } }))
      },
      snapshots: { a: { state: 'stopped' }, b: { state: 'stopped' }, c: { state: 'stopped' } },
      operations: {},
      async load() {
        state.calls.push(['load'])
        this.initialized = true
      },
      async refresh() {
        state.calls.push(['refresh'])
      },
      async runGroup(group: any, action: string, interactive: boolean) {
        state.calls.push([group.id, action, interactive])
        if (state.result) return state.result
        const snapshots: Record<string, { state: string }> = this.snapshots
        for (const id of group.memberIds)
          snapshots[id] = { state: action === 'stop' ? 'stopped' : 'running' }
        return { status: 'completed', items: [] }
      },
      async runAll(action: string, interactive: boolean) {
        state.calls.push(['all', action, interactive])
        return { status: 'completed', items: [] }
      }
    })
  }
  ;(globalThis as any).__mcStartup = state
  ;(globalThis as any).window = { Server: { DataDirectoryReady: true, MariaDBDir: '/test/mariadb' } }
  const result = await build({
    stdin: {
      contents: `export * from './plugins/mariadb-cluster/render/startup/ClusterModule'; export * from './plugins/mariadb-cluster/render/startup/register'; export {StartupGroupRuntime} from './src/render/components/StartupGroup/class/StartupGroupRuntime'; export {StartupGroupCandidate} from './src/render/components/StartupGroup/class/StartupGroupCandidate'`,
      resolveDir: process.cwd()
    },
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'node',
    external: ['vue'],
    plugins: [
      {
        name: 'startup-host',
        setup(builder) {
          const overrides: Record<string, string> = {
            '@/core/App': 'export const AppModules=globalThis.__mcStartup.modules',
            '@/store/brew': 'export const BrewStore=()=>globalThis.__mcStartup.store',
            '@/store/app':
              'export const AppStore=()=>({config:{setup:{common:{showItem:{"mariadb-cluster":globalThis.__mcStartup.visible}}}},serverCurrent:()=>undefined,UPDATE_SERVER_CURRENT:()=>globalThis.__mcStartup.writes++,saveConfig:async()=>{globalThis.__mcStartup.writes++}})',
            '@/util/Index': 'export const reactiveBind=x=>x',
            '@/util/IPC': 'export default {send(){throw Error("Unexpected generic module IPC")}}',
            '@/core/Module/ModuleInstalledItem': 'export class ModuleInstalledItem {}',
            '@/core/Module/ModuleHomebrewItem': 'export class ModuleHomebrewItem {}',
            '@/core/Module/ModuleMacportsItem': 'export class ModuleMacportsItem {}',
            '@/core/Module/ModuleStaticItem': 'export class ModuleStaticItem {}',
            '@/core/Module/ModuleSdkmanItem': 'export class ModuleSdkmanItem {}',
            '@/util/Brew':
              'export const brewInfo=async()=>[];export const fetchVerion=async()=>[];export const portInfo=async()=>[];export const sdkmanInfo=async()=>[]',
            '@/util/InstalledVersionNote':
              'export const installedVersionNote=()=>"";export const syncInstalledVersionNotes=async()=>{}',
            '@/core/DataDirectoryStartup': 'export const ensureDataDirectoryReady=async()=>true',
            '@/util/NodeFn': 'export const fs={existsSync:async()=>false}',
            './syncStaticInstalledFlags': 'export const syncStaticInstalledFlags=async()=>{}',
            '../manager': 'export const MariadbClusterManager=globalThis.__mcStartup.manager'
          }
          builder.onResolve(
            { filter: /^(?:@|\.\.\/manager$|\.\/syncStaticInstalledFlags$)/ },
            async (args) => {
              if (overrides[args.path]) return { path: args.path, namespace: 'host' }
              if (args.path.startsWith('@/'))
                return builder.resolve(resolve('src/render', args.path.slice(2)), {
                  kind: args.kind,
                  resolveDir: args.resolveDir
                })
              return undefined
            }
          )
          builder.onLoad({ filter: /.*/, namespace: 'host' }, (args) => ({
            contents: overrides[args.path],
            loader: 'js'
          }))
        }
      }
    ]
  })
  const compiled = { exports: {} as any }
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(
    createRequire(import.meta.url),
    compiled,
    compiled.exports
  )
  const api = compiled.exports
  const module = reactive(
    new api.MariadbClusterStartupModule(
      state.manager,
      () => state.ready,
      () => state.visible,
      '/test/mariadb'
    )
  )
  const runtime = new api.StartupGroupRuntime({
    createId: () => 'item',
    getModules: () => [
      {
        typeFlag: 'mariadb-cluster',
        label: 'MariaDB Cluster',
        isService: true,
        moduleType: 'dataBaseServer'
      }
    ],
    getInstalled: async () => {
      await module.fetchInstalled()
      return module.installed
    },
    getProjects: async () => [],
    pathExists: async () => false
  })
  return { state, api, module, runtime }
}

test('startup candidates select whole named clusters, preserve identity and host single-selection policy', async () => {
  const { state, module, runtime, api } = await fixture()
  const candidates = await runtime.listCandidates()
  assert.equal(candidates.length, 2)
  assert.match(candidates[0].displayName, /Primary.*10\.11\.10/)
  const target = module.installed[0],
    path = target.path
  state.manager.credentials = { a: { password: 'never-export-this' } }
  const snapshot = JSON.parse(JSON.stringify(target))
  assert.equal(snapshot.path, path)
  assert.doesNotMatch(JSON.stringify(snapshot), /never-export-this|owner|controller|credentials/)
  assert.equal(Object.keys(target).includes('owner'), false)
  assert.equal(Object.keys(module).includes('controller'), false)
  state.manager.catalog.clusters[0].name = 'Renamed'
  await module.fetchInstalled()
  assert.equal(module.installed[0], target)
  assert.equal(target.path, path)
  assert.match(target.version, /Renamed/)
  const picker = new api.StartupGroupCandidate(() => 'id')
  assert.equal(picker.allowsMultiple(candidates[0]), false)
  assert.deepEqual(
    picker.normalizeSelection(
      candidates.map((c: any) => c.key),
      candidates
    ),
    [candidates[1].key]
  )
  await module.onItemStart(target, false)
  module.resetCurrentVersion(true)
  await module.applyInstalledVersions([{ bin: 'host-notification' }])
  module.watchShowHide()
  module.watchShowHide()
  assert.equal(state.writes, 0)
  assert.equal(module.installed.length, 2)
})

test('real startup runner forwards background intent and partial stop, with documented partial-start skip', async () => {
  const { state, module, runtime } = await fixture()
  const [candidate] = await runtime.listCandidates()
  const group = {
    id: 'startup',
    name: 'startup',
    items: [candidate.item],
    createdAt: 0,
    updatedAt: 0
  }
  assert.equal((await runtime.runner.run(group, 'start', false)).members[0].outcome, 'started')
  assert.deepEqual(
    state.calls.find((v: any[]) => v[0] === 'g'),
    ['g', 'start', false]
  )
  state.manager.snapshots.b.state = 'stopped'
  const target = module.installed[0]
  target.run = false
  target.pid = '999'
  assert.equal(target.run, true)
  assert.equal(target.pid, '')
  const previous = state.calls.filter((v: any[]) => v[0] === 'g').length
  assert.equal((await runtime.runner.run(group, 'start')).members[0].outcome, 'skipped')
  assert.equal(state.calls.filter((v: any[]) => v[0] === 'g').length, previous)
  assert.equal((await runtime.runner.run(group, 'stop', false)).members[0].outcome, 'stopped')
  assert.deepEqual(state.calls.filter((v: any[]) => v[0] === 'g').at(-1), ['g', 'stop', false])
  assert.equal(target.run, false)
})

test('startup admission retains busy state, rejects hidden starts and reports partial failures', async () => {
  const { state, module } = await fixture()
  state.ready = false
  assert.equal(await module.fetchInstalled(), false)
  assert.equal(state.calls.length, 0)
  state.ready = true
  await Promise.all([module.fetchInstalled(), module.fetchInstalled()])
  assert.equal(state.calls.filter((v: any[]) => v[0] === 'load').length, 1)
  const target = module.installed[0]
  state.manager.operations.b = { busy: true }
  assert.equal(target.running, true)
  state.manager.operations.b.busy = false
  state.manager.allBusy = true
  assert.equal(target.running, true)
  state.manager.allBusy = false
  state.visible = false
  assert.equal(typeof (await target.start(false)), 'string')
  assert.equal(
    state.calls.some((v: any[]) => v[0] === 'g'),
    false
  )
  state.visible = true
  state.result = {
    status: 'partial',
    items: [
      { id: 'a', status: 'completed' },
      { id: 'b', status: 'failed', error: 'cannot stop' }
    ]
  }
  assert.match(await target.stop(false), /cannot stop/)
  state.manager.catalog.clusters = []
  await module.fetchInstalled()
  assert.match(await target.start(), /unavailable/i)
})

test('membership registration survives host hot-update ordering and re-enable without deleting replacements', async () => {
  const { state, api } = await fixture()
  const old = { typeFlag: 'mariadb-cluster' },
    fresh = { typeFlag: 'mariadb-cluster' }
  const current = () => state.store.modules['mariadb-cluster']
  const releaseOld = api.registerMariadbClusterStartup(old)
  assert.equal(current(), undefined)
  state.modules.push(old)
  const oldModule = current()
  assert.equal(oldModule.isPlugin, true)
  const releaseNew = api.registerMariadbClusterStartup(fresh)
  assert.equal(current(), oldModule)
  state.modules.splice(0, 1)
  delete state.store.modules['mariadb-cluster']
  state.modules.push(fresh)
  const replacement = current()
  assert.notEqual(replacement, oldModule)
  releaseOld()
  assert.equal(current(), replacement)
  state.modules.splice(0, 1)
  assert.equal(current(), undefined)
  state.modules.push(fresh)
  assert.equal(current().isPlugin, true)
  releaseNew()
  assert.equal(current(), undefined)
  assert.equal(state.writes, 0)
})

test('cluster discovery failure skips only its projections and preserves valid host sibling candidates', async () => {
  const { state, module, api } = await fixture()
  await module.fetchInstalled()
  state.manager.refresh = async () => {
    throw new Error('Cluster catalog unavailable')
  }
  const sibling = { enable: true, version: '7.4', bin: '/redis/bin', path: '/redis' }
  const runtime = new api.StartupGroupRuntime({
    createId: () => 'item',
    getModules: () => [
      { typeFlag: 'mariadb-cluster', label: 'MariaDB Cluster', isService: true },
      { typeFlag: 'redis', label: 'Redis', isService: true }
    ],
    getInstalled: async (flag: string) => {
      if (flag !== 'mariadb-cluster') return [sibling]
      await module.fetchInstalled()
      return module.installed
    },
    getProjects: async () => [],
    pathExists: async () => true
  })
  const candidates = await runtime.listCandidates()
  assert.equal(candidates.length, 1)
  assert.equal(candidates[0].item.module, 'redis')
  assert.equal(module.installedFetched, false)
  assert.equal(module.installed.length, 0)
  assert.match(state.manager.loadError, /catalog unavailable/)
})
