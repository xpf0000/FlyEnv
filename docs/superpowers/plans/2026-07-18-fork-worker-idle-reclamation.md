# Fork Worker Idle Reclamation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reclaim idle Electron utility-process workers after 3 minutes for the primary generic worker and 10 seconds for every other eligible worker, without terminating active DNS or FTP services.

**Architecture:** Extract a deterministic idle lifecycle controller that owns task counts, pin state, and timers. Refactor `ForkItem` to use the controller and injected process/timer dependencies, keep the first generic item as the three-minute primary, and apply synchronous terminal-response hooks so DNS and FTP pin on successful start and unpin on successful stop before idle scheduling.

**Tech Stack:** TypeScript 5.8, Electron 39 utility processes, Node `EventEmitter`, `ForkPromise`, TSX scripts, Node `assert`

---

## File Structure

### New production files

- `src/main/core/ForkIdleLifecycle.ts` — pure task/pin/timer state machine and timeout constants.
- `src/main/core/ForkWorkerPolicy.ts` — pure DNS/FTP terminal-response transition policy.

### New focused tests

- `scripts/fork-idle-lifecycle-test.ts` — deterministic fake-timer contract for the state machine.
- `scripts/fork-item-idle-restart-test.ts` — fake utility-process contract for idle kill and transparent respawn.
- `scripts/fork-service-worker-policy-test.ts` — DNS/FTP pin-transition contract.

### Existing integration files

- `src/main/core/ForkManager.ts` — worker construction, pool selection, dedicated routing, broadcasts, and shutdown.
- `package.json` — focused and aggregate test commands.

## Implementation Rules

- The first generic `ForkItem` always remains the primary role and always uses 180,000 ms, even after its child is killed and respawned.
- Every additional generic item, DNS item, FTP item, and Ollama chat item uses 10,000 ms.
- Dedicated workers do not affect selection of the generic primary.
- Progress messages do not settle tasks.
- Terminal responses invoke service lifecycle hooks before the task is marked settled.
- A successful DNS/FTP start pins; a successful stop unpins; failed start/stop commands do not change pin state.
- Idle termination kills only the child process. The reusable `ForkItem` remains registered.
- Explicit application shutdown disposes lifecycle controllers and kills children immediately.
- Do not change renderer IPC commands, fork response payloads, pool CPU limit, or service implementations.

### Task 1: Add the Deterministic Idle Lifecycle Controller

**Files:**

- Create: `src/main/core/ForkIdleLifecycle.ts`
- Create: `scripts/fork-idle-lifecycle-test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the failing lifecycle test**

Create `scripts/fork-idle-lifecycle-test.ts`:

```ts
import assert from 'node:assert/strict'
import {
  ForkIdleLifecycle,
  PRIMARY_FORK_IDLE_TIMEOUT_MS,
  TRANSIENT_FORK_IDLE_TIMEOUT_MS,
  type ForkIdleScheduler
} from '../src/main/core/ForkIdleLifecycle'

type FakeTimer = {
  callback: () => void
  delayMs: number
  cleared: boolean
}

class FakeScheduler implements ForkIdleScheduler {
  timers: FakeTimer[] = []

  set(callback: () => void, delayMs: number) {
    const timer: FakeTimer = { callback, delayMs, cleared: false }
    this.timers.push(timer)
    return timer as any
  }

  clear(timer: ReturnType<typeof setTimeout>) {
    ;(timer as any as FakeTimer).cleared = true
  }

  pending() {
    return this.timers.filter((timer) => !timer.cleared)
  }

  fire(timer = this.pending()[0]) {
    assert.ok(timer, 'a pending timer must exist')
    timer.cleared = true
    timer.callback()
  }
}

