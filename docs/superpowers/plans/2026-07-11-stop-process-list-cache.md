# Stop Process List Cache Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为服务停止阶段增加主进程共享的 350ms 进程列表缓存，使多个 UtilityProcess 合并重复的全量进程枚举，同时保持所有非停止查询实时。

**Architecture:** 主进程持有 `StopProcessListCache`，通过现有 UtilityProcess 双向消息处理 Fork 的按需请求。Fork 侧注册停止快照 provider，停止专用查询门面优先使用主进程结果，错误或 10 秒超时时回退本地无缓存查询；现有通用进程查询 API 保持不变。

**Tech Stack:** Electron UtilityProcess IPC、TypeScript、Node.js Promise/`performance.now()`、现有 Helper/PowerShell/`ps` 进程查询、Node `assert/strict`、`tsx`。

---

## File Structure

- Create: `src/main/core/StopProcessListCache.ts` — 350ms TTL、singleflight 和无敏感内容的缓存事件。
- Create: `src/main/core/StopProcessListBridge.ts` — 将 Fork 请求转换为主进程缓存响应。
- Create: `src/fork/StopProcessListClient.ts` — Fork pending 请求、10 秒超时和响应匹配。
- Create: `src/shared/StopProcessList.ts` — IPC 类型、类型守卫、provider 注册、停止专用查询和本地回退。
- Modify: `src/shared/Process.win.ts` — 提取会抛错的 Windows 严格进程列表入口，同时保留旧 API 的吞错行为。
- Modify: `src/main/core/ForkManager.ts` — 所有 ForkItem 共享一个 bridge，并把响应发回原 UtilityProcess。
- Modify: `src/fork/index.ts` — 分流主进程响应并注册 Fork provider。
- Modify: `src/fork/module/Base/index.ts` — 基础停止路径使用停止专用快照。
- Modify: `src/fork/module/Php/index.ts`、`Php.win/index.ts`、`Redis/index.ts`、`Mysql/index.ts`、`Mariadb/index.ts`、`N8N/index.ts`、`Postgresql/index.ts`、`ModuleCustomer/index.ts`、`LanguageProject/index.ts`、`OpenClaw/index.ts`、`Hermes/index.ts` — 仅替换停止阶段查询。
- Create: `scripts/stop-process-list-cache-test.ts` — 缓存、bridge、client、fallback、作用域静态回归测试。
- Modify: `package.json` — 注册 `test:stop-process-list-cache`。

## Scope Rules

- `Base.startService()` 调用 `_stopServer()` 的预停止属于停止阶段，使用缓存。
- `_startServer()`、启动成功轮询、安装状态检查、进程工具和端口工具保持实时。
- kill、stop、start 都不主动清缓存；缓存只按查询完成后的 350ms TTL 过期。
- 主进程查询失败、IPC 错误或 10 秒超时后，Fork 执行当前平台的本地无缓存查询。

### Task 1: 建立主进程缓存核心和测试入口

**Files:**

- Create: `src/main/core/StopProcessListCache.ts`
- Create: `scripts/stop-process-list-cache-test.ts`
- Modify: `package.json`

- [ ] **Step 1: 编写缓存行为的失败测试**

Create `scripts/stop-process-list-cache-test.ts` with the initial cache tests:

```ts
import assert from 'node:assert/strict'
import type { PItem } from '../src/shared/Process'
import { StopProcessListCache } from '../src/main/core/StopProcessListCache'

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

let failureCount = 0
const failingCache = new StopProcessListCache(async () => {
  failureCount += 1
  if (failureCount === 1) throw new Error('process list failed')
  return []
})
await assert.rejects(() => failingCache.get(), /process list failed/)
assert.deepEqual(await failingCache.get(), [])
assert.equal(failureCount, 2)
assert.deepEqual(await failingCache.get(), [])
assert.equal(failureCount, 2)

console.log('stop process list cache tests passed')
```

- [ ] **Step 2: 注册测试脚本并确认 RED**

Add to `package.json`:

```json
"test:stop-process-list-cache": "tsx scripts/stop-process-list-cache-test.ts"
```

Run:

