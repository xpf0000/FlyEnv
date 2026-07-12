# EnvSync Coordinator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 FlyEnv 的系统运行环境同步集中到 Main 进程，使 Main 与多个 UtilityProcess 在同一缓存窗口内共享一次 PowerShell 或 `shell-env` 查询，并支持跨进程全局失效。

**Architecture:** 把现有 `EnvSync` 拆成无共享缓存的本地环境加载器和保持旧 API 的访问层。Main 的 `EnvSyncCoordinator` 持有固定五分钟快照、revision 和按 revision 区分的 singleflight；Fork 通过 request/response IPC 获取快照，通过广播清除本地缓存，IPC 异常时短暂本地降级。

**Tech Stack:** TypeScript 5.8、Electron UtilityProcess IPC、Node.js Promise/Map/Set、`shell-env`、PowerShell、`tsx` 脚本测试、Node `assert/strict`

---

## Implementation Notes

- 设计依据：`docs/superpowers/specs/2026-07-12-env-sync-coordinator-design.md`。
- 执行前使用 `superpowers:using-git-worktrees` 创建隔离工作区，除非用户明确要求在当前工作区执行。
- 当前仓库可能存在与本任务无关的暂存改动。每次提交前先运行 `git status --short`，只添加任务列出的文件；如果索引仍包含其他改动，使用计划中的 `git commit --only ... -- <paths>`，不要清空或重置用户索引。
- 使用 `Date.now()` 计算 `fetchedAt` 和 `expiresAt`，因为时间戳需要跨进程传输；不要使用只在单个进程内有意义的 `performance.now()` 作为快照时间。
- 所有事件日志只记录 revision、耗时和变量数量，不记录完整 env、PATH 或代理值。

## File Structure

### New files

- `src/shared/EnvSyncProtocol.ts`：快照、IPC 消息、类型守卫。
- `src/shared/EnvSyncLocal.ts`：无共享缓存的 PowerShell/`shell-env` 环境加载与 Windows 路径派生。
- `src/main/core/EnvSyncCoordinator.ts`：Main 快照缓存、revision、singleflight 和失效订阅。
- `src/main/core/EnvSyncBridge.ts`：Main 对 Fork get/invalidate 请求的处理。
- `src/fork/EnvSyncClient.ts`：Fork pending 请求、超时、响应匹配和失效广播处理。
- `scripts/env-sync-coordinator-test.ts`：协议、Coordinator、访问层、Bridge、Client 和接线回归测试。

### Modified files

- `src/shared/EnvSync.ts`：保留默认单例 API，增加 provider、本地缓存、降级和 clean 屏障。
- `src/main/core/ForkManager.ts`：创建共享 Coordinator/Bridge，注入全部 Fork，并广播失效。
- `src/fork/index.ts`：注册 EnvSyncClient provider，并拦截协议消息。
- `src/fork/module/Tool/path.ts`：PATH 更新后使用全局 `EnvSync.clean()`。
- `package.json`：新增 `test:env-sync-coordinator`。

## Task 1: Define the shared snapshot and IPC protocol

**Files:**

- Create: `src/shared/EnvSyncProtocol.ts`
- Create: `scripts/env-sync-coordinator-test.ts`
- Modify: `package.json:17-21`

- [ ] **Step 1: Write the failing protocol tests**

Create `scripts/env-sync-coordinator-test.ts` with the initial protocol contract:

```ts
import assert from 'node:assert/strict'
import {
  isEnvSyncGetRequest,
  isEnvSyncGetResponse,
  isEnvSyncInvalidateRequest,
  isEnvSyncInvalidateResponse,
  isEnvSyncInvalidated,
  isEnvSyncSnapshot,
  type EnvSyncSnapshot
} from '../src/shared/EnvSyncProtocol'

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

console.log('env sync coordinator tests passed')
```

- [ ] **Step 2: Run the test and verify that the protocol module is missing**

Run:

```bash
npx tsx scripts/env-sync-coordinator-test.ts
```

Expected: FAIL with `Cannot find module '../src/shared/EnvSyncProtocol'`.

- [ ] **Step 3: Implement the protocol types and guards**

Create `src/shared/EnvSyncProtocol.ts`:

```ts
export type EnvSyncSnapshot = {
  revision: number
  env: Record<string, string>
  cmdPath?: string
  powerShellPath?: string
  systemPath?: string
  fetchedAt: number
  expiresAt: number
}

export type EnvSyncGetRequest = {
  type: 'env-sync-get'
  requestId: string
}

export type EnvSyncGetResponse = {
  type: 'env-sync-get-response'
  requestId: string
  snapshot?: EnvSyncSnapshot
  error?: string
}

export type EnvSyncInvalidateRequest = {
  type: 'env-sync-invalidate'
  requestId: string
}

export type EnvSyncInvalidateResponse = {
  type: 'env-sync-invalidate-response'
  requestId: string
  revision?: number
  error?: string
}

export type EnvSyncInvalidated = {
  type: 'env-sync-invalidated'
  revision: number
}

export type EnvSyncRequest = EnvSyncGetRequest | EnvSyncInvalidateRequest
export type EnvSyncResponse = EnvSyncGetResponse | EnvSyncInvalidateResponse

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0

const isRevision = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

const hasOptionalString = (value: Record<string, unknown>, key: string) =>
  value[key] === undefined || typeof value[key] === 'string'

export const isEnvSyncSnapshot = (value: unknown): value is EnvSyncSnapshot => {
  if (!isObject(value) || !isRevision(value.revision) || !isObject(value.env)) return false
  if (!Object.values(value.env).every((item) => typeof item === 'string')) return false
  return (
    isFiniteNumber(value.fetchedAt) &&
    isFiniteNumber(value.expiresAt) &&
    value.expiresAt >= value.fetchedAt &&
    hasOptionalString(value, 'cmdPath') &&
    hasOptionalString(value, 'powerShellPath') &&
    hasOptionalString(value, 'systemPath')
  )
}

export const isEnvSyncGetRequest = (value: unknown): value is EnvSyncGetRequest =>
  isObject(value) && value.type === 'env-sync-get' && isNonEmptyString(value.requestId)

export const isEnvSyncGetResponse = (value: unknown): value is EnvSyncGetResponse =>
  isObject(value) &&
  value.type === 'env-sync-get-response' &&
  isNonEmptyString(value.requestId) &&
  (value.snapshot === undefined || isEnvSyncSnapshot(value.snapshot)) &&
  (value.error === undefined || typeof value.error === 'string')

export const isEnvSyncInvalidateRequest = (
  value: unknown
): value is EnvSyncInvalidateRequest =>
  isObject(value) && value.type === 'env-sync-invalidate' && isNonEmptyString(value.requestId)

export const isEnvSyncInvalidateResponse = (
  value: unknown
): value is EnvSyncInvalidateResponse =>
  isObject(value) &&
  value.type === 'env-sync-invalidate-response' &&
  isNonEmptyString(value.requestId) &&
  (value.revision === undefined || isRevision(value.revision)) &&
  (value.error === undefined || typeof value.error === 'string')

export const isEnvSyncInvalidated = (value: unknown): value is EnvSyncInvalidated =>
  isObject(value) && value.type === 'env-sync-invalidated' && isRevision(value.revision)
```