{
  const scheduler = new FakeScheduler()
  let idleCalls = 0
  const lifecycle = new ForkIdleLifecycle(
    PRIMARY_FORK_IDLE_TIMEOUT_MS,
    () => {
      idleCalls += 1
    },
    scheduler
  )

  lifecycle.taskStarted()
  lifecycle.taskSettled()
  assert.equal(scheduler.pending()[0]?.delayMs, 180_000)

  lifecycle.taskStarted()
  assert.equal(scheduler.pending().length, 0, 'new work must cancel the idle timer')
  lifecycle.taskSettled()
  scheduler.fire()
  assert.equal(idleCalls, 1)
}

{
  const scheduler = new FakeScheduler()
  let idleCalls = 0
  const lifecycle = new ForkIdleLifecycle(
    TRANSIENT_FORK_IDLE_TIMEOUT_MS,
    () => {
      idleCalls += 1
    },
    scheduler
  )

  lifecycle.taskStarted()
  lifecycle.taskStarted()
  lifecycle.taskSettled()
  assert.equal(scheduler.pending().length, 0, 'one active task must keep the worker alive')
  lifecycle.taskSettled()
  assert.equal(scheduler.pending()[0]?.delayMs, 10_000)

  lifecycle.pin()
  assert.equal(scheduler.pending().length, 0)
  lifecycle.unpin()
  scheduler.fire()
  assert.equal(idleCalls, 1)
}

{
  const scheduler = new FakeScheduler()
  let idleCalls = 0
  const lifecycle = new ForkIdleLifecycle(
    TRANSIENT_FORK_IDLE_TIMEOUT_MS,
    () => {
      idleCalls += 1
    },
    scheduler
  )

  lifecycle.taskStarted()
  lifecycle.pin()
  lifecycle.taskSettled()
  assert.equal(scheduler.pending().length, 0, 'a pinned service must not be reclaimed')

  lifecycle.childExited()
  assert.equal(lifecycle.activeTaskCount, 0)
  assert.equal(lifecycle.isPinned, false)

  lifecycle.taskStarted()
  lifecycle.taskSettled()
  lifecycle.dispose()
  assert.equal(scheduler.pending().length, 0, 'explicit destroy must cancel idle timers')
  assert.equal(idleCalls, 0)
}

console.log('fork idle lifecycle tests passed')
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
npx tsx scripts/fork-idle-lifecycle-test.ts
```

Expected: FAIL with `Cannot find module '../src/main/core/ForkIdleLifecycle'`.

- [ ] **Step 3: Implement the minimal lifecycle controller**

Create `src/main/core/ForkIdleLifecycle.ts`:

```ts
export const PRIMARY_FORK_IDLE_TIMEOUT_MS = 180_000
export const TRANSIENT_FORK_IDLE_TIMEOUT_MS = 10_000

export type ForkIdleScheduler = {
  set: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>
  clear: (timer: ReturnType<typeof setTimeout>) => void
}

const defaultScheduler: ForkIdleScheduler = {
  set: (callback, delayMs) => setTimeout(callback, delayMs),
  clear: (timer) => clearTimeout(timer)
}

export class ForkIdleLifecycle {
  private activeTasks = 0
  private pinned = false
  private disposed = false
  private timer?: ReturnType<typeof setTimeout>

  constructor(
    private readonly idleTimeoutMs: number,
    private readonly onIdle: () => void,
    private readonly scheduler: ForkIdleScheduler = defaultScheduler
  ) {}

  get activeTaskCount() {
    return this.activeTasks
  }

  get isPinned() {
    return this.pinned
  }

  taskStarted() {
    if (this.disposed) return
    this.clearIdleTimer()
    this.activeTasks += 1
  }

  taskSettled() {
    if (this.disposed) return
    if (this.activeTasks > 0) this.activeTasks -= 1
    this.scheduleIfIdle()
  }

  pin() {
    if (this.disposed) return
    this.pinned = true
    this.clearIdleTimer()
  }

  unpin() {
    if (this.disposed) return
    this.pinned = false
    this.scheduleIfIdle()
  }

  childExited() {
    this.clearIdleTimer()
    this.activeTasks = 0
    this.pinned = false
  }