```bash
yarn test:stop-process-list-cache
```

Expected: FAIL with `Cannot find module '../src/main/core/StopProcessListCache'`.

- [ ] **Step 3: 实现最小缓存类**

Create `src/main/core/StopProcessListCache.ts`:

```ts
import type { PItem } from '@shared/Process'

export type StopProcessListCacheEvent =
  | { type: 'hit' }
  | { type: 'join' }
  | { type: 'miss' }
  | { type: 'fetch-success'; durationMs: number; processCount: number }
  | { type: 'fetch-error'; durationMs: number; error: string }

type StopProcessListCacheOptions = {
  ttlMs?: number
  now?: () => number
  onEvent?: (event: StopProcessListCacheEvent) => void
}

export class StopProcessListCache {
  private cache?: { list: PItem[]; expiresAt: number }
  private inFlight?: Promise<PItem[]>
  private readonly ttlMs: number
  private readonly now: () => number
  private readonly onEvent: (event: StopProcessListCacheEvent) => void

  constructor(
    private readonly fetchList: () => Promise<PItem[]>,
    options: StopProcessListCacheOptions = {}
  ) {
    this.ttlMs = options.ttlMs ?? 350
    this.now = options.now ?? (() => performance.now())
    this.onEvent = options.onEvent ?? (() => {})
  }

  get(): Promise<PItem[]> {
    const cached = this.cache
    if (cached && this.now() < cached.expiresAt) {
      this.onEvent({ type: 'hit' })
      return Promise.resolve(cached.list)
    }
    if (this.inFlight) {
      this.onEvent({ type: 'join' })
      return this.inFlight
    }

    this.onEvent({ type: 'miss' })
    const startedAt = this.now()
    this.inFlight = Promise.resolve()
      .then(() => this.fetchList())
      .then((list) => {
        this.cache = {
          list,
          expiresAt: this.now() + this.ttlMs
        }
        this.onEvent({
          type: 'fetch-success',
          durationMs: this.now() - startedAt,
          processCount: list.length
        })
        return list
      })
      .catch((error) => {
        this.onEvent({
          type: 'fetch-error',
          durationMs: this.now() - startedAt,
          error: error instanceof Error ? error.message : String(error)
        })
        throw error
      })
      .finally(() => {
        this.inFlight = undefined
      })
    return this.inFlight
  }
}
```

- [ ] **Step 4: 修正测试中的独立时钟并验证 GREEN**

The failure-cache test must use its own clock so the valid empty result remains cached:

```ts
let failureNow = 0
const failingCache = new StopProcessListCache(
  async () => {
    failureCount += 1
    if (failureCount === 1) throw new Error('process list failed')
    return []
  },
  { now: () => failureNow }
)
```

Run:

```bash
yarn test:stop-process-list-cache
```

Expected: `stop process list cache tests passed`.

- [ ] **Step 5: Commit**

```bash
git add src/main/core/StopProcessListCache.ts scripts/stop-process-list-cache-test.ts package.json
git commit -m "feat: add stop process list cache core"
```

### Task 2: 定义 IPC 协议、Fork 客户端和主进程 Bridge

**Files:**

- Create: `src/shared/StopProcessList.ts`
- Create: `src/fork/StopProcessListClient.ts`
- Create: `src/main/core/StopProcessListBridge.ts`
- Modify: `scripts/stop-process-list-cache-test.ts`

- [ ] **Step 1: 编写协议、bridge 和 client 的失败测试**

Append to `scripts/stop-process-list-cache-test.ts`:

```ts
import {
  isStopProcessListRequest,
  isStopProcessListResponse,
  type StopProcessListResponse
} from '../src/shared/StopProcessList'
import { StopProcessListBridge } from '../src/main/core/StopProcessListBridge'
import { StopProcessListClient } from '../src/fork/StopProcessListClient'

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
```

- [ ] **Step 2: Run to verify RED**

```bash
yarn test:stop-process-list-cache
```

Expected: FAIL because `StopProcessList`, `StopProcessListBridge`, and `StopProcessListClient` do not exist.

- [ ] **Step 3: 创建共享协议类型和守卫**

