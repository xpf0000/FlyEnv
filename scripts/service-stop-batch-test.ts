import assert from 'node:assert/strict'
import ServiceProcessManager from '../src/main/core/ServiceProcess'
import { ForkPromise } from '../src/shared/ForkPromise'
import { currentServiceStopContext } from '../src/shared/ServiceStopContext'
import type { SoftInstalled } from '../src/shared/app'
import type { ForkManager } from '../src/main/core/ForkManager'

const Manager = ServiceProcessManager.constructor as new () => typeof ServiceProcessManager
const manager = new Manager()
const processList = [
  { PID: '4200', PPID: '1', USER: 'user', COMMAND: 'server', CREATED: '2026-10-06T00:00:00.000Z' }
]
let queries = 0
const pending = new Map<string, (result: any) => void>()
const dispatched = Promise.withResolvers<void>()
manager.forkManager = {
  invalidateStopProcessList() {},
  async fetchStopProcessListSnapshot() {
    queries++
    return processList
  },
  send(module: string, command: string) {
    assert.equal(command, 'stopService')
    assert.strictEqual(currentServiceStopContext()?.processList, processList)
    assert.equal(currentServiceStopContext()?.reason, 'quit')
    return new ForkPromise((resolve) => {
      pending.set(module, resolve)
      if (pending.size === 3) dispatched.resolve()
    })
  }
} as unknown as ForkManager
for (const [index, module] of ['nginx', 'php', 'mysql'].entries()) {
  manager.addPid(module, String(4200 + index), {
    bin: `/app/${module}`,
    version: '1'
  } as SoftInstalled)
}
let completed = false
const batch = manager.stopRegisteredInstances(undefined, 'quit').then((result) => {
  completed = true
  return result
})
// All stops must dispatch before any finishes; a failed sibling cannot end the batch early.
const dispatchTimeout = setTimeout(
  () => dispatched.reject(new Error('Stops were not dispatched in parallel')),
  5000
)
try {
  await dispatched.promise
} finally {
  clearTimeout(dispatchTimeout)
}
assert.equal(pending.size, 3, 'all modules must dispatch in parallel')
assert.equal(queries, 1, 'one shared initial snapshot per batch')
pending.get('nginx')!({ code: 1, msg: 'stop failed' })
await new Promise<void>((resolve) => setImmediate(resolve))
assert.equal(completed, false)
pending.get('php')!({ code: 0, data: { 'APP-Service-Stop-PID': ['4201'] } })
pending.get('mysql')!({ code: 0, data: { 'APP-Service-Stop-PID': ['4202'] } })
const result = await batch
assert.deepEqual(
  result.map(({ status }) => status),
  ['failed', 'stopped', 'stopped']
)
assert.equal(manager.servicePID.nginx.length, 1, 'failed registration must remain')
assert.equal(manager.servicePID.php.length, 0)
assert.equal(manager.servicePID.mysql.length, 0)
console.log('Parallel service stop and supplied snapshot tests passed')