- [ ] **Step 4: Add the package script and run the test**

Add next to the other focused test scripts in `package.json`:

```json
"test:env-sync-coordinator": "tsx scripts/env-sync-coordinator-test.ts",
```

Run:

```bash
npx prettier --write src/shared/EnvSyncProtocol.ts scripts/env-sync-coordinator-test.ts package.json
yarn test:env-sync-coordinator
```

Expected: PASS and print `env sync coordinator tests passed`.

- [ ] **Step 5: Commit the protocol contract**

```bash
git add src/shared/EnvSyncProtocol.ts scripts/env-sync-coordinator-test.ts package.json
git commit --only -m "feat: add env sync ipc protocol" -- src/shared/EnvSyncProtocol.ts scripts/env-sync-coordinator-test.ts package.json
```

## Task 2: Add the Main process coordinator

**Files:**

- Create: `src/main/core/EnvSyncCoordinator.ts`
- Create: `src/shared/EnvSyncLocal.ts`
- Modify: `scripts/env-sync-coordinator-test.ts`

- [ ] **Step 1: Add failing cache, singleflight, TTL, and invalidation tests**

Append these imports and cases before the final console log in `scripts/env-sync-coordinator-test.ts`:

```ts
import { EnvSyncCoordinator } from '../src/main/core/EnvSyncCoordinator'

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
```

- [ ] **Step 2: Run the test and verify the coordinator is missing**

Run:

```bash
yarn test:env-sync-coordinator
```

Expected: FAIL with `Cannot find module '../src/main/core/EnvSyncCoordinator'`.

- [ ] **Step 3: Implement `EnvSyncCoordinator`**

Create `src/main/core/EnvSyncCoordinator.ts`:

```ts
import type { EnvSyncSnapshot } from '@shared/EnvSyncProtocol'
import type { EnvSyncLocalResult } from '@shared/EnvSyncLocal'

export type EnvSyncCoordinatorEvent =
  | { type: 'hit'; revision: number }
  | { type: 'join'; revision: number }
  | { type: 'miss'; revision: number }
  | { type: 'fetch-success'; revision: number; durationMs: number; envCount: number }
  | { type: 'fetch-error'; revision: number; durationMs: number; error: string }
  | { type: 'invalidate'; revision: number }

type EnvSyncCoordinatorOptions = {
  ttlMs?: number
  now?: () => number
  onEvent?: (event: EnvSyncCoordinatorEvent) => void
}

type InFlight = {
  revision: number
  promise: Promise<EnvSyncSnapshot>
}

export class EnvSyncCoordinator {
  private snapshot?: EnvSyncSnapshot
  private inFlight?: InFlight
  private revision = 0
  private readonly listeners = new Set<(revision: number) => void>()
  private readonly ttlMs: number
  private readonly now: () => number
  private readonly onEvent: (event: EnvSyncCoordinatorEvent) => void

  constructor(
    private readonly fetchLocal: () => Promise<EnvSyncLocalResult>,
    options: EnvSyncCoordinatorOptions = {}
  ) {
    this.ttlMs = options.ttlMs ?? 300_000
    this.now = options.now ?? Date.now
    this.onEvent = options.onEvent ?? (() => {})
  }

  subscribe(listener: (revision: number) => void) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  get(): Promise<EnvSyncSnapshot> {
    const cached = this.snapshot
    if (cached && this.now() < cached.expiresAt) {
      this.onEvent({ type: 'hit', revision: cached.revision })
      return Promise.resolve(cached)
    }
    const active = this.inFlight
    if (active && active.revision === this.revision) {
      this.onEvent({ type: 'join', revision: this.revision })
      return active.promise
    }

    const revision = this.revision
    const startedAt = this.now()
    this.onEvent({ type: 'miss', revision })
    const promise = Promise.resolve()
      .then(() => this.fetchLocal())
      .then((local) => {
        if (this.revision !== revision) return this.get()
        const fetchedAt = this.now()
        const snapshot: EnvSyncSnapshot = {
          revision,
          ...local,
          fetchedAt,
          expiresAt: fetchedAt + this.ttlMs
        }
        this.snapshot = snapshot
        this.onEvent({
          type: 'fetch-success',
          revision,
          durationMs: this.now() - startedAt,
          envCount: Object.keys(snapshot.env).length
        })
        return snapshot
      })
      .catch((error) => {
        this.onEvent({
          type: 'fetch-error',
          revision,
          durationMs: this.now() - startedAt,
          error: error instanceof Error ? error.message : String(error)
        })
        throw error
      })
      .finally(() => {
        if (this.inFlight?.promise === promise) this.inFlight = undefined
      })

    this.inFlight = { revision, promise }
    return promise
  }

  async invalidate(): Promise<number> {
    this.revision += 1
    this.snapshot = undefined
    this.onEvent({ type: 'invalidate', revision: this.revision })
    for (const listener of this.listeners) {
      try {
        listener(this.revision)
      } catch {}
    }
    return this.revision
  }
}
```

Before running the Coordinator test, create the initial `src/shared/EnvSyncLocal.ts` type contract below. Task 3 replaces this file with the complete platform loader while preserving the same exported type:

```ts
export type EnvSyncLocalResult = {
  env: Record<string, string>
  cmdPath?: string
  powerShellPath?: string
  systemPath?: string
}
```

- [ ] **Step 4: Run the focused tests**

Run:

```bash
npx prettier --write src/main/core/EnvSyncCoordinator.ts src/shared/EnvSyncLocal.ts scripts/env-sync-coordinator-test.ts
yarn test:env-sync-coordinator
```

Expected: PASS; concurrent requests share one fetch, TTL boundary refetches, and in-flight invalidation returns revision 1.

- [ ] **Step 5: Commit the Coordinator**

```bash
git add src/main/core/EnvSyncCoordinator.ts src/shared/EnvSyncLocal.ts scripts/env-sync-coordinator-test.ts
git commit --only -m "feat: add main env sync coordinator" -- src/main/core/EnvSyncCoordinator.ts src/shared/EnvSyncLocal.ts scripts/env-sync-coordinator-test.ts
```

## Task 3: Extract local loading and implement the EnvSync access layer

**Files:**

- Modify: `src/shared/EnvSyncLocal.ts`
- Modify: `src/shared/EnvSync.ts:1-292`
- Modify: `scripts/env-sync-coordinator-test.ts`
- Test: `scripts/windows-env-sync-script-test.ts`
- Test: `scripts/brew-info-json-fallback-test.ts`

- [ ] **Step 1: Add failing access-layer tests**

Append these cases before the final console log:

```ts
import { EnvSyncAccess } from '../src/shared/EnvSync'

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

global.Server = previousServer
```

- [ ] **Step 2: Run tests and verify `EnvSyncAccess` is missing**

Run:

```bash
yarn test:env-sync-coordinator
```

Expected: FAIL because `EnvSyncAccess` is not exported.

- [ ] **Step 3: Move the platform loader into `EnvSyncLocal.ts`**

Move the following from `src/shared/EnvSync.ts` into `src/shared/EnvSyncLocal.ts` without changing command behavior:

- Imports for `shell-env`, `execFile`, `promisify`, path/fs/process, JSON5, `powerShellInlineArgs`, `isWindows`, and `appDebugLog`.
- `WINDOWS_ENV_SCRIPT`.
- Windows environment retrieval currently at lines 61-121.
- Windows command and PowerShell path selection currently at lines 123-190.
- Windows PATH merge/filter currently at lines 208-270.
- Unix `shellEnv()` and PATH extension currently at lines 273-281.

Replace the temporary Task 2 file with this complete implementation:

```ts
import { appDebugLog, isWindows } from '@shared/utils'
import { shellEnv } from 'shell-env'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { dirname, isAbsolute, join } from 'node:path'
import { existsSync } from 'node:fs'
import * as process from 'node:process'
import JSON5 from 'json5'
import { powerShellInlineArgs } from './PowerShellCommand'

const execFilePromise = promisify(execFile)

export const WINDOWS_ENV_SCRIPT = `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$userVars = [Environment]::GetEnvironmentVariables('User')
$machineVars = [Environment]::GetEnvironmentVariables('Machine')

$result = @{}
foreach ($key in $machineVars.Keys) { $result[$key] = $machineVars[$key] }
foreach ($key in $userVars.Keys) { $result[$key] = $userVars[$key] }

$mPath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
$uPath = [Environment]::GetEnvironmentVariable('Path', 'User')
$combinedPath = ($mPath.Split(';') + $uPath.Split(';')) | Where-Object { $_ } | Select-Object -Unique
$rawPath = $combinedPath -join ';'

foreach ($key in @($result.Keys)) {
  $value = $result[$key]
  if ($value -is [string]) {
    [Environment]::SetEnvironmentVariable($key, $value, 'Process')
  }
}

$result['PATH'] = $rawPath

foreach ($key in @($result.Keys)) {
  $value = $result[$key]
  if ($value -is [string] -and $value -match '%[^%]+%') {
    $expandedValue = [Environment]::ExpandEnvironmentVariables($value)
    $result[$key] = $expandedValue
    [Environment]::SetEnvironmentVariable($key, $expandedValue, 'Process')
  }
}

