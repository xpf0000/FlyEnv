# Bin Version Cache Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为已安装版本探测增加 Main 进程共享、electron-store 持久化的 bin 版本缓存，使未变化的 bin 在刷新和应用重启后不再重复执行版本命令。

**Architecture:** Fork 在执行版本探测前计算 `realpath + mtimeMs + size` fingerprint，并通过 UtilityProcess IPC 查询 Main 内存缓存；命中直接返回，未命中仍在 Fork 执行原 loader，成功结果 fire-and-forget 回传 Main。Main 使用独立 electron-store 文件加载和保存缓存，内存更新后 trailing debounce 2 秒落盘，应用退出前 flush。

**Tech Stack:** Electron UtilityProcess IPC、TypeScript、electron-store、Node.js fs/stat、Promise/定时器注入、现有 `versionBinVersion`/`allInstalledVersions`、Node `assert/strict`、`tsx`。

---

## File Structure

- Create: `src/shared/BinVersionCache.ts` — fingerprint、持久化结构、IPC 消息和类型守卫。
- Create: `src/main/core/BinVersionCacheStore.ts` — 可注入持久化和定时器的纯内存 Store、debounce 和 flush。
- Create: `src/main/core/BinVersionCachePersistence.ts` — 默认路径的 electron-store 生产适配器。
- Create: `src/main/core/BinVersionCacheBridge.ts` — Main 侧 get/set 消息处理。
- Create: `src/fork/BinVersionCacheClient.ts` — Fork get pending/超时、set fire-and-forget 和响应匹配。
- Create: `src/fork/util/BinVersionCache.ts` — fingerprint、provider 注册和 `withBinVersionCache<T>()`。
- Create: `scripts/bin-version-cache-test.ts` — Store、Bridge、Client、wrapper 和覆盖范围回归测试。
- Modify: `package.json` — 注册 `test:bin-version-cache`。
- Modify: `src/main/core/ForkManager.ts` — 共享 Store/Bridge、分流消息、退出 flush。
- Modify: `src/main/Application.ts` — 等待 `ForkManager.destroy()`。
- Modify: `src/fork/index.ts` — 创建 Client、注册 provider、分流 response。
- Modify: `src/fork/util/Version.ts` — 公共异步版本探测接入 wrapper。
- Modify: `src/fork/module/RoadRunner/index.ts` — 多命令探测整体缓存。
- Modify: `src/fork/module/Ollama/index.ts` — 自定义版本解析整体缓存。
- Modify: `src/fork/module/SwooleCli/index.ts` — `{ version, php }` 探测整体缓存。
- Modify: `src/fork/module/FrankenPHP/index.ts` — `{ version, php, caddy }` 探测整体缓存。
- Modify: `src/fork/module/DotNet/index.ts` — `--version`/`--info` fallback 整体缓存。
- Modify: `src/fork/module/Composer/index.ts` — 文件内容版本解析缓存。
- Modify: `src/fork/module/PureFtpd/index.ts` — 文件内容版本解析缓存。

## Scope Rules

- Main 只缓存，不执行版本命令，不 stat bin。
- 不增加跨 Fork 全局并发限制。
- 不增加同 bin singleflight；极少数并发 miss 使用 last-write-wins。
- 目录搜索、`which`/`where`、用户目录扫描和版本新增/删除检测保持实时。
- 只缓存成功、有效、可 JSON 序列化的结果；错误与空版本不缓存。
- Caddy、Consul 的 `versionBinVersionSync()` 和 MacPorts `portinfo()` 保持不变。
- 保留执行时工作区中与本任务无关的用户改动；每次 commit 必须使用显式文件列表。

### Task 1: Define Shared Protocol and Test Entry

**Files:**

- Create: `src/shared/BinVersionCache.ts`
- Create: `scripts/bin-version-cache-test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the failing protocol tests**

Create `scripts/bin-version-cache-test.ts`:

```ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  isBinVersionCacheFile,
  isBinVersionCacheGet,
  isBinVersionCacheGetResponse,
  isBinVersionCacheSet,
  type BinVersionFingerprint
} from '../src/shared/BinVersionCache'

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
```

- [ ] **Step 2: Register the test and verify RED**

Add to `package.json`:

```json
"test:bin-version-cache": "tsx scripts/bin-version-cache-test.ts"
```

Run:

```bash
yarn test:bin-version-cache
```

Expected: FAIL with `Cannot find module '../src/shared/BinVersionCache'`.

- [ ] **Step 3: Implement shared types and guards**

Create `src/shared/BinVersionCache.ts`:

```ts
export type BinVersionFingerprint = {
  path: string
  mtimeMs: number
  size: number
}

export type BinVersionCacheEntry = {
  mtimeMs: number
  size: number
  value: unknown
}

export type BinVersionCacheFile = {
  schemaVersion: 1
  entries: Record<string, BinVersionCacheEntry>
}

export type BinVersionCacheGet = {
  type: 'bin-version-cache-get'
  requestId: string
  fingerprint: BinVersionFingerprint
}

export type BinVersionCacheGetResponse = {
  type: 'bin-version-cache-get-response'
  requestId: string
  hit: boolean
  value?: unknown
}