Create the protocol portion of `src/shared/StopProcessList.ts`:

```ts
import type { PItem } from './Process'

export type StopProcessListRequest = {
  type: 'stop-process-list-request'
  requestId: string
}

export type StopProcessListResponse = {
  type: 'stop-process-list-response'
  requestId: string
  list?: PItem[]
  error?: string
}

export const isStopProcessListRequest = (value: unknown): value is StopProcessListRequest => {
  const message = value as Partial<StopProcessListRequest> | null
  return (
    !!message &&
    message.type === 'stop-process-list-request' &&
    typeof message.requestId === 'string' &&
    message.requestId.length > 0
  )
}

export const isStopProcessListResponse = (value: unknown): value is StopProcessListResponse => {
  const message = value as Partial<StopProcessListResponse> | null
  return (
    !!message &&
    message.type === 'stop-process-list-response' &&
    typeof message.requestId === 'string' &&
    message.requestId.length > 0
  )
}
```

- [ ] **Step 4: 实现主进程 bridge**

Create `src/main/core/StopProcessListBridge.ts`:

```ts
import { isStopProcessListRequest, type StopProcessListResponse } from '@shared/StopProcessList'
import type { PItem } from '@shared/Process'

type StopProcessListSource = {
  get(): Promise<PItem[]>
}

export class StopProcessListBridge {
  constructor(private readonly source: StopProcessListSource) {}

  handle(message: unknown, reply: (message: StopProcessListResponse) => void): boolean {
    if (!isStopProcessListRequest(message)) return false
    void this.source
      .get()
      .then((list) => {
        reply({
          type: 'stop-process-list-response',
          requestId: message.requestId,
          list
        })
      })
      .catch((error) => {
        reply({
          type: 'stop-process-list-response',
          requestId: message.requestId,
          error: error instanceof Error ? error.message : String(error)
        })
      })
    return true
  }
}
```

- [ ] **Step 5: 实现 Fork 客户端**

Create `src/fork/StopProcessListClient.ts`:

```ts
import { randomUUID } from 'node:crypto'
import type { PItem } from '@shared/Process'
import { isStopProcessListResponse, type StopProcessListRequest } from '@shared/StopProcessList'

type TimeoutToken = ReturnType<typeof setTimeout> | number
type StopProcessListClientOptions = {
  timeoutMs?: number
  requestId?: () => string
  scheduleTimeout?: (handler: () => void, timeoutMs: number) => TimeoutToken
  cancelTimeout?: (token: TimeoutToken) => void
}

type PendingRequest = {
  resolve: (list: PItem[]) => void
  reject: (error: Error) => void
  timeout: TimeoutToken
}

export class StopProcessListClient {
  private readonly pending = new Map<string, PendingRequest>()
  private readonly timeoutMs: number
  private readonly requestId: () => string
  private readonly scheduleTimeout: (handler: () => void, timeoutMs: number) => TimeoutToken
  private readonly cancelTimeout: (token: TimeoutToken) => void

  constructor(
    private readonly send: (message: StopProcessListRequest) => void,
    options: StopProcessListClientOptions = {}
  ) {
    this.timeoutMs = options.timeoutMs ?? 10_000
    this.requestId = options.requestId ?? randomUUID
    this.scheduleTimeout = options.scheduleTimeout ?? setTimeout
    this.cancelTimeout = options.cancelTimeout ?? clearTimeout
  }

  request(): Promise<PItem[]> {
    const requestId = this.requestId()
    return new Promise<PItem[]>((resolve, reject) => {
      const timeout = this.scheduleTimeout(() => {
        this.pending.delete(requestId)
        reject(new Error('Stop process list request timed out after ' + this.timeoutMs + 'ms'))
      }, this.timeoutMs)
      this.pending.set(requestId, { resolve, reject, timeout })
      try {
        this.send({ type: 'stop-process-list-request', requestId })
      } catch (error) {
        this.pending.delete(requestId)
        this.cancelTimeout(timeout)
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  handleMessage(message: unknown): boolean {
    if (!isStopProcessListResponse(message)) return false
    const pending = this.pending.get(message.requestId)
    if (!pending) return true
    this.pending.delete(message.requestId)
    this.cancelTimeout(pending.timeout)
    if (message.error) {
      pending.reject(new Error(message.error))
    } else {
      pending.resolve(message.list ?? [])
    }
    return true
  }
}
```