$result | ConvertTo-Json -Compress`

export type EnvSyncLocalResult = {
  env: Record<string, string>
  cmdPath?: string
  powerShellPath?: string
  systemPath?: string
}

const stringEnv = (value: NodeJS.ProcessEnv | Record<string, unknown>) => {
  const result: Record<string, string> = {}
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined) result[key] = String(item)
  }
  return result
}

class EnvSyncLocalLoader {
  private cmdPath?: string
  private powerShellPath?: string
  private systemPath?: string

  private findProcessEnv(key: string): string | undefined {
    const lowKey = key.toLowerCase()
    for (const [envKey, value] of Object.entries(process.env)) {
      if (envKey.toLowerCase() === lowKey) return value
    }
    return undefined
  }

  private async getWindowsAllEnv(): Promise<Record<string, string>> {
    let stdout = ''
    const cmdDefault = 'C:\\Windows\\System32\\cmd.exe'
    const comSpec = this.findProcessEnv('ComSpec')
    const systemRoot = this.findProcessEnv('SystemRoot')
    if (comSpec) {
      this.systemPath = dirname(comSpec)
    } else if (systemRoot) {
      this.systemPath = join(systemRoot, 'System32')
    } else if (existsSync(cmdDefault)) {
      this.systemPath = dirname(cmdDefault)
    } else {
      this.systemPath = 'C:\\Windows\\System32'
    }

    const powershellDefault =
      'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
    let powershell = 'powershell.exe'
    if (systemRoot) {
      powershell = join(systemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe')
    } else if (existsSync(powershellDefault)) {
      powershell = powershellDefault
    }

    try {
      const result: any = await execFilePromise(
        powershell,
        powerShellInlineArgs(WINDOWS_ENV_SCRIPT),
        {
          encoding: 'utf8',
          windowsHide: true,
          maxBuffer: 10 * 1024 * 1024
        }
      )
      stdout = `${result?.stdout ?? ''}`.trim()
    } catch (error) {
      console.error('[EnvSync] Failed to fetch Windows env from inline PowerShell:', error)
      appDebugLog('[EnvSync][getWindowsAllEnv][error]', `${error}`).catch()
      return stringEnv(process.env)
    }
    if (!stdout) return stringEnv(process.env)

    try {
      return stringEnv(JSON5.parse(stdout))
    } catch {}
    try {
      return stringEnv(JSON.parse(stdout))
    } catch {
      appDebugLog(
        '[EnvSync][getWindowsAllEnv][parse][error]',
        'PowerShell output was not valid JSON'
      ).catch()
      return stringEnv(process.env)
    }
  }

  private fetchWinPaths(env: Record<string, string>) {
    const cmdPath = 'C:\\Windows\\System32\\cmd.exe'
    if (existsSync(cmdPath)) {
      this.cmdPath = cmdPath
    } else if (env.ComSpec && existsSync(env.ComSpec)) {
      this.cmdPath = env.ComSpec
    } else if (env.SystemRoot && existsSync(env.SystemRoot)) {
      this.cmdPath = join(env.SystemRoot, 'System32/cmd.exe')
    } else {
      for (const [key, value] of Object.entries(env)) {
        const lowKey = key.toLowerCase()
        if (lowKey === 'comspec' && existsSync(value)) {
          this.cmdPath = value
          break
        }
        if (lowKey === 'systemroot' && existsSync(value)) {
          this.cmdPath = join(value, 'System32/cmd.exe')
          break
        }
      }
    }

    const powershellPath =
      'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
    if (existsSync(powershellPath)) {
      this.powerShellPath = powershellPath
      return
    }
    for (const [key, value] of Object.entries(env)) {
      const lowKey = key.toLowerCase()
      if (lowKey === 'systemroot' && existsSync(value)) {
        this.powerShellPath = join(
          value,
          'System32/WindowsPowerShell/v1.0/powershell.exe'
        )
        return
      }
      if (lowKey === 'programfiles' && existsSync(value)) {
        this.powerShellPath = join(value, 'PowerShell/7/pwsh.exe')
        return
      }
      if (lowKey === 'programfiles(x86)' && existsSync(value)) {
        this.powerShellPath = join(value, 'PowerShell/7/pwsh.exe')
        return
      }
    }
  }

  private async fetchWindows(): Promise<EnvSyncLocalResult> {
    console.time('EnvSync getWindowsAllEnv')
    let lastEnv: Record<string, string> = {}
    try {
      lastEnv = await this.getWindowsAllEnv()
    } catch {}
    console.timeEnd('EnvSync getWindowsAllEnv')

    const keys = ['PATH', 'Path', 'path']
    const paths: string[] = []
    for (const key of keys) {
      lastEnv[key]?.split(';').forEach((item) => {
        const path = item.trim()
        if (path) paths.push(path)
      })
    }
    for (const key of keys) {
      process.env[key]?.split(';').forEach((item) => {
        const path = item.trim()
        if (path) paths.push(path)
      })
    }

    const extent = `C:\\Program Files\\RedHat\\Podman;C:\\Windows\\System32\\WindowsPowerShell\\v1.0;${this.systemPath ?? 'C:\\Windows\\System32'}`
    extent.split(';').forEach((item) => {
      const path = item.trim()
      if (path) paths.unshift(path)
    })

    const path = Array.from(new Set(paths))
      .map((item) => item.trim())
      .filter((item) => {
        if (!item) return false
        if (/%[^%]+%/.test(item) || item.includes('$env:')) return true
        return isAbsolute(item)
      })
      .join(';')

    const env = stringEnv({ ...process.env, ...lastEnv, PATH: path, Path: path })
    this.fetchWinPaths(env)
    return {
      env,
      cmdPath: this.cmdPath,
      powerShellPath: this.powerShellPath,
      systemPath: this.systemPath
    }
  }

  async fetch(): Promise<EnvSyncLocalResult> {
    if (isWindows()) return this.fetchWindows()
    const env = stringEnv(await shellEnv())
    const PATH = `${env.PATH ?? ''}:/opt/podman/bin:/home/linuxbrew/.linuxbrew/bin:$HOME/.linuxbrew/bin:/opt:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/Homebrew/bin:/opt/local/bin:/opt/local/sbin:/usr/local/bin:/usr/bin:/usr/sbin`
    env.PATH = Array.from(new Set(PATH.split(':'))).join(':')
    return { env }
  }
}

export const fetchEnvSyncLocal = () => new EnvSyncLocalLoader().fetch()
```

Do not merge `global.Server.Proxy` in this file. Re-export the script from `src/shared/EnvSync.ts` so the existing script test remains valid:

```ts
export { WINDOWS_ENV_SCRIPT } from './EnvSyncLocal'
```

- [ ] **Step 4: Replace the old singleton internals with `EnvSyncAccess`**

Replace the old timer-based class in `src/shared/EnvSync.ts` with this access-layer shape:

```ts
import { appDebugLog } from '@shared/utils'
import { fetchEnvSyncLocal, type EnvSyncLocalResult } from './EnvSyncLocal'
import type { EnvSyncSnapshot } from './EnvSyncProtocol'

export { WINDOWS_ENV_SCRIPT } from './EnvSyncLocal'

export type EnvSyncProvider = {
  get(): Promise<EnvSyncSnapshot>
  invalidate(): Promise<number>
}

type CachedSnapshot = {
  snapshot: EnvSyncSnapshot
  source: 'provider' | 'local-primary' | 'local-fallback'
}

type EnvSyncAccessOptions = {
  localFetch?: () => Promise<EnvSyncLocalResult>
  now?: () => number
  localTtlMs?: number
  fallbackTtlMs?: number
}

export class EnvSyncAccess {
  AppEnv: Record<string, string> | undefined
  CMDPath: string | undefined
  PowerShellPath: string | undefined
  SystemPath: string | undefined

  private provider?: EnvSyncProvider
  private cached?: CachedSnapshot
  private inFlight?: Promise<Record<string, string>>
  private invalidateInFlight: Promise<void> = Promise.resolve()
  private minimumRevision = 0
  private readonly localFetch: () => Promise<EnvSyncLocalResult>
  private readonly now: () => number
  private readonly localTtlMs: number
  private readonly fallbackTtlMs: number

  constructor(options: EnvSyncAccessOptions = {}) {
    this.localFetch = options.localFetch ?? fetchEnvSyncLocal
    this.now = options.now ?? Date.now
    this.localTtlMs = options.localTtlMs ?? 300_000
    this.fallbackTtlMs = options.fallbackTtlMs ?? 5_000
  }

  setProvider(provider?: EnvSyncProvider) {
    this.provider = provider
    this.clearLocal()
  }

  clearLocal(revision?: number) {
    if (revision !== undefined && revision < this.minimumRevision) return
    if (revision !== undefined && revision > this.minimumRevision) {
      this.minimumRevision = revision
    }
    this.cached = undefined
    this.AppEnv = undefined
    this.CMDPath = undefined
    this.PowerShellPath = undefined
    this.SystemPath = undefined
  }

  private apply(snapshot: EnvSyncSnapshot) {
    const env = { ...snapshot.env }
    for (const [key, value] of Object.entries(global.Server?.Proxy ?? {})) {
      env[key] = String(value)
    }
    this.AppEnv = env
    this.CMDPath = snapshot.cmdPath
    this.PowerShellPath = snapshot.powerShellPath
    this.SystemPath = snapshot.systemPath
    return env
  }

  private async providerSnapshot(): Promise<EnvSyncSnapshot> {
    const provider = this.provider!
    let snapshot = await provider.get()
    if (snapshot.revision < this.minimumRevision) snapshot = await provider.get()
    if (snapshot.revision < this.minimumRevision) {
      throw new Error(
        `Env sync snapshot revision ${snapshot.revision} is below ${this.minimumRevision}`
      )
    }
    return snapshot
  }

  private async load(): Promise<Record<string, string>> {
    if (this.provider) {
      try {
        const snapshot = await this.providerSnapshot()
        this.cached = { snapshot, source: 'provider' }
        return this.apply(snapshot)
      } catch (error) {
        appDebugLog('[EnvSync][local-fallback]', `${error}`).catch()
      }
    }

    const local = await this.localFetch()
    const fetchedAt = this.now()
    const source = this.provider ? 'local-fallback' : 'local-primary'
    const snapshot: EnvSyncSnapshot = {
      revision: this.minimumRevision,
      ...local,
      fetchedAt,
      expiresAt:
        fetchedAt + (source === 'local-fallback' ? this.fallbackTtlMs : this.localTtlMs)
    }
    this.cached = { snapshot, source }
    return this.apply(snapshot)
  }

  async sync(): Promise<Record<string, string>> {
    await this.invalidateInFlight
    if (this.AppEnv && !this.cached) return this.AppEnv
    const cached = this.cached
    if (cached && this.now() < cached.snapshot.expiresAt) return this.apply(cached.snapshot)
    if (this.inFlight) return this.inFlight
    let promise!: Promise<Record<string, string>>
    promise = this.load().finally(() => {
      if (this.inFlight === promise) this.inFlight = undefined
    })
    this.inFlight = promise
    return promise
  }

  clean(): Promise<void> {
    this.clearLocal()
    const provider = this.provider
    if (!provider) return Promise.resolve()
    const next = this.invalidateInFlight
      .catch(() => undefined)
      .then(() => provider.invalidate())
      .then((revision) => this.clearLocal(revision))
      .catch((error) => {
        appDebugLog('[EnvSync][invalidate][error]', `${error}`).catch()
      })
    this.invalidateInFlight = next
    return next
  }
}

export default new EnvSyncAccess()
```

- [ ] **Step 5: Run the focused and existing EnvSync tests**

Run:

```bash
npx prettier --write src/shared/EnvSyncLocal.ts src/shared/EnvSync.ts scripts/env-sync-coordinator-test.ts
yarn test:env-sync-coordinator
npx tsx scripts/windows-env-sync-script-test.ts
npx tsx scripts/brew-info-json-fallback-test.ts
```

Expected: all three commands PASS. The Windows script test must continue importing `WINDOWS_ENV_SCRIPT` from `src/shared/EnvSync.ts`.

- [ ] **Step 6: Run TypeScript checking for the refactor**

Run:

```bash
npx tsc --noEmit --pretty false
```

Expected: exit 0. npm mirror configuration warnings are acceptable; TypeScript errors are not.

- [ ] **Step 7: Commit the local loader and access layer**

```bash
git add src/shared/EnvSyncLocal.ts src/shared/EnvSync.ts scripts/env-sync-coordinator-test.ts
git commit --only -m "refactor: split env sync loading and access" -- src/shared/EnvSyncLocal.ts src/shared/EnvSync.ts scripts/env-sync-coordinator-test.ts
```

## Task 4: Add the Main bridge and Fork client

**Files:**

- Create: `src/main/core/EnvSyncBridge.ts`
- Create: `src/fork/EnvSyncClient.ts`
- Modify: `scripts/env-sync-coordinator-test.ts`

- [ ] **Step 1: Add failing Bridge and Client tests**

Append before the final console log:

```ts
import { EnvSyncBridge } from '../src/main/core/EnvSyncBridge'
import { EnvSyncClient } from '../src/fork/EnvSyncClient'
import type { EnvSyncResponse } from '../src/shared/EnvSyncProtocol'

const bridgeReplies: EnvSyncResponse[] = []
const bridgeBroadcasts: number[] = []
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
assert.equal(bridge.handle({ type: 'normal-task' }, () => {}), false)
await new Promise((resolve) => setTimeout(resolve, 0))
assert.deepEqual(bridgeReplies, [
  { type: 'env-sync-get-response', requestId: 'bridge-get', snapshot },
  { type: 'env-sync-invalidate-response', requestId: 'bridge-clean', revision: 5 }
])
assert.deepEqual(bridgeBroadcasts, [])

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
const timeoutClient = new EnvSyncClient(() => {}, () => {}, {
  requestId: () => 'timeout-get',
  scheduleTimeout: (handler) => {
    triggerTimeout = handler
    return 1
  },
  cancelTimeout: () => {}
})
const timedOut = timeoutClient.get()
triggerTimeout?.()
await assert.rejects(() => timedOut, /timed out after 10000ms/)
```

- [ ] **Step 2: Run tests and verify Bridge/Client modules are missing**

Run:

```bash
yarn test:env-sync-coordinator
```

Expected: FAIL on missing `EnvSyncBridge` or `EnvSyncClient`.

- [ ] **Step 3: Implement the Main bridge**

Create `src/main/core/EnvSyncBridge.ts`:

```ts
import {
  isEnvSyncGetRequest,
  isEnvSyncInvalidateRequest,
  type EnvSyncResponse,
  type EnvSyncSnapshot
} from '@shared/EnvSyncProtocol'

type EnvSyncSource = {
  get(): Promise<EnvSyncSnapshot>
  invalidate(): Promise<number>
}

export class EnvSyncBridge {
  constructor(private readonly source: EnvSyncSource) {}

  handle(message: unknown, reply: (message: EnvSyncResponse) => void): boolean {
    if (isEnvSyncGetRequest(message)) {
      void this.source
        .get()
        .then((snapshot) => {
          reply({ type: 'env-sync-get-response', requestId: message.requestId, snapshot })
        })
        .catch((error) => {
          reply({
            type: 'env-sync-get-response',
            requestId: message.requestId,
            error: error instanceof Error ? error.message : String(error)
          })
        })
      return true
    }
    if (isEnvSyncInvalidateRequest(message)) {
      void this.source
        .invalidate()
        .then((revision) => {
          reply({
            type: 'env-sync-invalidate-response',
            requestId: message.requestId,
            revision
          })
        })
        .catch((error) => {
          reply({
            type: 'env-sync-invalidate-response',
            requestId: message.requestId,
            error: error instanceof Error ? error.message : String(error)
          })
        })
      return true
    }
    return false
  }
}
```

- [ ] **Step 4: Implement the Fork client**

Create `src/fork/EnvSyncClient.ts` using separate pending Maps so response types remain explicit:

```ts
import { randomUUID } from 'node:crypto'
import {
  isEnvSyncGetResponse,
  isEnvSyncInvalidateResponse,
  isEnvSyncInvalidated,
  type EnvSyncRequest,
  type EnvSyncSnapshot
} from '@shared/EnvSyncProtocol'

type TimerToken = ReturnType<typeof setTimeout> | number
type Pending<T> = {
  resolve: (value: T) => void
  reject: (error: Error) => void
  timeout: TimerToken
}

type EnvSyncClientOptions = {
  timeoutMs?: number
  requestId?: () => string
  scheduleTimeout?: (handler: () => void, delayMs: number) => TimerToken
  cancelTimeout?: (token: TimerToken) => void
}

export class EnvSyncClient {
  private readonly getPending = new Map<string, Pending<EnvSyncSnapshot>>()
  private readonly invalidatePending = new Map<string, Pending<number>>()
  private readonly timeoutMs: number
  private readonly requestId: () => string
  private readonly scheduleTimeout: (handler: () => void, delayMs: number) => TimerToken
  private readonly cancelTimeout: (token: TimerToken) => void

  constructor(
    private readonly send: (message: EnvSyncRequest) => void,
    private readonly onInvalidated: (revision: number) => void,
    options: EnvSyncClientOptions = {}
  ) {
    this.timeoutMs = options.timeoutMs ?? 10_000
    this.requestId = options.requestId ?? randomUUID
    this.scheduleTimeout = options.scheduleTimeout ?? setTimeout
    this.cancelTimeout = options.cancelTimeout ?? clearTimeout
  }

  private request<T>(
    pending: Map<string, Pending<T>>,
    message: EnvSyncRequest
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeout = this.scheduleTimeout(() => {
        pending.delete(message.requestId)
        reject(new Error(`Env sync request timed out after ${this.timeoutMs}ms`))
      }, this.timeoutMs)
      pending.set(message.requestId, { resolve, reject, timeout })
      try {
        this.send(message)
      } catch (error) {
        pending.delete(message.requestId)
        this.cancelTimeout(timeout)
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  get() {
    const requestId = this.requestId()
    return this.request(this.getPending, { type: 'env-sync-get', requestId })
  }

  invalidate() {
    const requestId = this.requestId()
    return this.request(this.invalidatePending, { type: 'env-sync-invalidate', requestId })
  }

  handleMessage(message: unknown): boolean {
    if (isEnvSyncInvalidated(message)) {
      this.onInvalidated(message.revision)
      return true
    }
    if (isEnvSyncGetResponse(message)) {
      const pending = this.getPending.get(message.requestId)
      if (!pending) return true
      this.getPending.delete(message.requestId)
      this.cancelTimeout(pending.timeout)
      if (message.error || !message.snapshot) {
        pending.reject(new Error(message.error || 'Env sync response has no snapshot'))
      } else {
        pending.resolve(message.snapshot)
      }
      return true
    }
    if (isEnvSyncInvalidateResponse(message)) {
      const pending = this.invalidatePending.get(message.requestId)
      if (!pending) return true
      this.invalidatePending.delete(message.requestId)
      this.cancelTimeout(pending.timeout)
      if (message.error || message.revision === undefined) {
        pending.reject(new Error(message.error || 'Env sync response has no revision'))
      } else {
        pending.resolve(message.revision)
      }
      return true
    }
    return false
  }
}
```

- [ ] **Step 5: Run tests and type checking**

```bash
npx prettier --write src/main/core/EnvSyncBridge.ts src/fork/EnvSyncClient.ts scripts/env-sync-coordinator-test.ts
yarn test:env-sync-coordinator
npx tsc --noEmit --pretty false
```

Expected: both commands exit 0.

- [ ] **Step 6: Commit the IPC bridge and client**

```bash
git add src/main/core/EnvSyncBridge.ts src/fork/EnvSyncClient.ts scripts/env-sync-coordinator-test.ts
git commit --only -m "feat: bridge env sync through main" -- src/main/core/EnvSyncBridge.ts src/fork/EnvSyncClient.ts scripts/env-sync-coordinator-test.ts
```

## Task 5: Wire the Coordinator into Main and every Fork

**Files:**

- Modify: `src/main/core/ForkManager.ts:1-305`
- Modify: `src/fork/index.ts:1-56`
- Modify: `scripts/env-sync-coordinator-test.ts`

- [ ] **Step 1: Add failing integration source assertions**

Append before the final console log:

```ts
import { readFileSync } from 'node:fs'

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
```

- [ ] **Step 2: Run the test and verify the wiring assertions fail**

Run:

```bash
yarn test:env-sync-coordinator
```

Expected: FAIL on the first missing `EnvSyncCoordinator` match in `ForkManager.ts`.

- [ ] **Step 3: Inject `EnvSyncBridge` into `ForkItem`**

Add imports in `src/main/core/ForkManager.ts`:

```ts
import EnvSync from '@shared/EnvSync'
import { fetchEnvSyncLocal } from '@shared/EnvSyncLocal'
import type { EnvSyncInvalidated } from '@shared/EnvSyncProtocol'
import { EnvSyncCoordinator } from './EnvSyncCoordinator'
import { EnvSyncBridge } from './EnvSyncBridge'
```