export type BinVersionCacheSet = {
  type: 'bin-version-cache-set'
  fingerprint: BinVersionFingerprint
  value: unknown
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

export const isBinVersionFingerprint = (value: unknown): value is BinVersionFingerprint => {
  if (!isRecord(value)) return false
  return (
    typeof value.path === 'string' &&
    value.path.length > 0 &&
    typeof value.mtimeMs === 'number' &&
    Number.isFinite(value.mtimeMs) &&
    typeof value.size === 'number' &&
    Number.isFinite(value.size) &&
    value.size >= 0
  )
}

export const isBinVersionCacheEntry = (value: unknown): value is BinVersionCacheEntry => {
  if (!isRecord(value)) return false
  return (
    typeof value.mtimeMs === 'number' &&
    Number.isFinite(value.mtimeMs) &&
    typeof value.size === 'number' &&
    Number.isFinite(value.size) &&
    value.size >= 0 &&
    Object.prototype.hasOwnProperty.call(value, 'value')
  )
}

export const isBinVersionCacheFile = (value: unknown): value is BinVersionCacheFile => {
  if (!isRecord(value) || value.schemaVersion !== 1 || !isRecord(value.entries)) return false
  return Object.values(value.entries).every(isBinVersionCacheEntry)
}

export const isBinVersionCacheGet = (value: unknown): value is BinVersionCacheGet => {
  if (!isRecord(value)) return false
  return (
    value.type === 'bin-version-cache-get' &&
    typeof value.requestId === 'string' &&
    value.requestId.length > 0 &&
    isBinVersionFingerprint(value.fingerprint)
  )
}

export const isBinVersionCacheGetResponse = (
  value: unknown
): value is BinVersionCacheGetResponse => {
  if (!isRecord(value)) return false
  return (
    value.type === 'bin-version-cache-get-response' &&
    typeof value.requestId === 'string' &&
    value.requestId.length > 0 &&
    typeof value.hit === 'boolean'
  )
}

export const isBinVersionCacheSet = (value: unknown): value is BinVersionCacheSet => {
  if (!isRecord(value)) return false
  return (
    value.type === 'bin-version-cache-set' &&
    isBinVersionFingerprint(value.fingerprint) &&
    Object.prototype.hasOwnProperty.call(value, 'value')
  )
}
```

- [ ] **Step 4: Verify GREEN and commit**

```bash
yarn test:bin-version-cache
npx eslint src/shared/BinVersionCache.ts scripts/bin-version-cache-test.ts
npx prettier --check src/shared/BinVersionCache.ts scripts/bin-version-cache-test.ts package.json
git add src/shared/BinVersionCache.ts scripts/bin-version-cache-test.ts package.json
git commit --only src/shared/BinVersionCache.ts scripts/bin-version-cache-test.ts package.json -m "feat: add bin version cache protocol"
```

Expected: tests, ESLint and Prettier exit 0.

### Task 2: Implement Main Store and electron-store Persistence

**Files:**

- Create: `src/main/core/BinVersionCacheStore.ts`
- Create: `src/main/core/BinVersionCachePersistence.ts`
- Modify: `scripts/bin-version-cache-test.ts`

- [ ] **Step 1: Append failing Store tests**

Append a fake persistence and fake timer test:

```ts
import {
  BinVersionCacheStore,
  type BinVersionCachePersistence
} from '../src/main/core/BinVersionCacheStore'

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
```

- [ ] **Step 2: Run RED**

Run `yarn test:bin-version-cache`.

Expected: FAIL because `BinVersionCacheStore` does not exist.

- [ ] **Step 3: Implement the Store contracts**

Create `src/main/core/BinVersionCacheStore.ts` with:

```ts
import {
  isBinVersionCacheFile,
  type BinVersionCacheEntry,
  type BinVersionCacheFile,
  type BinVersionFingerprint
} from '@shared/BinVersionCache'

export type BinVersionCachePersistence = {
  load(): unknown | Promise<unknown>
  save(value: BinVersionCacheFile): void | Promise<void>
}

export type BinVersionCacheStoreEvent =
  | { type: 'load-success'; entryCount: number }
  | { type: 'load-error'; error: string }
  | { type: 'hit' }
  | { type: 'miss' }
  | { type: 'set' }
  | { type: 'save-success'; entryCount: number }
  | { type: 'save-error'; error: string }

type TimerToken = ReturnType<typeof setTimeout> | number

type BinVersionCacheStoreOptions = {
  debounceMs?: number
  schedule?: (handler: () => void, delayMs: number) => TimerToken
  cancel?: (token: TimerToken) => void
  onEvent?: (event: BinVersionCacheStoreEvent) => void
}

export class BinVersionCacheStore {
  readonly ready: Promise<void>
  private readonly entries = new Map<string, BinVersionCacheEntry>()
  private readonly debounceMs: number
  private readonly schedule: (handler: () => void, delayMs: number) => TimerToken
  private readonly cancel: (token: TimerToken) => void
  private readonly onEvent: (event: BinVersionCacheStoreEvent) => void
  private saveTimer?: TimerToken
  private saveInFlight?: Promise<void>
  private dirty = false
  private revision = 0

  constructor(
    private readonly persistence: BinVersionCachePersistence,
    options: BinVersionCacheStoreOptions = {}
  ) {
    this.debounceMs = options.debounceMs ?? 2_000
    this.schedule = options.schedule ?? setTimeout
    this.cancel = options.cancel ?? clearTimeout
    this.onEvent = options.onEvent ?? (() => {})
    this.ready = this.load()
  }

  private emit(event: BinVersionCacheStoreEvent) {
    this.onEvent(event)
  }

  private async load() {
    try {
      const value = await this.persistence.load()
      if (isBinVersionCacheFile(value)) {
        for (const [path, entry] of Object.entries(value.entries)) {
          this.entries.set(path, entry)
        }
      }
      this.emit({ type: 'load-success', entryCount: this.entries.size })
    } catch (error) {
      this.emit({
        type: 'load-error',
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  async get(fingerprint: BinVersionFingerprint) {
    await this.ready
    const entry = this.entries.get(fingerprint.path)
    if (entry && entry.mtimeMs === fingerprint.mtimeMs && entry.size === fingerprint.size) {
      this.emit({ type: 'hit' })
      return { hit: true, value: entry.value }
    }
    this.emit({ type: 'miss' })
    return { hit: false }
  }

  async set(fingerprint: BinVersionFingerprint, value: unknown) {
    await this.ready
    try {
      if (JSON.stringify(value) === undefined) return false
    } catch {
      return false
    }
    this.entries.set(fingerprint.path, {
      mtimeMs: fingerprint.mtimeMs,
      size: fingerprint.size,
      value
    })
    this.revision += 1
    this.dirty = true
    this.emit({ type: 'set' })
    this.scheduleSave()
    return true
  }

  private scheduleSave() {
    if (this.saveTimer !== undefined) this.cancel(this.saveTimer)
    this.saveTimer = this.schedule(() => {
      this.saveTimer = undefined
      void this.flush()
    }, this.debounceMs)
  }

  private snapshot(): BinVersionCacheFile {
    return {
      schemaVersion: 1,
      entries: Object.fromEntries(this.entries)
    }
  }

  async flush(): Promise<void> {
    await this.ready
    if (this.saveTimer !== undefined) {
      this.cancel(this.saveTimer)
      this.saveTimer = undefined
    }
    if (this.saveInFlight) await this.saveInFlight
    if (!this.dirty) return

    const revision = this.revision
    const snapshot = this.snapshot()
    this.saveInFlight = Promise.resolve(this.persistence.save(snapshot))
      .then(() => {
        if (this.revision === revision) this.dirty = false
        this.emit({ type: 'save-success', entryCount: this.entries.size })
      })
      .catch((error) => {
        this.emit({
          type: 'save-error',
          error: error instanceof Error ? error.message : String(error)
        })
      })
      .finally(() => {
        this.saveInFlight = undefined
      })
    await this.saveInFlight
    if (this.dirty && this.revision !== revision) this.scheduleSave()
  }
}
```

- [ ] **Step 4: Implement the electron-store adapter**

Create `src/main/core/BinVersionCachePersistence.ts`:

```ts
import Store from 'electron-store'
import type { BinVersionCacheFile } from '@shared/BinVersionCache'
import type { BinVersionCachePersistence } from './BinVersionCacheStore'

export class ElectronStoreBinVersionCachePersistence implements BinVersionCachePersistence {
  private store?: Store<BinVersionCacheFile>

  private getStore() {
    this.store ??= new Store<BinVersionCacheFile>({
      name: 'bin-version-cache',
      clearInvalidConfig: true,
      defaults: {
        schemaVersion: 1,
        entries: {}
      }
    })
    return this.store
  }

  load(): unknown {
    return this.getStore().store
  }

  save(value: BinVersionCacheFile) {
    this.getStore().store = value
  }
}
```

Construct electron-store lazily inside `load()`/`save()` so constructor errors are caught by `BinVersionCacheStore.load()` or `flush()` and degrade to an empty or memory-only cache instead of aborting `ForkManager` construction.

- [ ] **Step 5: Verify and commit**

```bash
yarn test:bin-version-cache
npx eslint src/main/core/BinVersionCacheStore.ts src/main/core/BinVersionCachePersistence.ts scripts/bin-version-cache-test.ts
npx prettier --check src/main/core/BinVersionCacheStore.ts src/main/core/BinVersionCachePersistence.ts scripts/bin-version-cache-test.ts
git add src/main/core/BinVersionCacheStore.ts src/main/core/BinVersionCachePersistence.ts scripts/bin-version-cache-test.ts
git commit --only src/main/core/BinVersionCacheStore.ts src/main/core/BinVersionCachePersistence.ts scripts/bin-version-cache-test.ts -m "feat: add persistent bin version cache store"
```

Expected: all commands exit 0.

### Task 3: Add Main Bridge and Fork Client

**Files:**

- Create: `src/main/core/BinVersionCacheBridge.ts`
- Create: `src/fork/BinVersionCacheClient.ts`
- Modify: `scripts/bin-version-cache-test.ts`

- [ ] **Step 1: Append failing Bridge and Client tests**

Test these behaviors with deterministic request IDs and fake timeouts:

```ts
import { BinVersionCacheClient } from '../src/fork/BinVersionCacheClient'
import { BinVersionCacheBridge } from '../src/main/core/BinVersionCacheBridge'
import type { BinVersionCacheGetResponse } from '../src/shared/BinVersionCache'

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
```

Client tests must assert:

```ts
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
```

- [ ] **Step 2: Run RED**

Run `yarn test:bin-version-cache`.

Expected: FAIL because Bridge and Client do not exist.

- [ ] **Step 3: Implement Main Bridge**

Create `src/main/core/BinVersionCacheBridge.ts`:

```ts
import {
  isBinVersionCacheGet,
  isBinVersionCacheSet,
  type BinVersionCacheGetResponse,
  type BinVersionFingerprint
} from '@shared/BinVersionCache'

type BinVersionCacheStoreSource = {
  get(fingerprint: BinVersionFingerprint): Promise<{ hit: boolean; value?: unknown }>
  set(fingerprint: BinVersionFingerprint, value: unknown): Promise<boolean>
}

export class BinVersionCacheBridge {
  constructor(private readonly source: BinVersionCacheStoreSource) {}

  handle(message: unknown, reply: (message: BinVersionCacheGetResponse) => void): boolean {
    if (isBinVersionCacheGet(message)) {
      void this.source
        .get(message.fingerprint)
        .then((result) => {
          reply({
            type: 'bin-version-cache-get-response',
            requestId: message.requestId,
            ...result
          })
        })
        .catch(() => {
          reply({
            type: 'bin-version-cache-get-response',
            requestId: message.requestId,
            hit: false
          })
        })
      return true
    }
    if (isBinVersionCacheSet(message)) {
      void this.source.set(message.fingerprint, message.value)
      return true
    }
    return false
  }
}
```

- [ ] **Step 4: Implement Fork Client**

Create `src/fork/BinVersionCacheClient.ts`:

```ts
import { randomUUID } from 'node:crypto'
import {
  isBinVersionCacheGetResponse,
  type BinVersionCacheGet,
  type BinVersionCacheGetResponse,
  type BinVersionCacheSet,
  type BinVersionFingerprint
} from '@shared/BinVersionCache'

type TimerToken = ReturnType<typeof setTimeout> | number
type PendingRequest = {
  resolve: (value: BinVersionCacheGetResponse) => void
  reject: (error: Error) => void
  timeout: TimerToken
}
type BinVersionCacheClientOptions = {
  timeoutMs?: number
  requestId?: () => string
  scheduleTimeout?: (handler: () => void, delayMs: number) => TimerToken
  cancelTimeout?: (token: TimerToken) => void
}

export class BinVersionCacheClient {
  private readonly pending = new Map<string, PendingRequest>()
  private readonly timeoutMs: number
  private readonly requestId: () => string
  private readonly scheduleTimeout: (handler: () => void, delayMs: number) => TimerToken
  private readonly cancelTimeout: (token: TimerToken) => void

  constructor(
    private readonly send: (message: BinVersionCacheGet | BinVersionCacheSet) => void,
    options: BinVersionCacheClientOptions = {}
  ) {
    this.timeoutMs = options.timeoutMs ?? 2_000
    this.requestId = options.requestId ?? randomUUID
    this.scheduleTimeout = options.scheduleTimeout ?? setTimeout
    this.cancelTimeout = options.cancelTimeout ?? clearTimeout
  }

  get(fingerprint: BinVersionFingerprint): Promise<BinVersionCacheGetResponse> {
    const requestId = this.requestId()
    return new Promise((resolve, reject) => {
      const timeout = this.scheduleTimeout(() => {
        this.pending.delete(requestId)
        reject(new Error(`Bin version cache request timed out after ${this.timeoutMs}ms`))
      }, this.timeoutMs)
      this.pending.set(requestId, { resolve, reject, timeout })
      try {
        this.send({ type: 'bin-version-cache-get', requestId, fingerprint })
      } catch (error) {
        this.pending.delete(requestId)
        this.cancelTimeout(timeout)
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  set(fingerprint: BinVersionFingerprint, value: unknown) {
    try {
      this.send({ type: 'bin-version-cache-set', fingerprint, value })
    } catch {}
  }

  handleMessage(message: unknown): boolean {
    if (!isBinVersionCacheGetResponse(message)) return false
    const pending = this.pending.get(message.requestId)
    if (!pending) return true
    this.pending.delete(message.requestId)
    this.cancelTimeout(pending.timeout)
    pending.resolve(message)
    return true
  }
}
```

- [ ] **Step 5: Verify and commit**

```bash
yarn test:bin-version-cache
npx eslint src/main/core/BinVersionCacheBridge.ts src/fork/BinVersionCacheClient.ts scripts/bin-version-cache-test.ts
npx prettier --check src/main/core/BinVersionCacheBridge.ts src/fork/BinVersionCacheClient.ts scripts/bin-version-cache-test.ts
git add src/main/core/BinVersionCacheBridge.ts src/fork/BinVersionCacheClient.ts scripts/bin-version-cache-test.ts
git commit --only src/main/core/BinVersionCacheBridge.ts src/fork/BinVersionCacheClient.ts scripts/bin-version-cache-test.ts -m "feat: add bin version cache IPC"
```

Expected: all commands exit 0.

### Task 4: Add Fork Fingerprint and Cache Wrapper

**Files:**

- Create: `src/fork/util/BinVersionCache.ts`
- Modify: `scripts/bin-version-cache-test.ts`

- [ ] **Step 1: Append failing wrapper tests**

Add deterministic tests for path normalization, hit, miss, invalid result and fingerprint failure:

```ts
import { BinVersionCacheAccess, normalizeBinVersionPath } from '../src/fork/util/BinVersionCache'

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
```

- [ ] **Step 2: Run RED**

Run `yarn test:bin-version-cache`.

Expected: FAIL because the wrapper module does not exist.

- [ ] **Step 3: Implement fingerprint and wrapper**

Create `src/fork/util/BinVersionCache.ts`:

```ts
import type { BinVersionFingerprint } from '@shared/BinVersionCache'
import { realpath, stat } from '@shared/fs-extra'
import { isWindows } from '@shared/utils'

export type BinVersionCacheProvider = {
  get(fingerprint: BinVersionFingerprint): Promise<{ hit: boolean; value?: unknown }>
  set(fingerprint: BinVersionFingerprint, value: unknown): void
}

export const normalizeBinVersionPath = (path: string, windows = isWindows()) => {
  const normalized = path.split('\\').join('/')
  return windows ? normalized.toLowerCase() : normalized
}

export const getBinVersionFingerprint = async (
  bin: string
): Promise<BinVersionFingerprint | undefined> => {
  try {
    const realPath = await realpath(bin)
    const info = await stat(realPath)
    if (!info.isFile()) return undefined
    return {
      path: normalizeBinVersionPath(realPath),
      mtimeMs: info.mtimeMs,
      size: info.size
    }
  } catch {
    return undefined
  }
}
```

Implement the injectable access and singleton facade:

```ts
export class BinVersionCacheAccess {
  constructor(
    private readonly fingerprint = getBinVersionFingerprint,
    private provider?: BinVersionCacheProvider
  ) {}

  setProvider(provider?: BinVersionCacheProvider) {
    this.provider = provider
  }

  async run<T>(bin: string, loader: () => Promise<T>, isValid: (value: unknown) => value is T) {
    const fingerprint = await this.fingerprint(bin)
    if (!fingerprint || !this.provider) return loader()
    try {
      const cached = await this.provider.get(fingerprint)
      if (cached.hit && isValid(cached.value)) return cached.value
    } catch {}
    const value = await loader()
    if (isValid(value)) this.provider.set(fingerprint, value)
    return value
  }
}

const access = new BinVersionCacheAccess()

export const setBinVersionCacheProvider = (provider?: BinVersionCacheProvider) => {
  access.setProvider(provider)
}

export const withBinVersionCache = <T>(
  bin: string,
  loader: () => Promise<T>,
  isValid: (value: unknown) => value is T
) => access.run(bin, loader, isValid)
```

- [ ] **Step 4: Verify and commit**

```bash
yarn test:bin-version-cache
npx eslint src/fork/util/BinVersionCache.ts scripts/bin-version-cache-test.ts
npx prettier --check src/fork/util/BinVersionCache.ts scripts/bin-version-cache-test.ts
git add src/fork/util/BinVersionCache.ts scripts/bin-version-cache-test.ts
git commit --only src/fork/util/BinVersionCache.ts scripts/bin-version-cache-test.ts -m "feat: add cached bin version wrapper"
```

Expected: all commands exit 0.

### Task 5: Wire Main/Fork and Exit Flush

**Files:**

- Modify: `src/main/core/ForkManager.ts`
- Modify: `src/main/Application.ts`
- Modify: `src/fork/index.ts`
- Modify: `scripts/bin-version-cache-test.ts`

- [ ] **Step 1: Add failing static wiring assertions**

Append:

```ts
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
```

- [ ] **Step 2: Run RED**

Run `yarn test:bin-version-cache`.

Expected: FAIL on the first missing wiring assertion.

- [ ] **Step 3: Wire Main shared Store and Bridge**

In `src/main/core/ForkManager.ts` create one shared Store and Bridge:

```ts
private readonly binVersionCacheStore = new BinVersionCacheStore(
  new ElectronStoreBinVersionCachePersistence(),
  {
    debounceMs: 2_000,
    onEvent: (event) => {
      appDebugLog('[BinVersionCache]', JSON.stringify(event)).catch()
    }
  }
)
private readonly binVersionCacheBridge = new BinVersionCacheBridge(this.binVersionCacheStore)
```

Pass the shared Bridge to every `ForkItem`. In `ForkItem.onMessage()`, after the stop-process-list bridge and before normal task routing:

```ts
if (
  this.binVersionCacheBridge.handle(message, (response) => {
    try {
      child.postMessage(response)
    } catch {}
  })
) {
  return
}
```

Change `ForkManager.destroy()`:

```ts
async destroy() {
  await this.binVersionCacheStore.flush()
  this.dnsFork?.destroy()
  this.ftpsrvFork?.destroy()
  this.ollamaChatFork?.destroy()
  this.forks.forEach((fork) => fork.destroy())
}
```

Preserve the current stop-process-list TTL/logging and any unrelated working-tree edits exactly as found.

- [ ] **Step 4: Await ForkManager destroy**

In `src/main/Application.ts`:

```ts
try {
  await this.forkManager?.destroy()
} catch (e) {
  console.log('forkManager.destroy e: ', e)
}
```

- [ ] **Step 5: Wire Fork Client**

In `src/fork/index.ts` create and register the Client:

```ts
const binVersionCacheClient = parentPort
  ? new BinVersionCacheClient((message) => parentPort.postMessage(message))
  : undefined

if (binVersionCacheClient) {
  setBinVersionCacheProvider({
    get: (fingerprint) => binVersionCacheClient.get(fingerprint),
    set: (fingerprint, value) => binVersionCacheClient.set(fingerprint, value)
  })
}
```

Inside the existing `parentPort.on('message')`:

```ts
if (stopProcessListClient?.handleMessage(data)) return
if (binVersionCacheClient?.handleMessage(data)) return
process.emit('message', data)
```

Preserve unrelated imports and edits already present in this dirty file.

- [ ] **Step 6: Verify and commit**

```bash
yarn test:bin-version-cache
yarn test:stop-process-list-cache
npx vue-tsc --noEmit
npx eslint src/main/core/ForkManager.ts src/main/Application.ts src/fork/index.ts scripts/bin-version-cache-test.ts
npx prettier --check src/main/core/ForkManager.ts src/main/Application.ts src/fork/index.ts scripts/bin-version-cache-test.ts
git add src/main/core/ForkManager.ts src/main/Application.ts src/fork/index.ts scripts/bin-version-cache-test.ts
git commit --only src/main/core/ForkManager.ts src/main/Application.ts src/fork/index.ts scripts/bin-version-cache-test.ts -m "feat: bridge bin version cache through main"
```

Expected: all commands exit 0. Confirm unrelated staged `.tmp_video_tools` deletions are not included by the path-limited commit.

### Task 6: Cache Shared Async Version Helpers

**Files:**

- Modify: `src/fork/util/Version.ts`
- Modify: `scripts/bin-version-cache-test.ts`

- [ ] **Step 1: Add failing source assertions**

```ts
const versionSource = readSource('src/fork/util/Version.ts')
assert.match(versionSource, /withBinVersionCache/)
assert.match(versionSource, /versionBinVersionRaw/)
assert.match(versionSource, /versionBinVersionOutputRaw/)
assert.match(versionSource, /isValidVersionResult/)
assert.match(versionSource, /export const versionBinVersionSync/)
```

- [ ] **Step 2: Run RED**

Run `yarn test:bin-version-cache`.

Expected: FAIL because `Version.ts` does not use the wrapper.

- [ ] **Step 3: Rename the existing async loaders and add cached facades**

Keep `versionBinVersionSync()` unchanged. Add:

```ts
import { withBinVersionCache } from './BinVersionCache'
```

Use:

```ts
type VersionResult = { version?: string; error?: string }

const isValidVersionResult = (value: unknown): value is VersionResult =>
  !!value &&
  typeof value === 'object' &&
  typeof (value as VersionResult).version === 'string' &&
  (value as VersionResult).version!.trim().length > 0
```

Rename only the existing declaration from:

```ts
export const versionBinVersion = (
```

to:

```ts
const versionBinVersionRaw = (
  bin: string,
  command: string,
  reg: RegExp,
  findInError?: boolean
): Promise<VersionResult> => {
```

Leave every line of its current Promise body and closing brace in place. Immediately after that closing brace, add:

```ts
export const versionBinVersion = (
  bin: string,
  command: string,
  reg: RegExp,
  findInError?: boolean
) =>
  withBinVersionCache(
    bin,
    () => versionBinVersionRaw(bin, command, reg, findInError),
    isValidVersionResult
  )
```

Rename only:

```ts
export const versionBinVersionOutput = (
```

to:

```ts
const versionBinVersionOutputRaw = (
  bin: string,
  command: string
): Promise<VersionResult> => {
```

Leave its Promise body unchanged. Immediately after its closing brace, add:

```ts
export const versionBinVersionOutput = (bin: string, command: string) =>
  withBinVersionCache(bin, () => versionBinVersionOutputRaw(bin, command), isValidVersionResult)
```

The diff for this step must contain only the import, the two declaration renames, the validator, and the two public wrappers; cwd, regex reset, stdout/stderr parsing, `findInError`, and returned error text must be byte-for-byte unchanged.

- [ ] **Step 4: Verify and commit**

```bash
yarn test:bin-version-cache
npx eslint src/fork/util/Version.ts scripts/bin-version-cache-test.ts
npx prettier --check src/fork/util/Version.ts scripts/bin-version-cache-test.ts
git add src/fork/util/Version.ts scripts/bin-version-cache-test.ts
git commit --only src/fork/util/Version.ts scripts/bin-version-cache-test.ts -m "perf: cache shared bin version probes"
```

Expected: all commands exit 0.

### Task 7: Cache Custom Command-Based Probes

**Files:**

- Modify: `src/fork/module/RoadRunner/index.ts`
- Modify: `src/fork/module/Ollama/index.ts`
- Modify: `src/fork/module/SwooleCli/index.ts`
- Modify: `src/fork/module/FrankenPHP/index.ts`
- Modify: `src/fork/module/DotNet/index.ts`
- Modify: `scripts/bin-version-cache-test.ts`

- [ ] **Step 1: Add failing coverage assertions**

```ts
for (const path of [
  'src/fork/module/RoadRunner/index.ts',
  'src/fork/module/Ollama/index.ts',
  'src/fork/module/SwooleCli/index.ts',
  'src/fork/module/FrankenPHP/index.ts',
  'src/fork/module/DotNet/index.ts'
]) {
  assert.match(readSource(path), /withBinVersionCache/)
}
```

- [ ] **Step 2: Run RED**

Run `yarn test:bin-version-cache`.

Expected: FAIL on RoadRunner.

- [ ] **Step 3: Wrap RoadRunner and Ollama**

In RoadRunner, rename the existing class field `binVersion = (bin: string)` to `private binVersionRaw = (bin: string)` without changing its body. Add the import and cached facade immediately after the raw field:

```ts
binVersion = (bin: string) =>
  withBinVersionCache(
    bin,
    () => this.binVersionRaw(bin),
    (value): value is { version?: string; error?: string } =>
      !!value &&
      typeof value === 'object' &&
      typeof (value as { version?: unknown }).version === 'string' &&
      (value as { version: string }).version.trim().length > 0
  )
```

In Ollama's `allInstalledVersions()`, rename the local `const binVersion = (` declaration to `const binVersionRaw = (` without changing its Promise body. Immediately after the raw function, add:

```ts
const binVersion = (bin: string, command: string) =>
  withBinVersionCache(
    bin,
    () => binVersionRaw(bin, command),
    (value): value is { version?: string; error?: string } =>
      !!value &&
      typeof value === 'object' &&
      typeof (value as { version?: unknown }).version === 'string' &&
      (value as { version: string }).version.trim().length > 0
  )
```

The existing `versions.map()` continues to call `binVersion`; no parser or command string changes.

- [ ] **Step 4: Wrap structured SwooleCli and FrankenPHP results**

In SwooleCli, rename the existing class field `binVersion = (bin: string)` to `private binVersionRaw = (bin: string)` without changing the command loop. Add:

```ts
binVersion = (bin: string) =>
  withBinVersionCache(
    bin,
    () => this.binVersionRaw(bin),
    (value): value is { version?: string; php?: string; error?: string } =>
      !!value &&
      typeof value === 'object' &&
      typeof (value as { version?: unknown }).version === 'string' &&
      (value as { version: string }).version.trim().length > 0
  )
```

Keep `await this.initRuntimeFiles(appDir, bin)` before `this.binVersion(bin)` so fingerprinting observes the prepared concrete file.

In FrankenPHP, rename the existing class field `binVersion = (` to `private binVersionRaw = (` without changing its parser. Add:

```ts
binVersion = (bin: string, command: string) =>
  withBinVersionCache(
    bin,
    () => this.binVersionRaw(bin, command),
    (
      value
    ): value is {
      version?: string
      php?: string
      caddy?: string
      error?: string
    } =>
      !!value &&
      typeof value === 'object' &&
      typeof (value as { version?: unknown }).version === 'string' &&
      (value as { version: string }).version.trim().length > 0
  )
```

The extra `php` and `caddy` fields remain inside the cached value and are assigned to `SoftInstalled` exactly as before.

- [ ] **Step 5: Wrap DotNet complete fallback**

Rename the declaration `private async detectVersion(` to `private async detectVersionRaw(` without changing its body, then add:

```ts
private detectVersion(item: SoftInstalled) {
  return withBinVersionCache(
    item.bin,
    () => this.detectVersionRaw(item),
    (value): value is { version?: string; error?: string } =>
      !!value &&
      typeof value === 'object' &&
      typeof (value as { version?: unknown }).version === 'string' &&
      (value as { version: string }).version.trim().length > 0
  )
}
```

It is acceptable that the first `versionBinVersion()` call inside the raw fallback performs one additional cache get on a cold miss. Do not add another public uncached API solely to remove that small overhead.

- [ ] **Step 6: Verify and commit**

```bash
yarn test:bin-version-cache
npx vue-tsc --noEmit
npx eslint src/fork/module/RoadRunner/index.ts src/fork/module/Ollama/index.ts src/fork/module/SwooleCli/index.ts src/fork/module/FrankenPHP/index.ts src/fork/module/DotNet/index.ts scripts/bin-version-cache-test.ts
npx prettier --check src/fork/module/RoadRunner/index.ts src/fork/module/Ollama/index.ts src/fork/module/SwooleCli/index.ts src/fork/module/FrankenPHP/index.ts src/fork/module/DotNet/index.ts scripts/bin-version-cache-test.ts
git add src/fork/module/RoadRunner/index.ts src/fork/module/Ollama/index.ts src/fork/module/SwooleCli/index.ts src/fork/module/FrankenPHP/index.ts src/fork/module/DotNet/index.ts scripts/bin-version-cache-test.ts
git commit --only src/fork/module/RoadRunner/index.ts src/fork/module/Ollama/index.ts src/fork/module/SwooleCli/index.ts src/fork/module/FrankenPHP/index.ts src/fork/module/DotNet/index.ts scripts/bin-version-cache-test.ts -m "perf: cache custom bin version probes"
```

Expected: all commands exit 0.

### Task 8: Cache File-Based Probes and Audit Coverage

**Files:**

- Modify: `src/fork/module/Composer/index.ts`
- Modify: `src/fork/module/PureFtpd/index.ts`
- Modify: `scripts/bin-version-cache-test.ts`

- [ ] **Step 1: Add failing file-probe and exclusion assertions**

```ts
assert.match(readSource('src/fork/module/Composer/index.ts'), /withBinVersionCache/)
assert.match(readSource('src/fork/module/PureFtpd/index.ts'), /withBinVersionCache/)
assert.match(readSource('src/fork/module/Caddy/index.ts'), /versionBinVersionSync/)
assert.match(readSource('src/fork/module/Consul/index.ts'), /versionBinVersionSync/)

for (const path of [
  'src/fork/util/ServiceStart.ts',
  'src/fork/module/Tool/process.ts',
  'src/fork/module/Tool.win/process.ts'
]) {
  assert.doesNotMatch(readSource(path), /withBinVersionCache/)
}
```

- [ ] **Step 2: Run RED**

Run `yarn test:bin-version-cache`.

Expected: FAIL on Composer.

- [ ] **Step 3: Wrap Composer and PureFtpd file readers**

In each module's `allInstalledVersions()`, rename the local declaration `const binVersion = (bin: string)` to `const binVersionRaw = (bin: string)` without changing its `readFile`, regex, or error formatting. Immediately after the raw function add:

```ts
const binVersion = (bin: string) =>
  withBinVersionCache(
    bin,
    () => binVersionRaw(bin),
    (value): value is { version?: string; error?: string } =>
      !!value &&
      typeof value === 'object' &&
      typeof (value as { version?: unknown }).version === 'string' &&
      (value as { version: string }).version.trim().length > 0
  )
```

Keep each existing `versions.map()` call targeting `binVersion`. The only functional additions are the import, declaration rename, and cached facade; `versionLocalFetch`, parsing regexes, error HTML formatting, and `SoftInstalled` mapping remain unchanged.

- [ ] **Step 4: Audit every installed-version command/file read**

Run:

```bash
rg -n "allInstalledVersions\\(|execPromiseWithEnv\\(|spawnPromise\\(|readFile\\(" src/fork/module -g '*.ts'
rg -n "versionBinVersionSync" src/fork/module -g '*.ts'
```

The audit must end with these explicit classifications in a comment at the bottom of `scripts/bin-version-cache-test.ts`:

```ts
// Coverage audit:
// - Common async probes are covered by versionBinVersion/versionBinVersionOutput.
// - RoadRunner, Ollama, SwooleCli, FrankenPHP and DotNet use withBinVersionCache.
// - Composer and PureFtpd file readers use withBinVersionCache.
// - Caddy/Consul versionBinVersionSync calls belong to MacPorts portinfo, not installed scans.
// - Service start, install validation and Tool module checks remain real-time by design.
// - Modules whose allInstalledVersions returns [] execute no installed-version probe.
```

If the `rg` output reveals another concrete-bin probe inside `allInstalledVersions()`, add that exact module to Task 7 or Task 8 and to the static assertions before proceeding. Do not leave an unclassified concrete-bin probe.

Do not cache service start, install validation, tool actions, or MacPorts `portinfo()` checks.

- [ ] **Step 5: Verify and commit**

```bash
yarn test:bin-version-cache
npx eslint src/fork/module/Composer/index.ts src/fork/module/PureFtpd/index.ts scripts/bin-version-cache-test.ts
npx prettier --check src/fork/module/Composer/index.ts src/fork/module/PureFtpd/index.ts scripts/bin-version-cache-test.ts
git add src/fork/module/Composer/index.ts src/fork/module/PureFtpd/index.ts scripts/bin-version-cache-test.ts
git commit --only src/fork/module/Composer/index.ts src/fork/module/PureFtpd/index.ts scripts/bin-version-cache-test.ts -m "perf: cache file-based version probes"
```

Expected: all commands exit 0.

### Task 9: Full Verification and Manual Persistence Check

**Files:**

- Modify only if verification exposes a defect in files already listed.

- [ ] **Step 1: Run behavioral tests**

Ensure `scripts/bin-version-cache-test.ts` ends with:

```ts
console.log('bin version cache tests passed')
```

Run:

```bash
yarn test:bin-version-cache
yarn test:stop-process-list-cache
yarn test:startup-groups
yarn test:helper:contract
```

Expected: every command exits 0.

- [ ] **Step 2: Run targeted ESLint and Prettier**

```bash
npx eslint src/shared/BinVersionCache.ts src/main/core/BinVersionCacheStore.ts src/main/core/BinVersionCachePersistence.ts src/main/core/BinVersionCacheBridge.ts src/main/core/ForkManager.ts src/main/Application.ts src/fork/BinVersionCacheClient.ts src/fork/index.ts src/fork/util/BinVersionCache.ts src/fork/util/Version.ts src/fork/module/RoadRunner/index.ts src/fork/module/Ollama/index.ts src/fork/module/SwooleCli/index.ts src/fork/module/FrankenPHP/index.ts src/fork/module/DotNet/index.ts src/fork/module/Composer/index.ts src/fork/module/PureFtpd/index.ts scripts/bin-version-cache-test.ts
npx prettier --check src/shared/BinVersionCache.ts src/main/core/BinVersionCacheStore.ts src/main/core/BinVersionCachePersistence.ts src/main/core/BinVersionCacheBridge.ts src/main/core/ForkManager.ts src/main/Application.ts src/fork/BinVersionCacheClient.ts src/fork/index.ts src/fork/util/BinVersionCache.ts src/fork/util/Version.ts src/fork/module/RoadRunner/index.ts src/fork/module/Ollama/index.ts src/fork/module/SwooleCli/index.ts src/fork/module/FrankenPHP/index.ts src/fork/module/DotNet/index.ts src/fork/module/Composer/index.ts src/fork/module/PureFtpd/index.ts scripts/bin-version-cache-test.ts package.json
```

Expected: both commands exit 0.

- [ ] **Step 3: Run TypeScript and bundle checks**

```bash
npx vue-tsc --noEmit
npx esbuild src/main/index.dev.ts --platform=node --bundle --packages=external --format=esm --target=esnext --outfile=/tmp/flyenv-main-bin-version-cache-verify.mjs
npx esbuild src/fork/index.ts --platform=node --bundle --packages=external --format=esm --target=esnext --loader:.node=file --outfile=/tmp/flyenv-fork-bin-version-cache-verify.mjs
```

Expected: all commands exit 0.

- [ ] **Step 4: Perform manual persistence verification**

Run:

```bash
yarn dev
```

Verify:

1. Delete only the dedicated `bin-version-cache.json` electron-store file.
2. Refresh all installed versions and confirm original version commands run.
3. Wait more than 2 seconds and confirm the cache file is written.
4. Refresh again and confirm unchanged bins hit cache and do not run version commands.
5. Restart FlyEnv and confirm the first refresh still hits persistent cache.
6. Touch or replace one test bin and confirm only that bin is probed again.
7. Add or remove an installed version and confirm live directory discovery reflects it.
8. Confirm logs contain event types/counts but no full paths, commands, stdout/stderr or values.

Stop the development process afterward.

- [ ] **Step 5: Inspect final repository state**

```bash
git diff --check
git diff --cached --check
git status --short
git log -12 --oneline
```

Expected:

- no whitespace errors;
- all feature files are committed;
- unrelated staged `.tmp_video_tools` deletions and existing user edits remain intact unless the user explicitly changes them;
- commits appear in protocol → Store → IPC → wrapper → wiring → shared helpers → custom probes → file probes order.
