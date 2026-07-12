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
import { BinVersionCacheClient } from '../src/fork/BinVersionCacheClient'
import { BinVersionCacheBridge } from '../src/main/core/BinVersionCacheBridge'
import type { BinVersionCacheGetResponse } from '../src/shared/BinVersionCache'
import { BinVersionCacheAccess, normalizeBinVersionPath } from '../src/fork/util/BinVersionCache'

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

const bridgeReplies: BinVersionCacheGetResponse[] = []
const bridgeSets: Array<{ fingerprint: BinVersionFingerprint; value: unknown }> = []
const bridge = new BinVersionCacheBridge({
  get: async () => ({ hit: true, value: { version: '1.27.4' } }),
  set: async (fingerprint, value) => {
    bridgeSets.push({ fingerprint, value })
    return true
  }
})

assert.equal(
  bridge.handle(
    {
      type: 'bin-version-cache-get',
      requestId: 'bridge-get',
      fingerprint: nginxFingerprint
    },
    (message) => bridgeReplies.push(message)
  ),
  true
)
await Promise.resolve()
assert.deepEqual(bridgeReplies[0], {
  type: 'bin-version-cache-get-response',
  requestId: 'bridge-get',
  hit: true,
  value: { version: '1.27.4' }
})

assert.equal(
  bridge.handle(
    {
      type: 'bin-version-cache-set',
      fingerprint: nginxFingerprint,
      value: { version: '1.27.5' }
    },
    () => {}
  ),
  true
)
await Promise.resolve()
assert.deepEqual(bridgeSets[0], {
  fingerprint: nginxFingerprint,
  value: { version: '1.27.5' }
})
assert.equal(
  bridge.handle({ key: 'normal-task' }, () => {}),
  false
)

const sentMessages: unknown[] = []
let clientTimeout: (() => void) | undefined
const client = new BinVersionCacheClient((message) => sentMessages.push(message), {
  requestId: () => 'client-get',
  scheduleTimeout: (handler) => {
    clientTimeout = handler
    return 1
  },
  cancelTimeout: () => {}
})
const result = client.get(nginxFingerprint)
assert.deepEqual(sentMessages[0], {
  type: 'bin-version-cache-get',
  requestId: 'client-get',
  fingerprint: nginxFingerprint
})
client.handleMessage({
  type: 'bin-version-cache-get-response',
  requestId: 'client-get',
  hit: true,
  value: { version: '1.27.4' }
})
assert.deepEqual(await result, {
  type: 'bin-version-cache-get-response',
  requestId: 'client-get',
  hit: true,
  value: { version: '1.27.4' }
})

client.set(nginxFingerprint, { version: '1.27.5' })
assert.deepEqual(sentMessages[1], {
  type: 'bin-version-cache-set',
  fingerprint: nginxFingerprint,
  value: { version: '1.27.5' }
})

const timeoutClient = new BinVersionCacheClient(() => {}, {
  requestId: () => 'timeout-get',
  scheduleTimeout: (handler) => {
    clientTimeout = handler
    return 2
  },
  cancelTimeout: () => {}
})
const timeoutResult = timeoutClient.get(nginxFingerprint)
clientTimeout?.()
await assert.rejects(() => timeoutResult, /timed out after 2000ms/)

const isVersionResult = (value: unknown): value is { version: string } =>
  !!value &&
  typeof value === 'object' &&
  typeof (value as { version?: unknown }).version === 'string' &&
  (value as { version: string }).version.length > 0

assert.equal(normalizeBinVersionPath('C:\\FlyEnv\\PHP.EXE', true), 'c:/flyenv/php.exe')
assert.equal(normalizeBinVersionPath('/Opt/FlyEnv/php', false), '/Opt/FlyEnv/php')

const cachedAccess = new BinVersionCacheAccess(async () => nginxFingerprint, {
  get: async () => ({ hit: true, value: { version: '1.27.4' } }),
  set: () => {}
})
assert.deepEqual(
  await cachedAccess.run(
    '/opt/flyenv/nginx',
    async () => {
      throw new Error('loader must not run')
    },
    isVersionResult
  ),
  { version: '1.27.4' }
)

let setValue: unknown
const missedAccess = new BinVersionCacheAccess(async () => nginxFingerprint, {
  get: async () => ({ hit: false }),
  set: (_fingerprint, value) => {
    setValue = value
  }
})
assert.deepEqual(
  await missedAccess.run('/opt/flyenv/nginx', async () => ({ version: '1.27.5' }), isVersionResult),
  { version: '1.27.5' }
)
assert.deepEqual(setValue, { version: '1.27.5' })

setValue = undefined
await missedAccess.run('/opt/flyenv/nginx', async () => ({ version: '' }), isVersionResult)
assert.equal(setValue, undefined)

const noFingerprintAccess = new BinVersionCacheAccess(async () => undefined, {
  get: async () => {
    throw new Error('provider get must not run')
  },
  set: () => {
    throw new Error('provider set must not run')
  }
})
assert.deepEqual(
  await noFingerprintAccess.run(
    '/missing/nginx',
    async () => ({ version: 'fallback' }),
    isVersionResult
  ),
  { version: 'fallback' }
)

const readSource = (path: string) => readFileSync(path, 'utf8')
const forkManagerSource = readSource('src/main/core/ForkManager.ts')
const applicationSource = readSource('src/main/Application.ts')
const forkEntrySource = readSource('src/fork/index.ts')

assert.match(forkManagerSource, /BinVersionCacheStore/)
assert.match(forkManagerSource, /ElectronStoreBinVersionCachePersistence/)
assert.match(forkManagerSource, /BinVersionCacheBridge/)
assert.match(forkManagerSource, /binVersionCacheBridge\.handle/)
assert.match(forkManagerSource, /await this\.binVersionCacheStore\.flush\(\)/)
assert.match(applicationSource, /await this\.forkManager\?\.destroy\(\)/)
assert.match(forkEntrySource, /BinVersionCacheClient/)
assert.match(forkEntrySource, /setBinVersionCacheProvider/)
assert.match(forkEntrySource, /binVersionCacheClient\?\.handleMessage\(data\)/)

const versionSource = readSource('src/fork/util/Version.ts')
assert.match(versionSource, /withBinVersionCache/)
assert.match(versionSource, /versionBinVersionRaw/)
assert.match(versionSource, /versionBinVersionOutputRaw/)
assert.match(versionSource, /isValidVersionResult/)
assert.match(versionSource, /export const versionBinVersionSync/)
