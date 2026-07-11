import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { StopProcessListClient } from '../src/fork/StopProcessListClient'
import { StopProcessListBridge } from '../src/main/core/StopProcessListBridge'
import { StopProcessListCache } from '../src/main/core/StopProcessListCache'
import type { PItem } from '../src/shared/Process'
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

const forkManagerSource = readFileSync('src/main/core/ForkManager.ts', 'utf8')
const forkEntrySource = readFileSync('src/fork/index.ts', 'utf8')
assert.match(forkManagerSource, /StopProcessListCache/)
assert.match(forkManagerSource, /StopProcessListBridge/)
assert.match(forkManagerSource, /stopProcessListBridge\.handle/)
assert.match(forkEntrySource, /StopProcessListClient/)
assert.match(forkEntrySource, /setStopProcessListProvider/)
assert.match(forkEntrySource, /handleMessage\(data\)/)

console.log('stop process list cache tests passed')