  dispose() {
    this.disposed = true
    this.clearIdleTimer()
    this.activeTasks = 0
    this.pinned = false
  }

  private clearIdleTimer() {
    if (!this.timer) return
    this.scheduler.clear(this.timer)
    this.timer = undefined
  }

  private scheduleIfIdle() {
    if (this.disposed || this.pinned || this.activeTasks > 0 || this.timer) return
    this.timer = this.scheduler.set(() => {
      this.timer = undefined
      if (!this.disposed && !this.pinned && this.activeTasks === 0) this.onIdle()
    }, this.idleTimeoutMs)
  }
}
```

- [ ] **Step 4: Register the focused test**

Add to `package.json`:

```json
"test:fork-idle-lifecycle": "tsx scripts/fork-idle-lifecycle-test.ts"
```

- [ ] **Step 5: Run GREEN verification**

Run:

```bash
yarn test:fork-idle-lifecycle
npx eslint src/main/core/ForkIdleLifecycle.ts scripts/fork-idle-lifecycle-test.ts
npx prettier --check src/main/core/ForkIdleLifecycle.ts scripts/fork-idle-lifecycle-test.ts package.json
```

Expected: all commands exit 0 and the test prints `fork idle lifecycle tests passed`.

- [ ] **Step 6: Commit**

```bash
git add src/main/core/ForkIdleLifecycle.ts scripts/fork-idle-lifecycle-test.ts package.json
git commit -m "test: add fork worker idle lifecycle"
```

### Task 2: Apply Role-Specific Idle Reclamation to ForkItem and the Generic Pool

**Files:**

- Create: `scripts/fork-item-idle-restart-test.ts`
- Modify: `src/main/core/ForkManager.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the failing ForkItem process test**

Create `scripts/fork-item-idle-restart-test.ts` with a fake process, fake scheduler, and inert bridge dependencies:

```ts
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { ForkItem } from '../src/main/core/ForkManager'
import {
  PRIMARY_FORK_IDLE_TIMEOUT_MS,
  TRANSIENT_FORK_IDLE_TIMEOUT_MS,
  type ForkIdleScheduler
} from '../src/main/core/ForkIdleLifecycle'

type FakeTimer = { callback: () => void; delayMs: number; cleared: boolean }

class FakeScheduler implements ForkIdleScheduler {
  timers: FakeTimer[] = []
  set(callback: () => void, delayMs: number) {
    const timer = { callback, delayMs, cleared: false }
    this.timers.push(timer)
    return timer as any
  }
  clear(timer: ReturnType<typeof setTimeout>) {
    ;(timer as any as FakeTimer).cleared = true
  }
  pending() {
    return this.timers.filter((timer) => !timer.cleared)
  }
  fire() {
    const timer = this.pending()[0]
    assert.ok(timer)
    timer.cleared = true
    timer.callback()
  }
}

class FakeChild extends EventEmitter {
  pid: number
  posts: any[] = []
  kills = 0
  constructor(pid: number) {
    super()
    this.pid = pid
  }
  postMessage(message: any) {
    this.posts.push(message)
  }
  kill() {
    this.kills += 1
  }
}

global.Server = { BaseDir: '/tmp/flyenv', Local: 'en' } as any
const bridge = { handle: () => false } as any
const scheduler = new FakeScheduler()
const children: FakeChild[] = []
const killedPids: number[] = []

const item = new ForkItem(
  '/tmp/fork.mjs',
  {
    idleTimeoutMs: PRIMARY_FORK_IDLE_TIMEOUT_MS,
    primary: true,
    idleScheduler: scheduler,
    forkProcess: () => {
      const child = new FakeChild(100 + children.length)
      children.push(child)
      return child as any
    },
    killProcess: (pid) => killedPids.push(pid)
  },
  bridge,
  bridge,
  bridge,
  () => ({ locale: 'en', messages: {} }) as any
)

const firstRequest = item.send('app', 'ping')
const firstChild = children[0]!
const firstCommand = firstChild.posts.at(-1) as any[]
firstChild.emit('message', { key: firstCommand[0], info: { code: 0, data: true } })
assert.deepEqual(await firstRequest, { code: 0, data: true })
assert.equal(item.activeTaskCount, 0)
assert.equal(item.isPrimary, true)
assert.equal(scheduler.pending()[0]?.delayMs, 180_000)

scheduler.fire()
assert.equal(firstChild.kills, 1)
assert.deepEqual(killedPids, [100])
assert.equal(item.isChildDisabled(), true)

const secondRequest = item.send('app', 'ping-again')
assert.equal(children.length, 2, 'an idle-killed child must respawn once')
const secondChild = children[1]!
const secondCommand = secondChild.posts.at(-1) as any[]
secondChild.emit('message', { key: secondCommand[0], info: { code: 0, data: 'again' } })
assert.deepEqual(await secondRequest, { code: 0, data: 'again' })
assert.equal(secondChild.posts[0]?.Server?.BaseDir, '/tmp/flyenv')

const transientScheduler = new FakeScheduler()
let transientChild!: FakeChild
const transient = new ForkItem(
  '/tmp/fork.mjs',
  {
    idleTimeoutMs: TRANSIENT_FORK_IDLE_TIMEOUT_MS,
    primary: false,
    idleScheduler: transientScheduler,
    forkProcess: () => {
      transientChild = new FakeChild(200)
      return transientChild as any
    },
    killProcess: () => {}
  },
  bridge,
  bridge,
  bridge,
  () => undefined
)
const transientRequest = transient.send('version', 'allInstalledVersions')
const transientCommand = transientChild.posts.at(-1) as any[]
transientChild.emit('message', {
  key: transientCommand[0],
  info: { code: 0, data: {} }
})
await transientRequest
assert.equal(transientScheduler.pending()[0]?.delayMs, 10_000)

const serviceScheduler = new FakeScheduler()
const serviceChild = new FakeChild(300)
const service = new ForkItem(
  '/tmp/fork.mjs',
  {
    idleTimeoutMs: TRANSIENT_FORK_IDLE_TIMEOUT_MS,
    primary: false,
    idleScheduler: serviceScheduler,
    forkProcess: () => serviceChild as any,
    killProcess: () => {}
  },
  bridge,
  bridge,
  bridge,
  () => undefined
)
const startRequest = service.sendWithTerminalHook(() => service.pin(), 'dns', 'startService')
const startCommand = serviceChild.posts.at(-1) as any[]
serviceChild.emit('message', { key: startCommand[0], info: { code: 0, data: true } })
await startRequest
assert.equal(service.isPinned, true)
assert.equal(serviceScheduler.pending().length, 0, 'successful start must suppress idle kill')

const stopRequest = service.sendWithTerminalHook(() => service.unpin(), 'dns', 'stopService')
const stopCommand = serviceChild.posts.at(-1) as any[]
serviceChild.emit('message', { key: stopCommand[0], info: { code: 0, data: true } })
await stopRequest
assert.equal(service.isPinned, false)
assert.equal(serviceScheduler.pending()[0]?.delayMs, 10_000)

console.log('fork item idle restart tests passed')
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
npx tsx scripts/fork-item-idle-restart-test.ts
```

Expected: FAIL because `ForkItem` is not exported and does not accept role, process, timer, or PID-kill dependencies.

- [ ] **Step 3: Refactor ForkItem around ForkIdleLifecycle**

In `src/main/core/ForkManager.ts`, import the lifecycle symbols:

```ts
import {
  ForkIdleLifecycle,
  PRIMARY_FORK_IDLE_TIMEOUT_MS,
  TRANSIENT_FORK_IDLE_TIMEOUT_MS,
  type ForkIdleScheduler
} from './ForkIdleLifecycle'
```

Replace the `autoDestroy`, `destroyTimer`, and `taskFlag` fields with these types and fields:

```ts
type ForkItemOptions = {
  idleTimeoutMs: number
  primary: boolean
  idleScheduler?: ForkIdleScheduler
  forkProcess?: (file: string) => UtilityProcess
  killProcess?: (pid: number) => void
}

type ForkItemCallback = {
  resolve: Callback
  on: Callback
  onTerminal?: (info: any) => void
}

export class ForkItem {
  forkFile: string
  child: UtilityProcess
  childExited = false
  pid?: number
  loading = false
  _on: Callback = () => {}
  callback: Record<string, ForkItemCallback>
  readonly isPrimary: boolean
  private readonly lifecycle: ForkIdleLifecycle
  private readonly forkProcess: (file: string) => UtilityProcess
  private readonly killProcess: (pid: number) => void

  get activeTaskCount() {
    return this.lifecycle.activeTaskCount
  }

  get isPinned() {
    return this.lifecycle.isPinned
  }

  pin() {
    this.lifecycle.pin()
  }

  unpin() {
    this.lifecycle.unpin()
  }
```

Change the constructor to accept `ForkItemOptions`, install production defaults, and create one lifecycle controller:

```ts
constructor(
  file: string,
  options: ForkItemOptions,
  private readonly envSyncBridge: EnvSyncBridge,
  private readonly stopProcessListBridge: StopProcessListBridge,
  private readonly binVersionCacheBridge: BinVersionCacheBridge,
  private readonly languageSnapshotProvider: () => LanguageRuntimePayload | undefined
) {
  this.forkFile = file
  this.isPrimary = options.primary
  this.callback = {}
  this.forkProcess = options.forkProcess ?? ((forkFile) => utilityProcess.fork(forkFile))
  this.killProcess = options.killProcess ?? ((pid) => process.kill(pid))
  this.lifecycle = new ForkIdleLifecycle(
    options.idleTimeoutMs,
    () => this.destroyChild(),
    options.idleScheduler
  )

  this.onError = this.onError.bind(this)
  this.onExit = this.onExit.bind(this)
  this.onSpawn = this.onSpawn.bind(this)

  this.loading = true
  const child = this.forkProcess(file)
  this.postInitialization(child)
  this.attachChild(child)
  this.child = child
}
```

Implement a common dispatch path so task tracking and optional terminal hooks cannot diverge:

```ts
send(...args: any[]) {
  return this.dispatch(undefined, args)
}

sendWithTerminalHook(onTerminal: (info: any) => void, ...args: any[]) {
  return this.dispatch(onTerminal, args)
}

private dispatch(onTerminal: ((info: any) => void) | undefined, args: any[]) {
  return new ForkPromise((resolve, reject, on) => {
    this.lifecycle.taskStarted()
    const thenKey = uuid()
    this.callback[thenKey] = { resolve, on, onTerminal }
    try {
      let child = this.child
      if (this.isChildDisabled()) {
        this.loading = true
        child = this.forkProcess(this.forkFile)
        this.attachChild(child)
      }
      this.postInitialization(child)
      child.postMessage([thenKey, ...args])
      this.child = child
    } catch (error) {
      delete this.callback[thenKey]
      this.lifecycle.taskSettled()
      reject(error)
    }
  })
}
```

In the terminal-response branch of `onMessage`, execute the hook before settling:

```ts
if (info?.code === 0 || info?.code === 1) {
  try {
    fn.onTerminal?.(info)
  } catch {}
  fn.resolve(info)
  delete this.callback[key]
  this.lifecycle.taskSettled()
} else if (info?.code === 200) {
  fn.on(info)
}
```

Replace the previous destroy logic with reusable idle termination and final disposal:

```ts
private destroyChild() {
  this.resolveLanguageAcks()
  this.childExited = true
  this.lifecycle.childExited()
  try {
    this.child?.kill()
  } catch {}
  try {
    const pid = this.child?.pid || this.pid
    if (pid) this.killProcess(pid)
  } catch {}
  this.pid = undefined
  this.loading = false
}

destroy() {
  this.lifecycle.dispose()
  this.destroyChild()
}
```