- [ ] **Step 6: Run tests and commit**

```bash
yarn test:stop-process-list-cache
git add src/shared/StopProcessList.ts src/fork/StopProcessListClient.ts src/main/core/StopProcessListBridge.ts scripts/stop-process-list-cache-test.ts
git commit -m "feat: add stop process list IPC protocol"
```

Expected: `stop process list cache tests passed`.

### Task 3: Wire the Main/Fork UtilityProcess Channel

**Files:**

- Modify: `src/main/core/ForkManager.ts`
- Modify: `src/fork/index.ts`
- Modify: `scripts/stop-process-list-cache-test.ts`

- [ ] **Step 1: 添加 IPC wiring 静态红灯测试**

Append:

```ts
import { readFileSync } from 'node:fs'

const forkManagerSource = readFileSync('src/main/core/ForkManager.ts', 'utf8')
const forkEntrySource = readFileSync('src/fork/index.ts', 'utf8')
assert.match(forkManagerSource, /StopProcessListCache/)
assert.match(forkManagerSource, /StopProcessListBridge/)
assert.match(forkManagerSource, /stopProcessListBridge\.handle/)
assert.match(forkEntrySource, /StopProcessListClient/)
assert.match(forkEntrySource, /setStopProcessListProvider/)
assert.match(forkEntrySource, /handleMessage\(data\)/)
```

Run:

```bash
yarn test:stop-process-list-cache
```

Expected: FAIL on the first missing wiring assertion.

- [ ] **Step 2: 在 ForkManager 中创建唯一共享 cache 和 bridge**

Modify `src/main/core/ForkManager.ts` imports and manager fields:

```ts
import { StopProcessListCache } from './StopProcessListCache'
import { StopProcessListBridge } from './StopProcessListBridge'
import { fetchStopProcessListLocal } from '@shared/StopProcessList'
import { appDebugLog } from '@shared/utils'

export class ForkManager {
  file: string
  forks: Array<ForkItem> = []
  ftpsrvFork?: ForkItem
  dnsFork?: ForkItem
  ollamaChatFork?: ForkItem
  _on: Callback = () => {}
  private readonly stopProcessListCache = new StopProcessListCache(fetchStopProcessListLocal, {
    ttlMs: 350,
    onEvent: (event) => {
      appDebugLog('[StopProcessListCache]', JSON.stringify(event)).catch()
    }
  })
  private readonly stopProcessListBridge = new StopProcessListBridge(this.stopProcessListCache)

  constructor(file: string) {
    this.file = file
  }
}
```

Change `ForkItem` to accept the shared bridge and bind each child explicitly:

```ts
constructor(
  file: string,
  autoDestroy: boolean,
  private readonly stopProcessListBridge: StopProcessListBridge
) {
  this.forkFile = file
  this.autoDestroy = autoDestroy
  this.callback = {}
  this.onError = this.onError.bind(this)
  this.onExit = this.onExit.bind(this)
  this.onSpawn = this.onSpawn.bind(this)
  this.loading = true
  const child = utilityProcess.fork(file)
  this.attachChild(child)
  child.postMessage({ Server: JSON.parse(JSON.stringify(Server)) })
  this.child = child
}

private attachChild(child: UtilityProcess) {
  child.on('message', (message) => this.onMessage(child, message))
  child.on('error', this.onError)
  child.on('exit', this.onExit)
  child.on('spawn', this.onSpawn)
}

onMessage(child: UtilityProcess, message: any) {
  if (
    this.stopProcessListBridge.handle(message, (response) => {
      try {
        child.postMessage(response)
      } catch {}
    })
  ) {
    return
  }
  const { on, key, info } = message ?? {}
  if (on) {
    this._on({ key, info })
    return
  }
  const fn = this.callback?.[key]
  if (fn) {
    if (info?.code === 0 || info?.code === 1) {
      fn.resolve(info)
      delete this.callback?.[key]
      this.taskFlag.pop()
      this.waitDestroy()
    } else if (info?.code === 200) {
      fn.on(info)
    }
  }
}
```

