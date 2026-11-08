import assert from 'node:assert/strict'
import { loadIsolated } from './helpers/load-isolated'
import { HomebrewOperationCoordinator } from '../src/main/core/HomebrewOperationCoordinator'
import { ForkPromise } from '../src/shared/ForkPromise'
const snapshot: any = {
  identity: { prefix: '/opt/homebrew', cellar: '/opt/homebrew/Cellar' },
  affectedRacks: ['/opt/homebrew/Cellar/php'],
  eligible: true,
  fingerprint: 'x',
  formula: 'homebrew/core/php'
}
const independent = new HomebrewOperationCoordinator({
  inspect: async () => snapshot,
  idle: async () => {},
  running: () => [
    { module: 'dns', item: { pid: '123' } as any },
    { module: 'ftp-srv', item: { pid: '124' } as any }
  ],
  run: async () => {
    throw Error('unexpected')
  }
})
assert.equal((await independent.prepareUpgrade('php', 'php')).targets.length, 0)
console.log('PASS independent DNS/FTP do not block preparation')
const noop = () => {}
const serviceEntries: any[] = []
const service: any = {
  servicePID: {},
  waitForAcceptedLifecycles: async () => {},
  addPid: (module: string, pid: string, item: any) => {
    serviceEntries.push({ module, item: { ...item, pid } })
    service.servicePID[module] = [{ pid, item, generation: 11 }]
  }
}
const fmMocks: any = {
  '@shared/PerformanceDiagnostics': {
    performanceDiagnosticNow: () => 0,
    performanceDiagnosticElapsed: () => 0,
    writePerformanceLog: noop
  },
  electron: {},
  './PluginWorkerRegistry': {},
  './ServiceProcess': service,
  './HomebrewOperationCoordinator': { HomebrewOperationCoordinator },
  '@shared/StopProcessList': {},
  '@shared/utils': { appDebugLog: noop },
  '@shared/EnvSync': {},
  '@shared/EnvSyncLocal': {},
  './BinVersionCacheBridge': {},
  './BinVersionCachePersistence': {},
  './BinVersionCacheStore': {},
  './EnvSyncBridge': {},
  './EnvSyncCoordinator': {},
  './ForkIdleLifecycle': {},
  './ForkItem': {},
  './ForkWorkerPolicy': {},
  './StopProcessListBridge': {},
  './StopProcessListCache': {},
  '@shared/ForkPromise': { ForkPromise },
  '@shared/ServiceStopDiagnostics': {},
  '@shared/WindowsPathDiagnostics': { logWindowsPath: noop },
  './ServiceLifecycle': {
    isServiceLifecycleContextExpired: () => false,
    hasServiceLifecyclePermit: () => false,
    serviceLifecycleAction: (_m: any, c: any) => (c === 'startService' ? 'start' : undefined)
  }
}
const { ForkManager } = await loadIsolated('src/main/core/ForkManager.ts', fmMocks)
const fm = Object.create(ForkManager.prototype)
let rawResolve: any
let packageRan = false
const raw = new Promise((r) => {
  rawResolve = r
})
Object.assign(fm, {
  serviceLifecycleRequests: new Set(),
  rawLifecycleRequests: new Set(),
  unknownServiceStarts: new Map(),
  forks: [{ activeTaskCount: 0, isPrimary: true, send: () => raw }],
  pluginWorkers: { isDedicated: () => false },
  invalidateStopProcessList: noop,
  brewQuery: async () => snapshot,
  runBrewPackage: async (id: any, action: any) => {
    packageRan = true
    return { operationId: id, action, outcome: 'succeeded', logs: '' }
  }
})
const item = { bin: '/opt/homebrew/Cellar/php/8.5.7/sbin/php-fpm' }
fm.send('php', 'startService', item)
let prepared = false
const preparation = fm.homebrew.prepareUpgrade('php', 'php').then((p: any) => {
  prepared = true
  return p
})
await new Promise((r) => setTimeout(r, 10))
assert.equal(prepared, false)
rawResolve({
  code: 0,
  data: { 'APP-Service-Start-PID': '999', 'APP-Service-Stop-Args': [{ ...item, pid: '999' }] }
})
const preview = await preparation
assert.equal(preview.targets[0].item.pid, '999')
assert.equal(preview.targets[0].generation, 11)
assert.equal(packageRan, false)
console.log('PASS already-dispatched raw start drained and registered before preview')
const bin = '/opt/homebrew/Cellar/php/8.5.7/sbin/php-fpm'
let generation = 1
const generations = new HomebrewOperationCoordinator({
  inspect: async () => snapshot,
  idle: async () => {},
  running: () => [{ module: 'php', generation, item: { bin, pid: '7' } as any }],
  run: async () => {
    throw Error('unexpected')
  }
})
const p = await generations.prepareUpgrade('php', 'php')
generation = 2
await assert.rejects(generations.beginUpgrade(p.previewId), /changed/)
const p2 = await generations.prepareUpgrade('php', 'php')
await generations.beginUpgrade(p2.previewId)
generation = 3
assert.throws(() => generations.stopTarget('php', { bin, pid: '7' }), /changed/)
assert.doesNotThrow(() => generations.assertStart('dns', undefined))
assert.doesNotThrow(() => generations.assertStart('ftp-srv', undefined))
console.log('PASS generation replacement requires reconfirmation and is checked before stop')
const { ForkItem } = await loadIsolated('src/main/core/ForkItem.ts', {
  ...fmMocks,
  './ForkIdleLifecycle': {},
  '@shared/LanguageProtocol': {},
  '@shared/WindowsPrivilege': {}
})
const retired = Object.create(ForkItem.prototype)
let retiredInfo: any
retired.callback = {
  request: {
    resolve: (info: any) => {
      retiredInfo = info
    }
  }
}
retired.settleCallbacks({ code: 1, msg: 'Fork process exited' })
assert.equal(retiredInfo.outcome, 'unknown')
console.log('PASS worker retirement is explicitly unknown rather than a known service failure')
const uncertainManager = Object.create(ForkManager.prototype)
Object.assign(uncertainManager, {
  serviceLifecycleRequests: new Set(),
  rawLifecycleRequests: new Set(),
  unknownServiceStarts: new Map(),
  forks: [
    {
      activeTaskCount: 0,
      isPrimary: true,
      send: () => Promise.resolve({ code: 1, outcome: 'unknown' })
    }
  ],
  pluginWorkers: { isDedicated: () => false },
  invalidateStopProcessList: noop,
  brewQuery: async () => snapshot
})
await uncertainManager.send('php', 'startService', item)
await assert.rejects(uncertainManager.homebrew.prepareUpgrade('php', 'php'), /unknown/)
console.log(
  'PASS earlier start transport loss blocks upgrade instead of assuming no service was started'
)
