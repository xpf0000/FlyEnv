import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { StopProcessListClient } from '../src/fork/StopProcessListClient'
import { StopProcessListBridge } from '../src/main/core/StopProcessListBridge'
import { StopProcessListCache } from '../src/main/core/StopProcessListCache'
import type { PItem } from '../src/shared/Process'
import { ProcessPidListByPid, ProcessPidListByPids } from '../src/shared/Process.win'
import {
  StopProcessListAccess,
  StopProcessListFetch,
  isStopProcessListRequest,
  isStopProcessListResponse,
  setStopProcessListProvider,
  type StopProcessListResponse
} from '../src/shared/StopProcessList'

const firstList: PItem[] = [{ USER: 'user', PID: '10', PPID: '1', COMMAND: '/opt/flyenv/nginx' }]

let now = 0
let fetchCount = 0
let releaseFetch!: () => void
const fetchGate = new Promise<void>((resolve) => {
  releaseFetch = resolve
})
const events: string[] = []
const cache = new StopProcessListCache(
  async () => {
    fetchCount += 1
    await fetchGate
    return firstList
  },
  {
    now: () => now,
    ttlMs: 350,
    onEvent: (event) => events.push(event.type)
  }
)

const first = cache.get()
const joined = cache.get()
await Promise.resolve()
assert.equal(fetchCount, 1)
releaseFetch()
now = 100
assert.strictEqual(await first, firstList)
assert.strictEqual(await joined, firstList)
assert.deepEqual(events, ['miss', 'join', 'fetch-success'])

now = 449
assert.strictEqual(await cache.get(), firstList)
assert.equal(fetchCount, 1)

now = 450
const secondList: PItem[] = [{ USER: 'user', PID: '11', PPID: '1', COMMAND: '/opt/flyenv/mysql' }]
let retryCount = 0
const retryCache = new StopProcessListCache(
  async () => {
    retryCount += 1
    return secondList
  },
  { now: () => now, ttlMs: 350 }
)
assert.strictEqual(await retryCache.get(), secondList)
now = 799
assert.strictEqual(await retryCache.get(), secondList)
assert.equal(retryCount, 1)
now = 800
await retryCache.get()
assert.equal(retryCount, 2)

let failureNow = 0
let failureCount = 0
const failingCache = new StopProcessListCache(
  async () => {
    failureCount += 1
    if (failureCount === 1) throw new Error('process list failed')
    return []
  },
  { now: () => failureNow }
)
await assert.rejects(() => failingCache.get(), /process list failed/)
assert.deepEqual(await failingCache.get(), [])
assert.equal(failureCount, 2)
failureNow = 349
assert.deepEqual(await failingCache.get(), [])
assert.equal(failureCount, 2)

assert.equal(
  isStopProcessListRequest({ type: 'stop-process-list-request', requestId: 'request-1' }),
  true
)
assert.equal(isStopProcessListRequest({ key: 'normal-task' }), false)
assert.equal(
  isStopProcessListResponse({
    type: 'stop-process-list-response',
    requestId: 'request-1',
    list: firstList
  }),
  true
)

const bridgeReplies: StopProcessListResponse[] = []
const bridge = new StopProcessListBridge({
  get: async () => firstList
})
assert.equal(
  bridge.handle({ type: 'stop-process-list-request', requestId: 'bridge-request' }, (message) =>
    bridgeReplies.push(message)
  ),
  true
)
await new Promise((resolve) => setTimeout(resolve, 0))
assert.deepEqual(bridgeReplies, [
  {
    type: 'stop-process-list-response',
    requestId: 'bridge-request',
    list: firstList
  }
])
assert.equal(
  bridge.handle({ key: 'normal-task' }, () => {}),
  false
)

let sentRequest: unknown
let scheduledTimeout: (() => void) | undefined
const client = new StopProcessListClient(
  (message) => {
    sentRequest = message
  },
  {
    requestId: () => 'client-request',
    scheduleTimeout: (handler) => {
      scheduledTimeout = handler
      return 1
    },
    cancelTimeout: () => {}
  }
)
const clientResult = client.request()
assert.deepEqual(sentRequest, {
  type: 'stop-process-list-request',
  requestId: 'client-request'
})
assert.equal(
  client.handleMessage({
    type: 'stop-process-list-response',
    requestId: 'client-request',
    list: firstList
  }),
  true
)
assert.strictEqual(await clientResult, firstList)

