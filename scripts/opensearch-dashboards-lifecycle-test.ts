import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { ForkPromise } from '../src/shared/ForkPromise'

// Exercise the plugin's real orchestration without starting JVM/Node processes.
let parentFailure: Error | undefined
let panelFailure: Error | undefined
let parentStops = 0
let panelStops = 0
let instanceStops = 0
class Parent {
  type = ''
  _stopServer() {
    parentStops++
    return new ForkPromise<any>((resolve, reject, on) => {
      on({ 'APP-On-Log': 'parent progress' })
      on({ 'APP-Service-Stop-Success': true })
      if (parentFailure) reject(parentFailure)
      else resolve({ 'APP-Service-Stop-PID': ['100'] })
    })
  }
}
const panelItem = {
  typeFlag: 'opensearch',
  version: '3.9.0',
  bin: '/panel/node',
  path: '/panel',
  pid: '200',
  dashboard: { configPath: '/data/opensearch/dashboards/config.yml' }
}
const runtime = {
  async prepare() {
    return 'generation'
  },
  async open() {
    return {
      url: 'http://127.0.0.1:5601',
      'APP-Service-Start-PID': '200',
      'APP-Service-Start-Item': panelItem
    }
  },
  async stopAll() {
    panelStops++
    if (panelFailure) throw panelFailure
    return ['200']
  },
  async stopInstance() {
    instanceStops++
    if (panelFailure) throw panelFailure
    return ['200']
  }
}
const deps: Record<string, any> = {
  '@fork/module/Base': { Base: Parent },
  '@fork/Fn': { AppLog: (_level: string, message: string) => message },
  '@fork/util/ServiceStart': {},
  '@fork/TaskQueue': { default: {} },
  '@lang/runtime': { I18nT: (key: string) => key },
  '@shared/utils': { isWindows: () => false, isMacOS: () => false, isLinux: () => true },
  './version': { default: {} },
  './security': {},
  './homebrew': {},
  '../lang': {
    OpenSearchT: (key: string, args?: any) => `${key}: ${args?.pids ?? ''}; ${args?.error ?? ''}`
  },
  './dashboards': {
    ...runtime,
    isOpenSearchDashboardsItem: (item: any) => !!item?.dashboard
  }
}
const file = resolve('plugins/opensearch/fork/OpenSearch/index.ts')
const bundled = await build({
  entryPoints: [file],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false,
  plugins: [
    {
      name: 'lifecycle-boundaries',
      setup(builder) {
        builder.onResolve({ filter: /./ }, (args) =>
          args.kind === 'entry-point' ? undefined : { path: args.path, external: true }
        )
      }
    }
  ]
})
const require = createRequire(file)
const module = { exports: {} as any }
runInNewContext(bundled.outputFiles[0].text, {
  module,
  exports: module.exports,
  require: (name: string) => deps[name] ?? require(name),
  process,
  console,
  global,
  setTimeout,
  clearTimeout
})
const opensearch = module.exports.default
const backend = { version: '3.9.0', bin: '/opensearch/bin', path: '/opensearch', pid: '100' }
assert.equal(typeof opensearch.prepareDashboards, 'function')
const prepared = await opensearch.prepareDashboards(backend)
assert.equal(prepared.prepared, true)
assert.equal(prepared.generation, 'generation')
assert.equal(prepared['APP-Service-Start-PID'], undefined, 'installation is not a service start')
assert.equal(
  typeof opensearch.openDashboards,
  'function',
  'plugin must expose the companion operation'
)
const opened = await opensearch.openDashboards(backend)
assert.equal(opened.url, 'http://127.0.0.1:5601')
const stopArgs = opened['APP-Service-Stop-Args']
assert.equal(stopArgs[0].pid, '200')
assert.equal(stopArgs[1].dashboardsOnly, true)
assert.equal(opened['APP-Service-Stop-Companion'], true)

const progress: any[] = []
const stopped = await opensearch._stopServer(backend).on((event: any) => progress.push(event))
assert.deepEqual(Array.from(stopped['APP-Service-Stop-PID']), ['100', '200'])
assert.equal(
  progress.some((event) => event['APP-On-Log'] === 'parent progress'),
  true
)
assert.equal(progress.filter((event) => event['APP-Service-Stop-Success']).length, 1)

parentFailure = new Error('parent denied')
const beforePanel = panelStops
await assert.rejects(opensearch._stopServer(backend), /200; OpenSearch: Error: parent denied/)
assert.equal(panelStops, beforePanel + 1, 'parent failure must not prevent companion cleanup')
parentFailure = undefined
panelFailure = new Error('panel denied')
const beforeParent = parentStops
await assert.rejects(opensearch._stopServer(backend), /100; Dashboards: Error: panel denied/)
assert.equal(parentStops, beforeParent + 1, 'companion failure must not prevent parent stop')
panelFailure = undefined

const beforePanelOnly = parentStops
const panelOnly = await opensearch._stopServer(panelItem, { dashboardsOnly: true })
assert.deepEqual(Array.from(panelOnly['APP-Service-Stop-PID']), ['200'])
assert.equal(parentStops, beforePanelOnly, 'companion registration must never stop the backend')
assert.equal(instanceStops, 1)
await assert.rejects(
  opensearch._stopServer(backend, { dashboardsOnly: true }),
  /dashboardsInstanceInvalid/
)
assert.equal(parentStops, beforePanelOnly, 'invalid companion identity must not stop the backend')
assert.equal(instanceStops, 1, 'invalid companion identity must not reach the runtime')
console.log('OpenSearch Dashboards parent/companion lifecycle tests passed')
