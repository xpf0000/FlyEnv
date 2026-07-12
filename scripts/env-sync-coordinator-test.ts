import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  isEnvSyncGetRequest,
  isEnvSyncGetResponse,
  isEnvSyncInvalidateRequest,
  isEnvSyncInvalidateResponse,
  isEnvSyncInvalidated,
  isEnvSyncSnapshot,
  type EnvSyncSnapshot
} from '../src/shared/EnvSyncProtocol'
import { EnvSyncCoordinator } from '../src/main/core/EnvSyncCoordinator'
import { EnvSyncAccess } from '../src/shared/EnvSync'
import { EnvSyncBridge } from '../src/main/core/EnvSyncBridge'
import { EnvSyncClient } from '../src/fork/EnvSyncClient'
import type { EnvSyncResponse } from '../src/shared/EnvSyncProtocol'

const snapshot: EnvSyncSnapshot = {
  revision: 3,
  env: { PATH: '/usr/bin', HOME: '/Users/flyenv' },
  cmdPath: 'C:/Windows/System32/cmd.exe',
  powerShellPath: 'C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',
  systemPath: 'C:/Windows/System32',
  fetchedAt: 1_000,
  expiresAt: 301_000
}

assert.equal(isEnvSyncSnapshot(snapshot), true)
assert.equal(isEnvSyncSnapshot({ ...snapshot, env: { PATH: undefined } }), false)
assert.equal(isEnvSyncSnapshot({ ...snapshot, expiresAt: Number.NaN }), false)
assert.equal(isEnvSyncGetRequest({ type: 'env-sync-get', requestId: 'get-1' }), true)
assert.equal(isEnvSyncGetRequest({ type: 'env-sync-get', requestId: '' }), false)
assert.equal(
  isEnvSyncGetResponse({ type: 'env-sync-get-response', requestId: 'get-1', snapshot }),
  true
)
assert.equal(
  isEnvSyncInvalidateRequest({ type: 'env-sync-invalidate', requestId: 'clean-1' }),
  true
)
assert.equal(
  isEnvSyncInvalidateResponse({
    type: 'env-sync-invalidate-response',
    requestId: 'clean-1',
    revision: 4
  }),
  true
)
assert.equal(isEnvSyncInvalidated({ type: 'env-sync-invalidated', revision: 4 }), true)
assert.equal(isEnvSyncInvalidated({ type: 'env-sync-invalidated', revision: -1 }), false)

let now = 1_000
let fetchCount = 0
let releaseFirst!: () => void
const firstGate = new Promise<void>((resolve) => {
  releaseFirst = resolve
})
const events: string[] = []
const coordinator = new EnvSyncCoordinator(
  async () => {
    fetchCount += 1
    await firstGate
    return { env: { PATH: `/env-${fetchCount}` } }
  },
  {
    now: () => now,
    ttlMs: 300_000,
    onEvent: (event) => events.push(event.type)
  }
)

const firstGet = coordinator.get()
const joinedGet = coordinator.get()
await Promise.resolve()
assert.equal(fetchCount, 1)
releaseFirst()
assert.strictEqual(await firstGet, await joinedGet)
assert.deepEqual(events.slice(0, 3), ['miss', 'join', 'fetch-success'])

now = 300_999
assert.equal((await coordinator.get()).env.PATH, '/env-1')
assert.equal(fetchCount, 1)
now = 301_000
assert.equal((await coordinator.get()).env.PATH, '/env-2')
assert.equal(fetchCount, 2)

let revisionFetchCount = 0
let releaseOld!: () => void
const oldGate = new Promise<void>((resolve) => {
  releaseOld = resolve
})
const invalidationEvents: number[] = []
const revisionCoordinator = new EnvSyncCoordinator(async () => {
  revisionFetchCount += 1
  if (revisionFetchCount === 1) await oldGate
  return { env: { VALUE: `fetch-${revisionFetchCount}` } }
})
revisionCoordinator.subscribe((revision) => invalidationEvents.push(revision))
const oldRequest = revisionCoordinator.get()
await Promise.resolve()
assert.equal(await revisionCoordinator.invalidate(), 1)
const newRequest = revisionCoordinator.get()
releaseOld()
assert.equal((await oldRequest).revision, 1)
assert.equal((await newRequest).revision, 1)
assert.equal(revisionFetchCount, 2)
assert.deepEqual(invalidationEvents, [1])

let failureCount = 0
const retryCoordinator = new EnvSyncCoordinator(async () => {
  failureCount += 1
  if (failureCount === 1) throw new Error('env load failed')
  return { env: {} }
})
await assert.rejects(() => retryCoordinator.get(), /env load failed/)
assert.deepEqual((await retryCoordinator.get()).env, {})
assert.equal(failureCount, 2)