Replace both constructor and respawn event registration with `attachChild(child)`. Pass `this.stopProcessListBridge` to every `ForkItem` constructor invocation, including ftp-srv, dns, ollama, and pool items.

- [ ] **Step 3: 在 Fork 入口注册 client 并分流响应**

Modify `src/fork/index.ts`:

```ts
import { StopProcessListClient } from './StopProcessListClient'
import { setStopProcessListProvider } from '@shared/StopProcessList'

const parentPort = process.parentPort
const stopProcessListClient = parentPort
  ? new StopProcessListClient((message) => parentPort.postMessage(message))
  : undefined

if (stopProcessListClient) {
  setStopProcessListProvider(() => stopProcessListClient.request())
}

if (parentPort) {
  if (!process.send) {
    process.send = (message: any) => {
      parentPort.postMessage(message)
      return true
    }
  }
  parentPort.on('message', (event) => {
    const data = event.data
    if (stopProcessListClient?.handleMessage(data)) return
    process.emit('message', data)
  })
}
```

Keep the existing `process.on('message')` manager initialization and command dispatch below this block unchanged.

- [ ] **Step 4: Run tests and targeted formatting**

```bash
yarn test:stop-process-list-cache
npx prettier --check src/main/core/ForkManager.ts src/fork/index.ts src/main/core/StopProcessListCache.ts src/main/core/StopProcessListBridge.ts src/fork/StopProcessListClient.ts src/shared/StopProcessList.ts scripts/stop-process-list-cache-test.ts
```

Expected: tests pass and Prettier reports all matched files use Prettier code style.

- [ ] **Step 5: Commit**

```bash
git add src/main/core/ForkManager.ts src/fork/index.ts scripts/stop-process-list-cache-test.ts
git commit -m "feat: bridge stop process lists through main"
```

### Task 4: Add Strict Local Fetch and Stop-Only Query Facade

**Files:**

- Modify: `src/shared/Process.win.ts`
- Modify: `src/shared/StopProcessList.ts`
- Modify: `scripts/stop-process-list-cache-test.ts`

- [ ] **Step 1: 添加 provider、fallback 和搜索红灯测试**

Append:

```ts
import {
  StopProcessListAccess,
  setStopProcessListProvider,
  StopProcessListFetch
} from '../src/shared/StopProcessList'

let providerCalls = 0
let localCalls = 0
const access = new StopProcessListAccess(async () => {
  localCalls += 1
  return secondList
})
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
```

Run:

```bash
yarn test:stop-process-list-cache
```

Expected: FAIL because the stop-only access class and provider functions are not implemented.

- [ ] **Step 2: 提取 Windows 严格查询入口**

Refactor `src/shared/Process.win.ts` so the current implementation becomes:

```ts
export const ProcessPidListStrict = async (): Promise<PItem[]> => {
  const useHelper = await shouldUseHelper()
  if (useHelper) {
    try {
      const content: string = (await Helper.send('tools', 'processListWin')) as any
      return normalizeWindowsProcessList(JSON5.parse(content))
    } catch (error) {
      appDebugLog('[ProcessPidList][helper-fallback]', String(error)).catch()
    }
  }

  const file = join(tmpdir(), uuid() + '.json')
    .split('\\')
    .join('/')
  try {
    const command =
      '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8;' +
      '[Console]::InputEncoding = [System.Text.Encoding]::UTF8;' +
      'Get-CimInstance Win32_Process | ' +
      'Select-Object CommandLine,ProcessId,ParentProcessId,CreationClassName | ' +
      'ConvertTo-Json | Out-File -FilePath "' +
      file +
      '" -Encoding utf8'
    await EnvSync.sync()
    await execPromiseWithEnv(command, {
      shell: EnvSync.PowerShellPath || 'powershell.exe'
    })
    return normalizeWindowsProcessList(JSON5.parse(await readFile(file, 'utf-8')))
  } finally {
    await remove(file).catch(() => {})
  }
}

export const ProcessPidList = async (): Promise<PItem[]> => {
  try {
    return await ProcessPidListStrict()
  } catch (error) {
    appDebugLog('[ProcessPidList][error]', String(error)).catch()
    return []
  }
}
```

