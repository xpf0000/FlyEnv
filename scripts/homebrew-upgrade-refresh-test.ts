import assert from 'node:assert/strict'
import { loadIsolated } from './helpers/load-isolated'
const config = {
  setup: {
    PATH: 'old',
    alias: 'old',
    hosts: ['old'],
    StartupGroup: ['old'],
    notes: 'old',
    ini: 'old'
  },
  current: { bin: 'old' }
}
const before = JSON.stringify(config)
const brewQueries: ((data: any[]) => void)[] = []
let saved = 0
let pruned = 0
let loaded = 0
let callback: any
const { Module } = await loadIsolated(
  'src/render/core/Module/Module.ts',
  {
    '@/store/app': {
      AppStore: () => ({
        config,
        serverCurrent: () => ({ current: config.current }),
        UPDATE_SERVER_CURRENT: () => {
          config.current.bin = 'new'
        },
        saveConfig: () => {
          saved++
          return Promise.resolve()
        }
      })
    },
    '@/util/IPC': {
      send: () => ({
        key: 'key',
        then: (cb: any) => {
          callback = cb
        }
      }),
      off() {}
    },
    '@/core/Module/ModuleInstalledItem': {
      ModuleInstalledItem: class {
        constructor(item: any) {
          Object.assign(this, item)
        }
        start() {}
        stop() {}
        setEnv() {}
      }
    },
    '@/core/Module/ModuleHomebrewItem': {},
    '@/core/Module/ModuleMacportsItem': {},
    '@/core/Module/ModuleStaticItem': {},
    '@/core/Module/ModuleSdkmanItem': {},
    '@/util/Brew': {
      brewInfo: () =>
        new Promise((resolve) => {
          brewQueries.push(resolve)
        })
    },
    '@/util/InstalledVersionNote': {
      syncInstalledVersionNotes: async () => {
        pruned++
      },
      loadInstalledVersionNotes: async () => {
        loaded++
      },
      installedVersionNote: () => 'saved note'
    },
    './syncStaticInstalledFlags': { syncStaticInstalledFlags: async () => {} },
    '@/core/DataDirectoryStartup': {},
    '@/util/NodeFn': { fs: {} }
  },
  { window: { Server: { DataDirectoryReady: true } } }
)
const m = new Module()
m.typeFlag = 'mysql'
const normal = m.fetchInstalled()
const preserved = m.fetchInstalled(false, { updateCurrent: false, pruneNotes: false })
await callback('key', {
  code: 0,
  data: { mysql: [{ bin: 'new', path: 'new', version: '8.5', enable: true }] }
})
assert.equal(await normal, true)
assert.equal(await preserved, true)
assert.equal(m.installed[0].bin, 'new')
assert.equal(JSON.stringify(config), before)
assert.equal(saved, 0)
assert.equal(pruned, 0)
assert.equal(loaded, 1)
m.installedFetched = false
const failure = m.fetchInstalled(false, { updateCurrent: false, pruneNotes: false })
await callback('key', { code: 1, msg: 'failure' })
assert.equal(await failure, false)
console.log(
  'PASS refresh: restrictive coalescing, new list, unchanged current/PATH/alias/hosts/startup/notes/config, failure reported'
)
// A post-package refresh must not report success from a query started before close.
m.installedFetched = false
const earlier = m.fetchInstalled()
const earlierCallback = callback
let freshDone = false
const fresh = m
  .fetchInstalled(false, { updateCurrent: false, pruneNotes: false, fresh: true })
  .then((ok: boolean) => {
    freshDone = true
    return ok
  })
await earlierCallback('key', {
  code: 0,
  data: { mysql: [{ bin: 'old-flight', path: 'old-flight', version: '8.4', enable: true }] }
})
await earlier
await new Promise((r) => setTimeout(r, 0))
assert.equal(freshDone, false)
assert.notEqual(callback, earlierCallback)
await callback('key', {
  code: 0,
  data: { mysql: [{ bin: 'post-upgrade', path: 'post-upgrade', version: '8.5', enable: true }] }
})
assert.equal(await fresh, true)
assert.equal(m.installed[0].bin, 'post-upgrade')
assert.equal(JSON.stringify(config), before)
assert.equal(pruned, 0)
console.log(
  'PASS refresh: fresh query after older flight settles, with preservation policy retained'
)

const brewOld = m.fetchBrew()
let brewFreshDone = false
const brewNew = m.fetchBrew(true).then((ok: boolean) => {
  brewFreshDone = true
  return ok
})
brewQueries[0]([])
await brewOld
await new Promise((r) => setTimeout(r, 0))
assert.equal(brewFreshDone, false)
assert.equal(brewQueries.length, 2)
brewQueries[1]([])
assert.equal(await brewNew, true)
console.log('PASS fresh Homebrew catalog starts after the older flight finishes')