Update `onExit()` to reset the reusable lifecycle state:

```ts
onExit() {
  this.resolveLanguageAcks()
  this.childExited = true
  this.pid = undefined
  this.loading = false
  this.lifecycle.childExited()
}
```

Retain the existing error serialization and log write at the start of `onError()`, but replace its callback/task cleanup tail with:

```ts
for (const key of Object.keys(this.callback)) {
  this.callback[key]?.resolve({ code: 1, msg: error })
  delete this.callback[key]
}
this.lifecycle.childExited()
```

- [ ] **Step 4: Apply primary and transient roles in ForkManager**

Add a factory that passes the shared bridges and snapshot provider:

```ts
private createForkItem(idleTimeoutMs: number, primary = false) {
  return new ForkItem(
    this.file,
    { idleTimeoutMs, primary },
    this.envSyncBridge,
    this.stopProcessListBridge,
    this.binVersionCacheBridge,
    () => this.languageSnapshotProvider?.()
  )
}
```

Update the three existing dedicated construction branches so they compile before Task 3 adds service-aware hooks:

```ts
if (module === 'ftp-srv') {
  if (!this.ftpsrvFork) {
    this.ftpsrvFork = this.createForkItem(TRANSIENT_FORK_IDLE_TIMEOUT_MS)
    this.ftpsrvFork._on = this._on
  }
  return this.ftpsrvFork.send(...args)
}
if (module === 'dns') {
  if (!this.dnsFork) {
    this.dnsFork = this.createForkItem(TRANSIENT_FORK_IDLE_TIMEOUT_MS)
    this.dnsFork._on = this._on
  }
  return this.dnsFork.send(...args)
}
const fn = param.shift()
if (module === 'ollama' && ['chat', 'stopOutput'].includes(fn)) {
  if (!this.ollamaChatFork) {
    this.ollamaChatFork = this.createForkItem(TRANSIENT_FORK_IDLE_TIMEOUT_MS)
  }
  return this.ollamaChatFork.send(...args)
}
```

Construct generic workers with:

```ts
const primary = this.forks.length === 0
find = this.createForkItem(
  primary ? PRIMARY_FORK_IDLE_TIMEOUT_MS : TRANSIENT_FORK_IDLE_TIMEOUT_MS,
  primary
)
this.forks.push(find)
```

Replace pool selection based on `taskFlag` and `autoDestroy` with:

```ts
let find = this.forks.find((item) => item.activeTaskCount === 0 && item.isPrimary)
if (!find) find = this.forks.find((item) => item.activeTaskCount === 0)
```

Keep `CupCount`, rotation at the CPU cap, `_on`, language broadcasts, environment broadcasts, and `ForkManager.destroy()` behavior unchanged.

- [ ] **Step 5: Register and run GREEN verification**

Add to `package.json`:

```json
"test:fork-item-idle": "tsx scripts/fork-item-idle-restart-test.ts"
```

Run:

```bash
yarn test:fork-idle-lifecycle
yarn test:fork-item-idle
npx vue-tsc --noEmit
npx eslint src/main/core/ForkManager.ts src/main/core/ForkIdleLifecycle.ts scripts/fork-item-idle-restart-test.ts
```

Expected: all commands exit 0. The fake primary dies at 180 seconds of simulated time, the transient item schedules 10 seconds, and the next request creates exactly one replacement child.

- [ ] **Step 6: Commit**

```bash
git add src/main/core/ForkManager.ts scripts/fork-item-idle-restart-test.ts package.json
git commit -m "perf: reclaim idle generic fork workers"
```

### Task 3: Pin DNS and FTP Workers While Their Services Run

**Files:**

- Create: `src/main/core/ForkWorkerPolicy.ts`
- Create: `scripts/fork-service-worker-policy-test.ts`
- Modify: `src/main/core/ForkManager.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the failing service transition test**

Create `scripts/fork-service-worker-policy-test.ts`:

```ts
import assert from 'node:assert/strict'
import { getDedicatedServiceTransition } from '../src/main/core/ForkWorkerPolicy'