Add private helpers in the same file:

```ts
const shouldUseHelper = async () => {
  try {
    if (Helper.enable) return true
    await AppHelperCheck()
    return true
  } catch {
    return false
  }
}

const normalizeWindowsProcessList = (parsed: any): PItem[] => {
  const list = Array.isArray(parsed) ? parsed : parsed ? [parsed] : []
  return list.map((item: any) => ({
    PID: String(item.ProcessId),
    PPID: String(item.ParentProcessId),
    USER: '',
    COMMAND: item.CommandLine ?? ''
  }))
}
```

This preserves `ProcessPidList()` callers' existing empty-list-on-error behavior while giving the main cache a strict entry that rejects.

- [ ] **Step 3: 完成停止专用访问门面**

Replace the initial `PItem` type-only import and extend `src/shared/StopProcessList.ts`:

```ts
import { appDebugLog, isWindows } from './utils'
import { ProcessListFetch, ProcessSearch, type PItem } from './Process'
import { ProcessPidListByPid, ProcessPidListStrict } from './Process.win'

export type StopProcessListProvider = () => Promise<PItem[]>

export const fetchStopProcessListLocal = (): Promise<PItem[]> =>
  isWindows() ? ProcessPidListStrict() : ProcessListFetch()

export class StopProcessListAccess {
  private provider?: StopProcessListProvider

  constructor(private readonly localFetch: () => Promise<PItem[]>) {}

  setProvider(provider?: StopProcessListProvider) {
    this.provider = provider
  }

  async fetch(): Promise<PItem[]> {
    if (this.provider) {
      try {
        return await this.provider()
      } catch (error) {
        appDebugLog('[StopProcessList][local-fallback]', String(error)).catch()
      }
    }
    return this.localFetch()
  }

  async search(search: string, caseSensitive = true): Promise<PItem[]> {
    return ProcessSearch(search, caseSensitive, await this.fetch())
  }

  async pidsByPid(pid: string | number): Promise<string[]> {
    return ProcessPidListByPid(pid, await this.fetch())
  }
}

const stopProcessListAccess = new StopProcessListAccess(fetchStopProcessListLocal)

export const setStopProcessListProvider = (provider?: StopProcessListProvider) => {
  stopProcessListAccess.setProvider(provider)
}

export const StopProcessListFetch = () => stopProcessListAccess.fetch()
export const StopProcessPidList = StopProcessListFetch
export const StopProcessListSearch = (search: string, caseSensitive = true) =>
  stopProcessListAccess.search(search, caseSensitive)
export const StopProcessPidListByPid = (pid: string | number) =>
  stopProcessListAccess.pidsByPid(pid)
```

- [ ] **Step 4: Run tests, typecheck targeted modules, and commit**

```bash
yarn test:stop-process-list-cache
npx eslint src/shared/Process.win.ts src/shared/StopProcessList.ts scripts/stop-process-list-cache-test.ts
git add src/shared/Process.win.ts src/shared/StopProcessList.ts scripts/stop-process-list-cache-test.ts
git commit -m "feat: add stop-only process list access"
```

Expected: tests pass and ESLint exits 0.

### Task 5: Migrate Only Stop-Phase Call Sites

**Files:**

- Modify: `src/fork/module/Base/index.ts`
- Modify: `src/fork/module/Php/index.ts`
- Modify: `src/fork/module/Php.win/index.ts`
- Modify: `src/fork/module/Redis/index.ts`
- Modify: `src/fork/module/Mysql/index.ts`
- Modify: `src/fork/module/Mariadb/index.ts`
- Modify: `src/fork/module/N8N/index.ts`
- Modify: `src/fork/module/Postgresql/index.ts`
- Modify: `src/fork/module/ModuleCustomer/index.ts`
- Modify: `src/fork/module/LanguageProject/index.ts`
- Modify: `src/fork/module/OpenClaw/index.ts`
- Modify: `src/fork/module/Hermes/index.ts`
- Modify: `scripts/stop-process-list-cache-test.ts`

