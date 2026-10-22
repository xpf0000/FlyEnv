import assert from 'node:assert/strict'
import { test } from 'node:test'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { reactive } from 'vue'
import { createDraftRequest } from '../render/form'
import type { ClusterMode } from '../shared'

async function loadManager() {
  const state: any = {
    catalog: { schemaVersion: 1, instances: [], clusters: [] },
    running: new Set<string>(),
    sent: [],
    saved: undefined,
    store: reactive({ config: { setup: { common: { showItem: {} } } } })
  }
  const module: any = reactive({
    installed: [],
    startSingleFlight: (task: any) => task(),
    onItemStart: async () => module
  })
  state.module = module
  state.ipc = {
    send(channel: string, ...input: any[]) {
      // Electron's preload IPC serializes the complete argument list, including extensions.
      const args = structuredClone(input)
      state.sent.push({ channel, args })
      const key = String(state.sent.length)
      return {
        key,
        then(callback: any) {
          queueMicrotask(() => {
            const [method, ...params] = args
            let data: any = true
            if (method === 'prepareInstances' || method === 'updateInstances')
              state.catalog = {
                schemaVersion: 1,
                instances: params[0].instances,
                clusters: [params[0].cluster]
              }
            if (['prepareInstances', 'updateInstances', 'readCatalog'].includes(method))
              data = state.catalog
            if (method === 'instanceDescriptors')
              data = state.catalog.instances.map((i: any) => ({
                typeFlag: 'mariadb-cluster',
                version: i.engine.version,
                source: i.engine.source,
                bin: `/test/mariadb/mariadb-cluster/instances/${i.id}/my.cnf`,
                path: `/test/mariadb/mariadb-cluster/instances/${i.id}`
              }))
            if (method === 'listInstances')
              data = state.catalog.instances.map((i: any) => ({
                id: i.id,
                state: state.running.has(i.id) ? 'running' : 'stopped',
                pid: state.running.has(i.id) ? '123' : ''
              }))
            if (method === 'startService') {
              state.running.add(params[1].id)
              data = { 'APP-Service-Start-PID': '123' }
            }
            if (method === 'stopService') state.running.delete(params[1].id)
            if (method === 'replicationStatus') data = { state: 'online', role: 'SOURCE', lag: 0 }
            if (['configureReplication'].includes(method))
              data = {
                status: 'completed',
                items: state.catalog.instances.map((i: any) => ({
                  id: i.id,
                  status: 'completed',
                  stage: 'replication'
                }))
              }
            if (method === 'removeRecords')
              state.catalog = { schemaVersion: 1, instances: [], clusters: [] }
            callback(key, { code: 0, data: structuredClone(data) })
          })
        }
      }
    },
    off() {}
  }
  ;(globalThis as any).__mcTransport = state
  const windowBefore = (globalThis as any).window
  ;(globalThis as any).window = { Server: { MariaDBDir: '/test/mariadb' } }
  const overrides: Record<string, string> = {
    '@/store/app': 'export const AppStore=()=>globalThis.__mcTransport.store',
    '@/store/brew': 'export const BrewStore=()=>({module:()=>globalThis.__mcTransport.module})',
    '@/util/IPC': 'export default globalThis.__mcTransport.ipc',
    '@/util/Storage':
      'export const StorageGetAsync=async()=>globalThis.__mcTransport.saved; export const StorageSetAsync=async(_key,value)=>{globalThis.__mcTransport.saved=structuredClone(value)}',
    '@/components/ServiceManager/EXT/store': 'export const ServiceActionStore={}',
    '@lang/index': 'export const I18nT=key=>key;export const AppI18n=()=>({global:{locale:"en"}})',
    './notice':
      'export const MessageError=()=>{};export const MessageSuccess=()=>{};export const MessageErrorDialog=async()=>{}'
  }
  const result = await build({
    entryPoints: ['plugins/mariadb-cluster/render/manager.ts'],
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'node',
    external: ['vue'],
    plugins: [
      {
        name: 'ipc-boundary',
        setup(builder) {
          builder.onResolve({ filter: /^(?:@|\.\/notice$)/ }, async (args) => {
            if (overrides[args.path]) return { path: args.path, namespace: 'host' }
            if (args.path.startsWith('@/'))
              return builder.resolve(resolve('src/render', args.path.slice(2)), {
                kind: args.kind,
                resolveDir: args.resolveDir
              })
            return undefined
          })
          builder.onLoad({ filter: /.*/, namespace: 'host' }, (args) => ({
            contents: overrides[args.path],
            loader: 'js'
          }))
        }
      }
    ]
  })
  const exports: any = {},
    compiled = { exports }
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(
    createRequire(import.meta.url),
    compiled,
    exports
  )
  return {
    state,
    ...compiled.exports,
    cleanup() {
      compiled.exports.releaseLifecycle()
      ;(globalThis as any).window = windowBefore
      delete (globalThis as any).__mcTransport
    }
  }
}

for (const mode of ['replication'] as ClusterMode[]) {
  test(`real renderer lifecycle and ${mode} RPC payloads survive the Electron structured-clone boundary`, async () => {
    const fixture = await loadManager()
    const manager = fixture.MariadbClusterManager
    try {
      const input = createDraftRequest(
        {
          id: 'abc123',
          name: 'test',
          mode,
          count: 1,
          startPort: 13307,
          rootDir: '/tmp/mdbc',
          password: 'Synthetic-19',
          engine: {
            version: '10.11.10',
            path: '/mariadb',
            bin: '/mariadb/bin/mariadbd',
            source: 'Static'
          }
        },
        'macOS'
      )
      const created = await manager.create(reactive(input))
      assert.equal(created.status, 'completed', JSON.stringify(created))
      const group = manager.catalog.clusters[0]
      const sqlMethods = ['configureReplication', 'replicationStatus']
      const sqlCalls = fixture.state.sent.filter((item: any) =>
        sqlMethods.includes(item.args[0])
      ).length
      manager.credentials = {}
      assert.equal((await manager.runGroup(group, 'restart')).status, 'completed')
      assert.equal(
        fixture.state.sent.filter((item: any) => sqlMethods.includes(item.args[0])).length,
        sqlCalls
      )
      assert.equal((await manager.runInstance(group.memberIds[0], 'restart')).status, 'completed')
      assert.equal(
        fixture.state.sent.filter((item: any) => sqlMethods.includes(item.args[0])).length,
        sqlCalls
      )
      assert.equal((await manager.remove(group)).status, 'completed')
      assert.ok(fixture.state.sent.some((i: any) => i.args[0] === 'configureReplication'))
      assert.deepEqual(fixture.state.catalog.instances, [])
    } finally {
      fixture.cleanup()
    }
  })
}