Add `EnvSyncBridge` to the `ForkItem` constructor before the existing cache bridges:

```ts
constructor(
  file: string,
  autoDestroy: boolean,
  private readonly envSyncBridge: EnvSyncBridge,
  private readonly stopProcessListBridge: StopProcessListBridge,
  private readonly binVersionCacheBridge: BinVersionCacheBridge
) {
```

Handle EnvSync messages first in `ForkItem.onMessage()`:

```ts
if (
  this.envSyncBridge.handle(message, (response) => {
    try {
      child.postMessage(response)
    } catch {}
  })
) {
  return
}
```

Pass `this.envSyncBridge` to every `new ForkItem(...)` call for ordinary, FTP, DNS, and Ollama Forks.

- [ ] **Step 4: Create Main shared state and invalidation broadcasting**

Add these fields after the existing `_on` field:

```ts
private readonly envSyncCoordinator = new EnvSyncCoordinator(fetchEnvSyncLocal, {
  ttlMs: 300_000,
  onEvent: (event) => {
    console.log('[EnvSyncCoordinator]: ', event)
  }
})
private readonly envSyncBridge = new EnvSyncBridge(this.envSyncCoordinator)
private readonly unsubscribeEnvSync = this.envSyncCoordinator.subscribe((revision) => {
  EnvSync.clearLocal(revision)
  this.broadcastEnvSyncInvalidated(revision)
})
```

Register the Main provider in the constructor:

```ts
constructor(file: string) {
  this.file = file
  EnvSync.setProvider(this.envSyncCoordinator)
}
```

Add the broadcast helper:

```ts
private broadcastEnvSyncInvalidated(revision: number) {
  const message: EnvSyncInvalidated = { type: 'env-sync-invalidated', revision }
  const forks = new Set(
    [this.ftpsrvFork, this.dnsFork, this.ollamaChatFork, ...this.forks].filter(
      (item): item is ForkItem => !!item
    )
  )
  for (const fork of forks) {
    if (fork.childExited) continue
    try {
      fork.child.postMessage(message)
    } catch {}
  }
}
```

In `destroy()`, keep the existing bin-version flush first, then unsubscribe and remove the Main provider before killing UtilityProcesses:

```ts
await this.binVersionCacheStore.flush()
this.unsubscribeEnvSync()
EnvSync.setProvider(undefined)
```

Do not call public `EnvSync.clean()` from the subscription; that would recursively invalidate and broadcast.

- [ ] **Step 5: Register the Fork provider and message handler**

Add imports to `src/fork/index.ts`:

```ts
import EnvSync from '@shared/EnvSync'
import { EnvSyncClient } from './EnvSyncClient'
```

Create the client next to existing clients:

```ts
const envSyncClient = parentPort
  ? new EnvSyncClient(
      (message) => parentPort.postMessage(message),
      (revision) => EnvSync.clearLocal(revision)
    )
  : undefined
```

Register the provider:

```ts
if (envSyncClient) {
  EnvSync.setProvider({
    get: () => envSyncClient.get(),
    invalidate: () => envSyncClient.invalidate()
  })
}
```

Handle EnvSync responses and broadcasts before the existing clients:

```ts
if (envSyncClient?.handleMessage(data)) {
  return
}
```

- [ ] **Step 6: Run focused tests and TypeScript checking**

```bash
npx prettier --write src/main/core/ForkManager.ts src/fork/index.ts scripts/env-sync-coordinator-test.ts
yarn test:env-sync-coordinator
npx tsc --noEmit --pretty false
```

Expected: both commands exit 0. The source assertions confirm all Fork categories receive the shared Bridge through constructor injection.

- [ ] **Step 7: Commit the Main/Fork wiring**

```bash
git add src/main/core/ForkManager.ts src/fork/index.ts scripts/env-sync-coordinator-test.ts
git commit --only -m "feat: share env snapshots across forks" -- src/main/core/ForkManager.ts src/fork/index.ts scripts/env-sync-coordinator-test.ts
```

## Task 6: Route all environment mutations through global invalidation

**Files:**

- Modify: `src/fork/module/Tool/path.ts:202-212`
- Modify: `scripts/env-sync-coordinator-test.ts`

- [ ] **Step 1: Add a failing direct-state-mutation regression test**

Append before the final console log:

```ts
const envSyncConsumers = [
  'src/fork/module/Tool/path.ts',
  'src/fork/module/Git/index.ts',
  'src/fork/util/AiCli.ts',
  'src/shared/WindowsHelperFallback.ts',
  'src/main/core/AppNodeFn.ts'
].map((path) => [path, readFileSync(path, 'utf8')] as const)

for (const [path, source] of envSyncConsumers) {
  assert.doesNotMatch(source, /EnvSync\.(AppEnv|CMDPath|PowerShellPath|SystemPath)\s*=\s*undefined/, path)
}
assert.match(readFileSync('src/fork/module/Tool/path.ts', 'utf8'), /await EnvSync\.clean\(\)/)
```

- [ ] **Step 2: Run the test and verify `Tool/path.ts` fails the assertion**

Run:

```bash
yarn test:env-sync-coordinator
```

Expected: FAIL because `src/fork/module/Tool/path.ts` contains `EnvSync.AppEnv = undefined`.

- [ ] **Step 3: Replace local PATH invalidation with global clean**

Change the PATH update tail to:

```ts
await EnvSync.clean()
const allPath = await fetchPATH()
resolve(allPath)
```

Run a repository search:

```bash
rg -n "EnvSync\.(AppEnv|CMDPath|PowerShellPath|SystemPath)\s*=\s*undefined" src
```

Expected: no output. If another business module directly clears a public field, replace that exact assignment with `await EnvSync.clean()` when already inside an async function. Internal `EnvSyncAccess.clearLocal()` assignments remain inside `src/shared/EnvSync.ts` and are not matched because they use `this`, not the singleton name.

- [ ] **Step 4: Run focused and related regression tests**

```bash
npx prettier --write src/fork/module/Tool/path.ts scripts/env-sync-coordinator-test.ts
yarn test:env-sync-coordinator
npx tsx scripts/windows-env-sync-script-test.ts
npx tsx scripts/brew-info-json-fallback-test.ts
yarn test:startup-groups
yarn test:stop-process-list-cache
yarn test:bin-version-cache
```