- [ ] **Step 1: 添加停止路径与实时路径的静态红灯测试**

Append a helper and assertions:

```ts
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
```

Run:

```bash
yarn test:stop-process-list-cache
```

Expected: FAIL because stop modules still use the real-time APIs.

- [ ] **Step 2: 迁移 Base 和直接覆写的服务停止方法**

Use these replacements only inside stop methods:

```ts
import {
  StopProcessListFetch,
  StopProcessListSearch,
  StopProcessPidList
} from '@shared/StopProcessList'
```

- `Base._stopServer()`: replace both platform branches with one `plist = await StopProcessListFetch()`.
- `Php._stopServer()`: replace `ProcessListFetch()` with `StopProcessListFetch()`.
- `Php.win._stopServer()`: replace its `ProcessListSearch` call with `StopProcessListSearch('phpwebstudy.90' + version.num, false)`.
- `Redis._stopServer()`: replace only the lookup at the beginning of the stop method. Keep the `_startServer()` recovery loop on `ProcessListSearch()`.
- `Mysql._stopServer()` and `Mariadb._stopServer()` Windows branches: replace `ProcessPidList()` with `StopProcessPidList()`.
- `Mysql.stopGroupService()` Windows branch: replace `ProcessListSearch()` with `StopProcessListSearch()`. Keep the Unix targeted `ps aux` command unchanged.
- `N8N._stopServer()` Windows branch: replace the first `ProcessPidList()` with `StopProcessPidList()`. Keep the start-success `checkPid` polling on real-time APIs.
- `Postgresql._stopServer()` macOS exit polling: replace its `ProcessListFetch()` with `StopProcessListFetch()`; the one-second interval naturally exceeds the TTL.

- [ ] **Step 3: 迁移自定义服务和语言项目停止**

Use:

```ts
import { StopProcessListFetch, StopProcessPidListByPid } from '@shared/StopProcessList'
```

In `ModuleCustomer.stopService()` and `LanguageProject.stopService()`:

```ts
if (isWindows()) {
  const pids = await StopProcessPidListByPid(String(pid).trim())
  if (pids.length > 0) {
    try {
      await ProcessKill('-INT', pids)
    } catch {}
  }
  resolve({
    'APP-Service-Stop-PID': pids
  })
  return
}

const plist = await StopProcessListFetch()
const pids = ProcessPidsByPid(pid.trim(), plist)
const arr = Array.from(new Set(pids))
if (arr.length > 0) {
  try {
    await ProcessKill('-TERM', arr)
  } catch {}
  await waitTime(500)
  try {
    await ProcessKill('-INT', arr)
  } catch {}
}
resolve({
  'APP-Service-Stop-PID': arr
})
```

In `OpenClaw.stopGateway()` and `Hermes.stopGateway()`, replace the Windows/Unix branch with:

```ts
const all = await StopProcessListFetch()
```

Keep gateway start/status methods on their existing real-time queries.

- [ ] **Step 4: Remove only imports made unused by the stop migration**

Run ESLint first:

```bash
npx eslint src/fork/module/Base/index.ts src/fork/module/Php/index.ts src/fork/module/Php.win/index.ts src/fork/module/Redis/index.ts src/fork/module/Mysql/index.ts src/fork/module/Mariadb/index.ts src/fork/module/N8N/index.ts src/fork/module/Postgresql/index.ts src/fork/module/ModuleCustomer/index.ts src/fork/module/LanguageProject/index.ts src/fork/module/OpenClaw/index.ts src/fork/module/Hermes/index.ts
```

Apply these exact import cleanups:

- `Base/index.ts`: remove `ProcessListFetch` and `ProcessPidList` imports after adding `StopProcessListFetch`.
- `Php/index.ts`: remove `ProcessListFetch`.
- `Php.win/index.ts`: remove `ProcessListSearch`.
- `Redis/index.ts`: retain `ProcessListSearch` because the start recovery loop remains real-time.
- `Mysql/index.ts`: remove `ProcessPidList` and `ProcessListSearch` after both Windows stop paths move to the stop-only facade.
- `Mariadb/index.ts`: remove `ProcessPidList`.
- `N8N/index.ts`: retain `ProcessPidList`, `ProcessListFetch`, and `ProcessListSearch` because start verification still uses them.
- `Postgresql/index.ts`: remove `ProcessListFetch`.
- `ModuleCustomer/index.ts` and `LanguageProject/index.ts`: remove `ProcessListFetch` and `ProcessPidListByPid`.
- `OpenClaw/index.ts` and `Hermes/index.ts`: remove `ProcessListFetch` and `ProcessPidList`; retain `PItem`, `ProcessKill`, and `ProcessPidsByPid`.

Do not remove real-time process APIs still used by start, install, status, or tool paths in the same file.

- [ ] **Step 5: Run tests and commit**

```bash
yarn test:stop-process-list-cache
npx prettier --check src/fork/module/Base/index.ts src/fork/module/Php/index.ts src/fork/module/Php.win/index.ts src/fork/module/Redis/index.ts src/fork/module/Mysql/index.ts src/fork/module/Mariadb/index.ts src/fork/module/N8N/index.ts src/fork/module/Postgresql/index.ts src/fork/module/ModuleCustomer/index.ts src/fork/module/LanguageProject/index.ts src/fork/module/OpenClaw/index.ts src/fork/module/Hermes/index.ts
git add src/fork/module/Base/index.ts src/fork/module/Php/index.ts src/fork/module/Php.win/index.ts src/fork/module/Redis/index.ts src/fork/module/Mysql/index.ts src/fork/module/Mariadb/index.ts src/fork/module/N8N/index.ts src/fork/module/Postgresql/index.ts src/fork/module/ModuleCustomer/index.ts src/fork/module/LanguageProject/index.ts src/fork/module/OpenClaw/index.ts src/fork/module/Hermes/index.ts scripts/stop-process-list-cache-test.ts
git commit -m "perf: share process lists during service stops"
```

Expected: tests and formatting checks pass.

### Task 6: Full Verification and Manual Burst Check

**Files:**

- Modify only if verification exposes a defect in the files already listed.

- [ ] **Step 1: Run the dedicated behavioral suite**

```bash
yarn test:stop-process-list-cache
```

Expected: `stop process list cache tests passed`.

- [ ] **Step 2: Run existing related lifecycle tests**

```bash
yarn test:startup-groups
yarn test:helper:contract
```

Expected: both commands exit 0.

- [ ] **Step 3: Run targeted lint and formatting**

```bash
npx eslint src/main/core/StopProcessListCache.ts src/main/core/StopProcessListBridge.ts src/main/core/ForkManager.ts src/fork/StopProcessListClient.ts src/fork/index.ts src/shared/StopProcessList.ts src/shared/Process.win.ts scripts/stop-process-list-cache-test.ts
npx prettier --check src/main/core/StopProcessListCache.ts src/main/core/StopProcessListBridge.ts src/main/core/ForkManager.ts src/fork/StopProcessListClient.ts src/fork/index.ts src/shared/StopProcessList.ts src/shared/Process.win.ts scripts/stop-process-list-cache-test.ts
```

Expected: both commands exit 0.

- [ ] **Step 4: Run TypeScript validation**

```bash
npx vue-tsc --noEmit
```

Expected: exit 0. If unrelated pre-existing errors appear, record their exact file and diagnostic separately; do not modify unrelated files.

- [ ] **Step 5: Perform a development burst check**

Run the app:

```bash
yarn dev
```

In the UI, start a group or multi-version module that causes several services to enter their pre-stop phase close together. Confirm the debug log shows:

- one `miss` and one `fetch-success` for the first raw query;
- subsequent parallel requests reported as `join` or `hit`;
- no complete process command lines in logs;
- services still stop/start with their previous results and signals.

Stop the development process after verification.

- [ ] **Step 6: Inspect the final diff**

```bash
git status --short
git diff --check
git log -6 --oneline
```

Expected: no whitespace errors; only planned implementation files are modified by this work; the task commits are visible in order.
