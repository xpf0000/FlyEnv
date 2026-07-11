import assert from 'node:assert/strict'
import { StopProcessListCache } from '../src/main/core/StopProcessListCache'
import type { PItem } from '../src/shared/Process'

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

console.log('stop process list cache tests passed')