const timeoutClient = new StopProcessListClient(() => {}, {
  requestId: () => 'timeout-request',
  scheduleTimeout: (handler) => {
    scheduledTimeout = handler
    return 2
  },
  cancelTimeout: () => {}
})
const timeoutResult = timeoutClient.request()
scheduledTimeout?.()
await assert.rejects(() => timeoutResult, /timed out after 10000ms/)

let providerCalls = 0
let localCalls = 0
const access = new StopProcessListAccess(
  async () => {
    localCalls += 1
    return secondList
  },
  () => {}
)
access.setProvider(async () => {
  providerCalls += 1
  return firstList
})
assert.strictEqual(await access.fetch(), firstList)
assert.equal(providerCalls, 1)
assert.equal(localCalls, 0)
assert.deepEqual(await access.search('NGINX', false), firstList)

access.setProvider(async () => {
  throw new Error('main unavailable')
})
assert.strictEqual(await access.fetch(), secondList)
assert.equal(localCalls, 1)

setStopProcessListProvider(async () => firstList)
assert.strictEqual(await StopProcessListFetch(), firstList)
setStopProcessListProvider(undefined)

assert.deepEqual(await ProcessPidListByPid('9999', []), [])
assert.deepEqual(await ProcessPidListByPids(['9999'], []), [])
const orphanChild: PItem[] = [{ USER: 'user', PID: '10000', PPID: '9999', COMMAND: 'child' }]
assert.deepEqual(await ProcessPidListByPid('9999', orphanChild), ['10000'])
assert.deepEqual(await ProcessPidListByPids(['9999'], orphanChild), ['10000'])

const forkManagerSource = readFileSync('src/main/core/ForkManager.ts', 'utf8')
const forkItemSource = readFileSync('src/main/core/ForkItem.ts', 'utf8')
const forkEntrySource = readFileSync('src/fork/index.ts', 'utf8')
assert.match(forkManagerSource, /StopProcessListCache/)
assert.match(forkManagerSource, /StopProcessListBridge/)
assert.match(forkManagerSource, /this\.stopProcessListBridge/)
assert.match(forkItemSource, /stopProcessListBridge\.handle/)
assert.match(forkEntrySource, /StopProcessListClient/)
assert.match(forkEntrySource, /setStopProcessListProvider/)
assert.match(forkEntrySource, /handleMessage\(data\)/)

const source = (path: string) => readFileSync(path, 'utf8')

assert.match(source('src/fork/module/Base/index.ts'), /StopProcessListFetch/)
assert.match(source('src/fork/module/Php/index.ts'), /StopProcessListFetch/)
assert.match(source('src/fork/module/Php.win/index.ts'), /StopProcessListSearch/)
assert.match(source('src/fork/module/Redis/index.ts'), /StopProcessListSearch/)
assert.match(source('src/fork/module/Mysql/index.ts'), /StopProcessPidList/)
assert.match(source('src/fork/module/Mysql/index.ts'), /StopProcessListSearch/)
assert.match(source('src/fork/module/Mariadb/index.ts'), /StopProcessPidList/)
assert.match(source('src/fork/module/N8N/index.ts'), /StopProcessPidList/)
assert.match(source('src/fork/module/Postgresql/index.ts'), /StopProcessListFetch/)
assert.match(source('src/fork/module/ModuleCustomer/index.ts'), /StopProcessPidListByPid/)
assert.match(source('src/fork/module/LanguageProject/index.ts'), /StopProcessPidListByPid/)
assert.match(source('src/fork/module/OpenClaw/index.ts'), /StopProcessListFetch/)
assert.match(source('src/fork/module/Hermes/index.ts'), /StopProcessListFetch/)

assert.doesNotMatch(source('src/fork/util/ServiceStart.ts'), /StopProcess/)
assert.doesNotMatch(source('src/fork/module/Tool/process.ts'), /StopProcess/)
assert.doesNotMatch(source('src/fork/module/Tool.win/process.ts'), /StopProcess/)
assert.doesNotMatch(source('src/fork/module/Numa/index.ts'), /StopProcess/)
assert.doesNotMatch(source('src/fork/module/Tomcat/index.ts'), /StopProcess/)
assert.doesNotMatch(source('src/main/core/ServiceProcess.ts'), /all = pids/)

console.log('stop process list cache tests passed')