const previousServer = global.Server
global.Server = { Proxy: { HTTPS_PROXY: 'http://127.0.0.1:7890' } } as any

let providerGets = 0
let providerInvalidates = 0
let accessNow = 10
const access = new EnvSyncAccess({
  now: () => accessNow,
  localFetch: async () => ({ env: { PATH: '/fallback' } })
})
access.setProvider({
  get: async () => {
    providerGets += 1
    return {
      revision: providerInvalidates,
      env: { PATH: '/shared' },
      cmdPath: 'cmd.exe',
      powerShellPath: 'powershell.exe',
      systemPath: 'C:/Windows/System32',
      fetchedAt: 10,
      expiresAt: 310
    }
  },
  invalidate: async () => {
    providerInvalidates += 1
    return providerInvalidates
  }
})

const [sharedA, sharedB] = await Promise.all([access.sync(), access.sync()])
assert.strictEqual(sharedA, sharedB)
assert.equal(providerGets, 1)
assert.equal(sharedA.PATH, '/shared')
assert.equal(sharedA.HTTPS_PROXY, 'http://127.0.0.1:7890')
assert.equal(access.CMDPath, 'cmd.exe')
assert.equal(access.PowerShellPath, 'powershell.exe')
assert.equal(access.SystemPath, 'C:/Windows/System32')

const manualAccess = new EnvSyncAccess({
  localFetch: async () => {
    throw new Error('manual AppEnv should bypass loading')
  }
})
manualAccess.AppEnv = { PATH: '/manual' }
assert.equal((await manualAccess.sync()).PATH, '/manual')
await manualAccess.clean()
assert.equal(manualAccess.AppEnv, undefined)

const cleanPromise = access.clean()
assert.equal(access.AppEnv, undefined)
const afterClean = await access.sync()
await cleanPromise
assert.equal(providerInvalidates, 1)
assert.equal(providerGets, 2)
assert.equal(afterClean.PATH, '/shared')

access.clearLocal(3)
accessNow = 400
let lowRevisionGets = 0
access.setProvider({
  get: async () => {
    lowRevisionGets += 1
    return {
      revision: lowRevisionGets === 1 ? 2 : 3,
      env: { PATH: '/revision-3' },
      fetchedAt: 400,
      expiresAt: 700
    }
  },
  invalidate: async () => 3
})
assert.equal((await access.sync()).PATH, '/revision-3')
assert.equal(lowRevisionGets, 2)
access.clearLocal(2)
assert.equal((await access.sync()).PATH, '/revision-3')
assert.equal(lowRevisionGets, 2)

let fallbackGets = 0
let localFetches = 0
const fallbackAccess = new EnvSyncAccess({
  now: () => accessNow,
  fallbackTtlMs: 5_000,
  localFetch: async () => {
    localFetches += 1
    return { env: { PATH: '/local' } }
  }
})
fallbackAccess.setProvider({
  get: async () => {
    fallbackGets += 1
    throw new Error('main unavailable')
  },
  invalidate: async () => 0
})
assert.equal((await fallbackAccess.sync()).PATH, '/local')
assert.equal((await fallbackAccess.sync()).PATH, '/local')
assert.equal(fallbackGets, 1)
assert.equal(localFetches, 1)
accessNow += 5_000
assert.equal((await fallbackAccess.sync()).PATH, '/local')
assert.equal(fallbackGets, 2)
assert.equal(localFetches, 2)

let localGenerationFetches = 0
let releaseOldLocal!: () => void
const oldLocalGate = new Promise<void>((resolve) => {
  releaseOldLocal = resolve
})
const generationAccess = new EnvSyncAccess({
  localFetch: async () => {
    localGenerationFetches += 1
    if (localGenerationFetches === 1) await oldLocalGate
    return { env: { PATH: `/local-generation-${localGenerationFetches}` } }
  }
})
const oldLocalRequest = generationAccess.sync()
await Promise.resolve()
await generationAccess.clean()
const freshLocalRequest = generationAccess.sync()
await Promise.resolve()
assert.equal(localGenerationFetches, 2)
releaseOldLocal()
assert.equal((await freshLocalRequest).PATH, '/local-generation-2')
assert.equal((await oldLocalRequest).PATH, '/local-generation-2')

global.Server = previousServer

const bridgeReplies: EnvSyncResponse[] = []
const bridge = new EnvSyncBridge({
  get: async () => snapshot,
  invalidate: async () => 5
})
assert.equal(
  bridge.handle({ type: 'env-sync-get', requestId: 'bridge-get' }, (message) =>
    bridgeReplies.push(message)
  ),
  true
)
assert.equal(
  bridge.handle({ type: 'env-sync-invalidate', requestId: 'bridge-clean' }, (message) =>
    bridgeReplies.push(message)
  ),
  true
)
assert.equal(
  bridge.handle({ type: 'normal-task' }, () => {}),
  false
)
await new Promise((resolve) => setTimeout(resolve, 0))
assert.deepEqual(bridgeReplies, [
  { type: 'env-sync-get-response', requestId: 'bridge-get', snapshot },
  { type: 'env-sync-invalidate-response', requestId: 'bridge-clean', revision: 5 }
])

