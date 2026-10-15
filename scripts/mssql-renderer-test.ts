import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { join } from 'node:path'

const listeners = new Map<string, (key: string, res: any) => void>()
const sent: any[][] = []
const errors: string[] = []
let serial = 0
let refreshes = 0
let stopResult: boolean | string = true
let stops = 0
const installed: any[] = []
const ipc = {
  send(...args: any[]) {
    const key = `request-${++serial}`
    sent.push([key, ...args])
    return {
      key,
      then(cb: any) {
        listeners.set(key, cb)
      }
    }
  },
  off(key: string) {
    listeners.delete(key)
  }
}
const module = {
  installed,
  installedFetched: true,
  async fetchInstalled() {
    refreshes++
    this.installedFetched = true
  },
  starting: false
}
;(globalThis as any).__mssqlTest = { ipc, module, errors }
;(globalThis as any).window = { Server: { isWindows: false } }
const stubs: Record<string, string> = {
  '@/util/Index': 'export const reactiveBind = x => x',
  '@/util/Storage':
    'export const StorageGetAsync = async () => undefined; export const StorageSetAsync = async () => undefined',
  '@/util/Element':
    'export const MessageError = x => globalThis.__mssqlTest.errors.push(x); export const MessageSuccess = () => {}',
  '@/util/NodeFn':
    'export const fs = { remove: async () => { throw Error("renderer must not delete program files") } }',
  '@/util/IPC': 'export default globalThis.__mssqlTest.ipc',
  '@/store/brew':
    'export const BrewStore = () => ({ module: () => globalThis.__mssqlTest.module })',
  './lang': 'export const MssqlT = key => key'
}
const bundled = await build({
  stdin: {
    contents:
      "export { MssqlPluginManager } from './plugins/mssql/render/store'",
    resolveDir: join(import.meta.dirname, '..'),
    loader: 'ts'
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  plugins: [
    {
      name: 'mssql-renderer-test',
      setup(builder) {
        builder.onResolve({ filter: /.*/ }, (args) =>
          stubs[args.path] ? { path: args.path, namespace: 'test' } : undefined
        )
        builder.onLoad({ filter: /.*/, namespace: 'test' }, (args) => ({
          contents: stubs[args.path],
          loader: 'js'
        }))
      }
    }
  ]
})
const { MssqlPluginManager } = await import(
  `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`
)
const manager = new MssqlPluginManager()
await manager.init()
await manager.saveSettings({ eulaAccepted: true, saPassword: 'Flyenv#2026' })
const row: any = {
  name: 'SQL Server',
  version: '16.0.1-1',
  url: 'https://test/pkg',
  appDir: '/app/mssql/16.0.1-1',
  bin: '/app/mssql/16.0.1-1/opt/mssql/bin/sqlservr',
  zip: '/cache/pkg.deb',
  installed: false,
  downloaded: false
}
manager.onlineVersions.push(row)
const emit = async (action: string, res: any) => {
  await new Promise((resolve) => setTimeout(resolve, 0))
  const request = sent.findLast((args) => args[2] === action)!
  listeners.get(request[0])?.(request[0], res)
}
const first = manager.install(row)
let terminal = false
void first.then(
  () => {
    terminal = true
  },
  () => {
    terminal = true
  }
)
await Promise.resolve()
assert.equal(terminal, false, 'callback-shaped IPC must not reject the install Promise')
assert.equal(
  manager.install({ ...row, downing: false }),
  first,
  'same-version duplicate shares operation'
)
await emit('installSoft', { code: 200, msg: { progress: 45 } })
assert.equal(row.downing, true)
assert.equal(row.progress, 45)
assert.equal(listeners.size, 1)
await assert.rejects(manager.startParams({ bin: row.bin }), /operationInProgress/)
await emit('installSoft', { code: 0, data: true })
assert.equal(await first, true)
assert.equal(row.installed, true)
assert.equal(row.downing, false)
assert.equal(refreshes, 1)
assert.equal(listeners.size, 0)

const failedRow = {
  ...row,
  version: '16.0.2-1',
  bin: '/app/mssql/16.0.2-1/opt/mssql/bin/sqlservr',
  appDir: '/app/mssql/16.0.2-1',
  installed: false
}
const failure = manager.install(failedRow)
await emit('installSoft', { code: 0, data: false })
assert.equal(await failure, false, 'false install result must remain failure')
assert.equal(failedRow.installed, false)
assert.equal(listeners.size, 0)

installed.push({
  bin: row.bin,
  run: true,
  running: false,
  async stop() {
    stops++
    return stopResult
  }
})
stopResult = 'permission denied'
assert.equal(await manager.uninstall(row), false)
assert.equal(row.installed, true)
assert.equal(sent.filter((args) => args[2] === 'uninstallSoft').length, 0)
stopResult = true
const removing = manager.uninstall(row)
await new Promise((resolve) => setTimeout(resolve, 0))
await emit('uninstallSoft', { code: 0, data: true })
assert.equal(await removing, true)
assert.equal(stops, 2)
assert.equal(row.installed, false)
assert.equal(refreshes, 2)
assert.equal(listeners.size, 0)

module.fetchInstalled = async () => {
  throw Error('rescan failed')
}
failedRow.installed = false
const partial = manager.install(failedRow)
await emit('installSoft', { code: 0, data: true })
assert.equal(await partial, true, 'supplementary scan failure cannot undo installation')
assert.equal(failedRow.installed, true)
assert.equal(listeners.size, 0)
assert.ok(errors.some((error) => error.includes('rescan')))
await manager.saveSettings({ eulaAccepted: false })
assert.equal(await manager.install({ ...failedRow, installed: false }), false)
const timedManager = new MssqlPluginManager(10)
await timedManager.saveSettings({ eulaAccepted: true })
const timedRow = { ...failedRow, installed: false, disabled: false }
assert.equal(await timedManager.install(timedRow), false)
assert.equal(timedRow.disabled, true, 'a local timeout leaves installation outcome unknown')
assert.equal(listeners.size, 0)
const requestsBeforeRetry = sent.length
assert.equal(await timedManager.install(timedRow), false)
assert.equal(
  sent.length,
  requestsBeforeRetry,
  'unknown outcome must prevent duplicate installation'
)
console.log('MSSQL renderer lifecycle tests passed')