for (const module of ['dns', 'ftp-srv']) {
  assert.equal(getDedicatedServiceTransition(module, 'startService', 0), 'pin')
  assert.equal(getDedicatedServiceTransition(module, 'stopService', 0), 'unpin')
  assert.equal(getDedicatedServiceTransition(module, 'startService', 1), undefined)
  assert.equal(getDedicatedServiceTransition(module, 'stopService', 1), undefined)
  assert.equal(getDedicatedServiceTransition(module, 'initConfig', 0), undefined)
}

assert.equal(getDedicatedServiceTransition('ollama', 'startService', 0), undefined)
assert.equal(getDedicatedServiceTransition('dns', 'stopService', 200), undefined)

console.log('fork dedicated service policy tests passed')
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
npx tsx scripts/fork-service-worker-policy-test.ts
```

Expected: FAIL with `Cannot find module '../src/main/core/ForkWorkerPolicy'`.

- [ ] **Step 3: Implement the pure transition policy**

Create `src/main/core/ForkWorkerPolicy.ts`:

```ts
const dedicatedServiceModules = new Set(['dns', 'ftp-srv'])

export type DedicatedServiceTransition = 'pin' | 'unpin'

export function getDedicatedServiceTransition(
  module: string,
  command: string,
  responseCode: number
): DedicatedServiceTransition | undefined {
  if (responseCode !== 0 || !dedicatedServiceModules.has(module)) return undefined
  if (command === 'startService') return 'pin'
  if (command === 'stopService') return 'unpin'
  return undefined
}
```

- [ ] **Step 4: Wire synchronous terminal hooks into dedicated routing**

Import the policy in `ForkManager.ts` and add:

```ts
private sendDedicatedService(fork: ForkItem, module: string, args: any[]) {
  const command = args[1]
  return fork.sendWithTerminalHook((info) => {
    const transition = getDedicatedServiceTransition(module, command, info?.code)
    if (transition === 'pin') fork.pin()
    if (transition === 'unpin') fork.unpin()
  }, ...args)
}
```

Route DNS and FTP through this method:

```ts
if (module === 'ftp-srv') {
  if (!this.ftpsrvFork) {
    this.ftpsrvFork = this.createForkItem(TRANSIENT_FORK_IDLE_TIMEOUT_MS)
    this.ftpsrvFork._on = this._on
  }
  return this.sendDedicatedService(this.ftpsrvFork, module, args)
}

