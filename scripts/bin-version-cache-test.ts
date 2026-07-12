import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  isBinVersionCacheFile,
  isBinVersionCacheGet,
  isBinVersionCacheGetResponse,
  isBinVersionCacheSet,
  type BinVersionFingerprint
} from '../src/shared/BinVersionCache'
import {
  BinVersionCacheStore,
  type BinVersionCachePersistence
} from '../src/main/core/BinVersionCacheStore'

void readFileSync

const nginxFingerprint: BinVersionFingerprint = {
  path: '/opt/flyenv/nginx',
  mtimeMs: 100,
  size: 200
}

assert.equal(
  isBinVersionCacheGet({
    type: 'bin-version-cache-get',
    requestId: 'get-1',
    fingerprint: nginxFingerprint
  }),
  true
)
assert.equal(
  isBinVersionCacheGetResponse({
    type: 'bin-version-cache-get-response',
    requestId: 'get-1',
    hit: true,
    value: { version: '1.27.4' }
  }),
  true
)
assert.equal(
  isBinVersionCacheSet({
    type: 'bin-version-cache-set',
    fingerprint: nginxFingerprint,
    value: { version: '1.27.4' }
  }),
  true
)
assert.equal(
  isBinVersionCacheFile({
    schemaVersion: 1,
    entries: {
      '/opt/flyenv/nginx': {
        mtimeMs: 100,
        size: 200,
        value: { version: '1.27.4' }
      }
    }
  }),
  true
)
assert.equal(isBinVersionCacheGet({ type: 'normal-task' }), false)
assert.equal(isBinVersionCacheFile({ schemaVersion: 2, entries: {} }), false)

let saveCount = 0
let savedValue: unknown
let scheduledSave: (() => void) | undefined
let cancelCount = 0
const storeEvents: string[] = []

const persistence: BinVersionCachePersistence = {
  load: () => ({
    schemaVersion: 1,
    entries: {
      '/opt/flyenv/nginx': {
        mtimeMs: 100,
        size: 200,
        value: { version: '1.27.4' }
      }
    }
  }),
  save: (value) => {
    saveCount += 1
    savedValue = value
  }
}

const store = new BinVersionCacheStore(persistence, {
  schedule: (handler) => {
    scheduledSave = handler
    return 1
  },
  cancel: () => {
    cancelCount += 1
  },
  onEvent: (event) => storeEvents.push(event.type)
})
await store.ready

assert.deepEqual(await store.get(nginxFingerprint), {
  hit: true,
  value: { version: '1.27.4' }
})
assert.deepEqual(await store.get({ ...nginxFingerprint, mtimeMs: 101 }), { hit: false })
assert.deepEqual(await store.get({ ...nginxFingerprint, size: 201 }), { hit: false })

await store.set(nginxFingerprint, { version: '1.27.5' })
await store.set({ path: '/opt/flyenv/php', mtimeMs: 300, size: 400 }, { version: '8.4.1' })
assert.equal(saveCount, 0)
scheduledSave?.()
await new Promise((resolve) => setTimeout(resolve, 0))
assert.equal(saveCount, 1)
assert.deepEqual(savedValue, {
  schemaVersion: 1,
  entries: {
    '/opt/flyenv/nginx': {
      mtimeMs: 100,
      size: 200,
      value: { version: '1.27.5' }
    },
    '/opt/flyenv/php': {
      mtimeMs: 300,
      size: 400,
      value: { version: '8.4.1' }
    }
  }
})
assert.equal(storeEvents.includes('load-success'), true)
assert.equal(storeEvents.includes('save-success'), true)

await store.set(nginxFingerprint, { version: '1.27.6' })
await store.flush()
assert.equal(cancelCount > 0, true)
assert.equal(saveCount, 2)

const invalidStore = new BinVersionCacheStore({
  load: () => ({ schemaVersion: 2, entries: {} }),
  save: () => {}
})
await invalidStore.ready
assert.deepEqual(await invalidStore.get(nginxFingerprint), { hit: false })

let failingSaveCount = 0
const failingStore = new BinVersionCacheStore({
  load: () => ({ schemaVersion: 1, entries: {} }),
  save: () => {
    failingSaveCount += 1
    throw new Error('disk full')
  }
})
await failingStore.ready
await failingStore.set(nginxFingerprint, { version: '1.27.4' })
await failingStore.flush()
assert.equal(failingSaveCount, 1)
assert.deepEqual(await failingStore.get(nginxFingerprint), {
  hit: true,
  value: { version: '1.27.4' }
})