Expected: all commands exit 0.

- [ ] **Step 5: Commit global invalidation call-site cleanup**

```bash
git add src/fork/module/Tool/path.ts scripts/env-sync-coordinator-test.ts
git commit --only -m "fix: invalidate shared env after path updates" -- src/fork/module/Tool/path.ts scripts/env-sync-coordinator-test.ts
```

## Task 7: Verify concurrency, logging safety, and final integration

**Files:**

- Modify if verification exposes a defect: only files already listed in Tasks 1-6
- Test: `scripts/env-sync-coordinator-test.ts`

- [ ] **Step 1: Add the final concurrency acceptance case**

Add a test that models a startup group with multiple Fork clients sharing one Bridge and Coordinator:

```ts
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
  let client!: EnvSyncClient
  client = new EnvSyncClient(
    (message) => {
      groupBridge.handle(message, (response) => client.handleMessage(response))
    },
    () => {},
    { requestId: () => `${prefix}-${++number}` }
  )
  return client
}

const groupClients = Array.from({ length: 8 }, (_, index) => makeLoopbackClient(`fork-${index}`))
const groupResults = groupClients.map((client) => client.get())
await Promise.resolve()
assert.equal(groupFetches, 1)
releaseGroupFetch()
const groupSnapshots = await Promise.all(groupResults)
assert.deepEqual(new Set(groupSnapshots.map((item) => item.revision)), new Set([0]))
assert.deepEqual(new Set(groupSnapshots.map((item) => item.env.GROUP_ENV)), new Set(['shared']))
```

- [ ] **Step 2: Run the focused test repeatedly**

Run three times to catch promise-ordering races:

```bash
yarn test:env-sync-coordinator
yarn test:env-sync-coordinator
yarn test:env-sync-coordinator
```

Expected: all three runs PASS and each prints `env sync coordinator tests passed`.

- [ ] **Step 3: Check logging and persisted-data safety**

Run:

```bash
rg -n "JSON\.stringify\((snapshot|.*AppEnv|.*\.env)\)|console\.log\(.*(AppEnv|snapshot\.env)|\$\{stdout\}" src/main/core/EnvSyncCoordinator.ts src/main/core/EnvSyncBridge.ts src/fork/EnvSyncClient.ts src/shared/EnvSync.ts src/shared/EnvSyncLocal.ts
```

Expected: no output. Metadata event logging is allowed; complete env logging is not.

Run:

```bash
rg -n "electron-store|writeFile|appendFile" src/main/core/EnvSyncCoordinator.ts src/shared/EnvSync.ts src/shared/EnvSyncLocal.ts
```

Expected: no environment persistence imports or calls. `appDebugLog` is allowed only for errors without env contents.

- [ ] **Step 4: Run formatting, type checking, and all relevant tests**

```bash
npx prettier --write src/shared/EnvSyncProtocol.ts src/shared/EnvSyncLocal.ts src/shared/EnvSync.ts src/main/core/EnvSyncCoordinator.ts src/main/core/EnvSyncBridge.ts src/main/core/ForkManager.ts src/fork/EnvSyncClient.ts src/fork/index.ts src/fork/module/Tool/path.ts scripts/env-sync-coordinator-test.ts package.json
npx eslint src/shared/EnvSyncProtocol.ts src/shared/EnvSyncLocal.ts src/shared/EnvSync.ts src/main/core/EnvSyncCoordinator.ts src/main/core/EnvSyncBridge.ts src/main/core/ForkManager.ts src/fork/EnvSyncClient.ts src/fork/index.ts src/fork/module/Tool/path.ts scripts/env-sync-coordinator-test.ts
npx tsc --noEmit --pretty false
yarn test:env-sync-coordinator
npx tsx scripts/windows-env-sync-script-test.ts
npx tsx scripts/brew-info-json-fallback-test.ts
yarn test:startup-groups
yarn test:stop-process-list-cache
yarn test:bin-version-cache
```

Expected: every command exits 0. npm configuration warnings about mirrors are acceptable; lint, TypeScript, assertion, or unhandled rejection errors are not.

- [ ] **Step 5: Inspect the final diff for unrelated changes**

```bash
git diff -- src/shared/EnvSyncProtocol.ts src/shared/EnvSyncLocal.ts src/shared/EnvSync.ts src/main/core/EnvSyncCoordinator.ts src/main/core/EnvSyncBridge.ts src/main/core/ForkManager.ts src/fork/EnvSyncClient.ts src/fork/index.ts src/fork/module/Tool/path.ts scripts/env-sync-coordinator-test.ts package.json
git diff --check -- src/shared/EnvSyncProtocol.ts src/shared/EnvSyncLocal.ts src/shared/EnvSync.ts src/main/core/EnvSyncCoordinator.ts src/main/core/EnvSyncBridge.ts src/main/core/ForkManager.ts src/fork/EnvSyncClient.ts src/fork/index.ts src/fork/module/Tool/path.ts scripts/env-sync-coordinator-test.ts package.json
```

Expected: the diff contains only the Coordinator, IPC, access-layer, invalidation, tests, and package script changes described by this plan; `git diff --check` prints nothing.

- [ ] **Step 6: Commit any final test-only adjustment**

If Step 1 added the only uncommitted change, commit it:

```bash
git add scripts/env-sync-coordinator-test.ts
git commit --only -m "test: cover cross-fork env singleflight" -- scripts/env-sync-coordinator-test.ts
```

If verification required a production fix, add only that exact production file plus its regression test and use the same commit message with `fix:` instead of `test:`.

## Completion Criteria

- One Main local load serves all concurrent Fork and Main requests within a fixed five-minute window.
- The same Fork also deduplicates concurrent `sync()` calls.
- `clean()` from Main or any Fork increments Main revision, clears Main local state, and broadcasts silent local invalidation to all live Fork categories.
- A query from an older revision cannot populate cache or resolve callers after invalidation.
- Main IPC failure falls back locally for at most five seconds before retrying Main.
- Proxy values are overlaid when applying a snapshot and are not part of the shared base cache.
- No complete environment snapshot is logged or persisted.
- TypeScript, ESLint, focused EnvSync tests, startup group tests, stop process list tests, and bin version cache tests all pass.