if (module === 'dns') {
  if (!this.dnsFork) {
    this.dnsFork = this.createForkItem(TRANSIENT_FORK_IDLE_TIMEOUT_MS)
    this.dnsFork._on = this._on
  }
  return this.sendDedicatedService(this.dnsFork, module, args)
}
```

Because the hook executes before `taskSettled()`, successful start pinning prevents a 10-second timer from surviving, and successful stop unpinning allows `taskSettled()` to schedule exactly one 10-second timer. Failure responses leave the previous pin state unchanged.

- [ ] **Step 5: Register and run GREEN verification**

Add to `package.json`:

```json
"test:fork-service-policy": "tsx scripts/fork-service-worker-policy-test.ts"
```

Run:

```bash
yarn test:fork-service-policy
yarn test:fork-item-idle
npx vue-tsc --noEmit
npx eslint src/main/core/ForkWorkerPolicy.ts src/main/core/ForkManager.ts scripts/fork-service-worker-policy-test.ts
```

Expected: all commands exit 0. DNS/FTP success transitions are exact; failures and unrelated modules return no transition.

- [ ] **Step 6: Commit**

```bash
git add src/main/core/ForkWorkerPolicy.ts scripts/fork-service-worker-policy-test.ts src/main/core/ForkManager.ts package.json
git commit -m "perf: reclaim stopped service fork workers"
```

### Task 4: Aggregate Regression, Build, and Runtime Verification

**Files:**

- Modify: `package.json`
- Verify: `src/main/core/ForkManager.ts`
- Verify: packaged/current-platform utility processes

- [ ] **Step 1: Add the aggregate test command**

Add to `package.json`:

```json
"test:fork-idle": "yarn test:fork-idle-lifecycle && yarn test:fork-item-idle && yarn test:fork-service-policy"
```

- [ ] **Step 2: Run deterministic regressions**

Run:

```bash
yarn test:fork-idle
yarn test:env-sync-coordinator
yarn test:stop-process-list-cache
yarn test:bin-version-cache
yarn test:language-fork
yarn test:main-lazy
yarn test:helper:contract
```

Expected: every command exits 0. Existing language, bridge, cache, and Helper contracts remain unchanged.

- [ ] **Step 3: Run formatting, lint, and type verification**

Run:

```bash
npx prettier --check src/main/core/ForkIdleLifecycle.ts src/main/core/ForkWorkerPolicy.ts src/main/core/ForkManager.ts scripts/fork-idle-lifecycle-test.ts scripts/fork-item-idle-restart-test.ts scripts/fork-service-worker-policy-test.ts package.json
npx eslint src/main/core/ForkIdleLifecycle.ts src/main/core/ForkWorkerPolicy.ts src/main/core/ForkManager.ts scripts/fork-idle-lifecycle-test.ts scripts/fork-item-idle-restart-test.ts scripts/fork-service-worker-policy-test.ts
npx vue-tsc --noEmit
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 4: Build production main and fork outputs**

Run the existing production-equivalent main and fork builds:

```bash
yarn clean:dev
npx esbuild main=src/main/index.ts --platform=node --bundle --packages=external --format=esm --target=esnext --splitting --outdir=dist/electron '--entry-names=[name]' '--chunk-names=chunks/[name]-[hash]' --out-extension:.js=.mjs --minify --drop:debugger --drop:console --loader:.node=file
npx esbuild src/fork/index.ts --platform=node --bundle --packages=external --format=esm --target=esnext --outfile=dist/electron/fork.mjs --minify --drop:debugger --drop:console --loader:.node=file
```

Expected: `dist/electron/main.mjs` and `dist/electron/fork.mjs` are generated with exit code 0.

- [ ] **Step 5: Perform current-platform runtime smoke**

Launch an isolated development or unpacked session without terminating a user-owned FlyEnv instance. Exercise these conditions and inspect the Node utility-process rows with `ps`, Activity Monitor, Task Manager, or Process Explorer:

```text
send one ordinary fork command -> primary worker appears
wait 15 seconds -> primary worker remains
wait until 185 seconds idle -> primary worker disappears
send another ordinary command -> one primary worker respawns and returns the response
start two concurrent ordinary commands -> an additional worker may appear
after both finish, wait 15 seconds -> additional worker disappears while primary remains
start DNS -> wait at least 15 seconds -> DNS worker remains because it is pinned
stop DNS successfully -> wait 15 seconds -> DNS worker disappears
repeat the same start/stop check for ftp-srv when available on the current platform
start and finish or cancel Ollama chat -> wait 15 seconds -> Ollama worker disappears
change language while workers are stopped -> no worker respawns
send a command after the language change -> response uses the current language snapshot
quit with active and idle workers -> all utility children exit immediately
```

Expected: observed lifetimes match the role table, running DNS/FTP services are never killed by an idle timer, stopped workers transparently respawn, and no command produces `ERR_IPC_CHANNEL_CLOSED` or `Fork manager not initialized`.

- [ ] **Step 6: Commit the aggregate command**

```bash
git add package.json
git commit -m "test: add fork worker idle regression suite"
```

- [ ] **Step 7: Final repository verification**

Run:

```bash
git status --short
git log --oneline -8
```

Expected: no unintended files are staged or modified; the lifecycle, generic-pool, dedicated-service, and aggregate-test commits are present.