const sent: unknown[] = []
const invalidated: number[] = []
let requestNumber = 0
const client = new EnvSyncClient(
  (message) => sent.push(message),
  (revision) => invalidated.push(revision),
  { requestId: () => `request-${++requestNumber}` }
)
const clientGet = client.get()
assert.deepEqual(sent[0], { type: 'env-sync-get', requestId: 'request-1' })
assert.equal(
  client.handleMessage({
    type: 'env-sync-get-response',
    requestId: 'request-1',
    snapshot
  }),
  true
)
assert.strictEqual(await clientGet, snapshot)

const clientInvalidate = client.invalidate()
assert.deepEqual(sent[1], { type: 'env-sync-invalidate', requestId: 'request-2' })
client.handleMessage({
  type: 'env-sync-invalidate-response',
  requestId: 'request-2',
  revision: 6
})
assert.equal(await clientInvalidate, 6)
assert.equal(client.handleMessage({ type: 'env-sync-invalidated', revision: 6 }), true)
assert.deepEqual(invalidated, [6])
assert.equal(client.handleMessage({ type: 'normal-task' }), false)

let triggerTimeout: (() => void) | undefined
const timeoutClient = new EnvSyncClient(
  () => {},
  () => {},
  {
    requestId: () => 'timeout-get',
    scheduleTimeout: (handler) => {
      triggerTimeout = handler
      return 1
    },
    cancelTimeout: () => {}
  }
)
const timedOut = timeoutClient.get()
triggerTimeout?.()
await assert.rejects(() => timedOut, /timed out after 10000ms/)

const forkManagerSource = readFileSync('src/main/core/ForkManager.ts', 'utf8')
const forkEntrySource = readFileSync('src/fork/index.ts', 'utf8')
assert.match(forkManagerSource, /EnvSyncCoordinator/)
assert.match(forkManagerSource, /EnvSyncBridge/)
assert.match(forkManagerSource, /envSyncBridge\.handle/)
assert.match(forkManagerSource, /env-sync-invalidated/)
assert.match(forkManagerSource, /EnvSync\.setProvider/)
assert.match(forkEntrySource, /EnvSyncClient/)
assert.match(forkEntrySource, /EnvSync\.setProvider/)
assert.match(forkEntrySource, /envSyncClient\?\.handleMessage\(data\)/)

const envSyncConsumers = [
  'src/fork/module/Tool/path.ts',
  'src/fork/module/Git/index.ts',
  'src/fork/util/AiCli.ts',
  'src/shared/WindowsHelperFallback.ts',
  'src/main/core/AppNodeFn.ts'
].map((path) => [path, readFileSync(path, 'utf8')] as const)

for (const [path, source] of envSyncConsumers) {
  assert.doesNotMatch(
    source,
    /EnvSync\.(AppEnv|CMDPath|PowerShellPath|SystemPath)\s*=\s*undefined/,
    path
  )
}
assert.match(readFileSync('src/fork/module/Tool/path.ts', 'utf8'), /await EnvSync\.clean\(\)/)

let groupFetches = 0
let releaseGroupFetch!: () => void
const groupGate = new Promise<void>((resolve) => {
  releaseGroupFetch = resolve
})
const groupCoordinator = new EnvSyncCoordinator(async () => {
  groupFetches += 1
  await groupGate
  return { env: { GROUP_ENV: 'shared' } }
})
const groupBridge = new EnvSyncBridge(groupCoordinator)

const makeLoopbackClient = (prefix: string) => {
  let number = 0
  const loopbackClient = new EnvSyncClient(
    (message) => {
      groupBridge.handle(message, (response) => loopbackClient.handleMessage(response))
    },
    () => {},
    { requestId: () => `${prefix}-${++number}` }
  )
  return loopbackClient
}

const groupClients = Array.from({ length: 8 }, (_, index) => makeLoopbackClient(`fork-${index}`))
const groupResults = groupClients.map((groupClient) => groupClient.get())
await Promise.resolve()
assert.equal(groupFetches, 1)
releaseGroupFetch()
const groupSnapshots = await Promise.all(groupResults)
assert.deepEqual(new Set(groupSnapshots.map((item) => item.revision)), new Set([0]))
assert.deepEqual(new Set(groupSnapshots.map((item) => item.env.GROUP_ENV)), new Set(['shared']))

console.log('env sync coordinator tests passed')
