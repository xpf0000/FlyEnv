# Versioned Service Status Synchronization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make renderer service state deterministic when Electron lifecycle responses and service-status broadcasts arrive asynchronously or out of order.

**Architecture:** `ServiceProcessManager` assigns a monotonically increasing revision to every committed module status snapshot and returns the exact snapshot it broadcasts. A renderer-lifetime `ServiceStatusCoordinator` singleton rejects stale revisions, defers the newest snapshot while any installed version in that module is locally executing, and atomically applies it after execution finishes. The coordinator accepts store-owned objects as arguments and never imports Pinia, so the status metadata survives page destruction without creating a second service-running state or a store dependency cycle.

**Tech Stack:** TypeScript 5.8, Electron IPC, Vue 3 reactivity, Pinia-owned module objects, Node `assert` regression scripts, ESLint, `vue-tsc`.

---

## File structure and responsibilities

- Create `src/shared/ServiceStatus.ts`: process-status payload contracts shared by main and renderer.
- Modify `src/main/core/ServiceProcess.ts`: own per-module revisions, commit full snapshots, and return the same snapshot that is broadcast.
- Modify `src/main/core/IPCHandler.ts`: attach the committed snapshot to renderer-originated lifecycle responses.
- Create `src/render/core/ServiceStatusCoordinator.ts`: renderer-lifetime ordering metadata and deferred snapshot application; no Pinia imports.
- Modify `src/render/util/mcpServiceStatus.ts`: keep snapshot-to-installed-version mapping pure and never write the local `running` execution flag.
- Modify `src/render/util/MCP.ts`: route versioned external notifications through the coordinator and keep legacy payload compatibility.
- Modify `src/render/core/Module/ModuleInstalledItem.ts`: feed direct lifecycle snapshots to the coordinator, clear local execution ownership, then flush the newest snapshot.
- Modify `src/render/components/ServiceManager/setup.ts`: stop UI completion handlers from overwriting coordinator-owned final `run`/`pid` state.
- Modify `scripts/mcp-render-status-sync-test.ts`: cover revisions, out-of-order delivery, deferred flush, direct-response metadata, legacy compatibility, and multi-version PHP snapshots.

Implementation work must preserve unrelated dirty-worktree changes, especially `src/render/components/StartupGroup/GroupEditor.vue`, `.tmp_video_tools/`, and the existing `StartupGroupManager.ts` diagnostic log. Do not create implementation commits on the current dirty `master`; leave the implementation diff for user review.

### Task 1: Define versioned snapshots and commit them in the main process

**Files:**
- Create: `src/shared/ServiceStatus.ts`
- Modify: `src/main/core/ServiceProcess.ts`
- Test: `scripts/mcp-render-status-sync-test.ts`

- [ ] **Step 1: Write failing revision tests**

Add these imports and tests to `scripts/mcp-render-status-sync-test.ts` before changing production code:

```ts
import { ServiceProcess } from '../src/main/core/ServiceProcess'

function makeProcessItem(typeFlag: string, version: string, bin: string): any {
  return {
    typeFlag,
    version,
    bin,
    path: bin.replace(/[/\\][^/\\]+$/, ''),
    enable: true,
    source: 'Static' as const,
    num: Number(version.replace(/\D/g, '').slice(0, 3)),
    run: false,
    running: false
  }
}

function testServiceProcessRevisions() {
  const manager = new ServiceProcess()
  const emitted: any[] = []
  manager.onStatusChange((status) => emitted.push(status))

  const php82 = makeProcessItem('php', '8.2.18', 'E:/FlyEnv/php-8.2.18/php-cgi.exe')
  const php83 = makeProcessItem('php', '8.3.0', 'E:/FlyEnv/php-8.3.0/php-cgi.exe')
  const nginx = makeProcessItem('nginx', '1.29.0', 'E:/FlyEnv/nginx-1.29.0/nginx.exe')

  const phpStart = manager.addPid('php', '1001', php82)
  assert.equal(phpStart.revision, 1)
  assert.equal(phpStart.instances[0]?.pid, '1001')
  assert.strictEqual(emitted[0], phpStart, 'broadcast must receive the returned snapshot object')

  const phpSecondStart = manager.addPid('php', '1002', php83)
  assert.equal(phpSecondStart.revision, 2)
  assert.deepEqual(
    phpSecondStart.instances.map((item) => item.bin),
    [php82.bin, php83.bin]
  )

  const nginxStart = manager.addPid('nginx', '2001', nginx)
  assert.equal(nginxStart.revision, 1, 'revisions are independent per module')

  const phpStop = manager.delByBin('php', [php82.bin])
  assert.equal(phpStop.revision, 3)
  assert.deepEqual(phpStop.instances.map((item) => item.bin), [php83.bin])

  const noOpStop = manager.delPid('php', ['missing-pid'])
  assert.equal(
    noOpStop.revision,
    4,
    'a successful lifecycle mutation call must create an ordering barrier even when no PID matches'
  )

  const allStopped = manager.delAll('php')
  assert.equal(allStopped.revision, 5)
  assert.equal(allStopped.running, false)
  assert.deepEqual(allStopped.instances, [])
}
```

Call `testServiceProcessRevisions()` from `main()`.

- [ ] **Step 2: Run the test and verify it fails**

Run:

```powershell
npx tsx scripts/mcp-render-status-sync-test.ts
```

Expected: FAIL because `ServiceProcess` is not exported, mutation methods return `void`, and snapshots do not contain `revision`.

- [ ] **Step 3: Add the shared status contracts**

Create `src/shared/ServiceStatus.ts`:

```ts
export type RunningInstance = {
  bin: string
  path?: string
  version?: string | null
  pid: string
}

export type ServiceStatusItem = {
  flag: string
  revision: number
  running: boolean
  instances: RunningInstance[]
}

export function isVersionedServiceStatus(value: unknown): value is ServiceStatusItem {
  const status = value as ServiceStatusItem | undefined
  return (
    !!status &&
    typeof status.flag === 'string' &&
    Number.isInteger(status.revision) &&
    status.revision >= 0 &&
    Array.isArray(status.instances)
  )
}
```

- [ ] **Step 4: Implement per-module revisions and returned snapshots**

In `src/main/core/ServiceProcess.ts`, import the shared types, export the class for isolated tests, and replace `emitChange()` with one commit path:

```ts
import type { RunningInstance, ServiceStatusItem } from '@shared/ServiceStatus'

export class ServiceProcess {
  forkManager?: ForkManager
  servicePID: Record<string, ServiceProcessItem[]> = {}
  private revisions: Record<string, number> = {}
  private onChangeCallbacks: StatusChangeCallback[] = []

  private commit(type: string): ServiceStatusItem {
    this.revisions[type] = (this.revisions[type] ?? 0) + 1
    const status = this.statusOf(type)
    for (const cb of this.onChangeCallbacks) {
      try {
        cb(status)
      } catch (e) {
        console.log('ServiceProcess onChange callback error: ', e)
      }
    }
    return status
  }

  statusOf(type: string): ServiceStatusItem {
    const list = (this.servicePID[type] ?? []).filter((item) => !!item.pid)
    const instances: RunningInstance[] = list.map((item) => ({
      bin: item.item.bin,
      path: item.item.path,
      version: item.item.version ?? undefined,
      pid: item.pid
    }))
    return {
      flag: type,
      revision: this.revisions[type] ?? 0,
      running: instances.length > 0,
      instances
    }
  }
```

Make every visible mutation return `this.commit(type)`. Remove the early returns from delete operations so a completed stop creates a newer stopped snapshot even if the PID/bin registration was already absent:

```ts
addPid(type: string, pid: string, item: SoftInstalled): ServiceStatusItem {
  if (!this.servicePID[type]) this.servicePID[type] = []
  const bin = item?.bin
  const existing = bin ? this.servicePID[type].find((entry) => entry.item?.bin === bin) : undefined
  if (existing) {
    existing.pid = pid
    existing.item = item
  } else {
    this.servicePID[type].push({ item, pid })
  }
  return this.commit(type)
}

delPid(type: string, pid: string[]): ServiceStatusItem {
  const pids = pid.map((value) => `${value}`)
  this.servicePID[type] = (this.servicePID[type] ?? []).filter(
    (item) => !pids.includes(`${item.pid}`)
  )
  return this.commit(type)
}

delByBin(type: string, bins: string[]): ServiceStatusItem {
  this.servicePID[type] = (this.servicePID[type] ?? []).filter(
    (item) => !bins.includes(item.item?.bin)
  )
  return this.commit(type)
}

delAll(type: string): ServiceStatusItem {
  this.servicePID[type] = []
  return this.commit(type)
}
```

Keep `export default new ServiceProcess()` at the bottom so all existing callers retain the singleton.

- [ ] **Step 5: Run the revision tests**

Run:

```powershell
npx tsx scripts/mcp-render-status-sync-test.ts
```

Expected: PASS for the new revision assertions and all pre-existing status mapping assertions.

### Task 2: Put the committed snapshot on direct lifecycle responses

**Files:**
- Modify: `src/main/core/IPCHandler.ts`
- Test: `scripts/mcp-render-status-sync-test.ts`

- [ ] **Step 1: Replace the obsolete IPC ordering assertion with a failing metadata assertion**

Replace the old `addPid/delPid` source-order assertions in `scripts/mcp-render-status-sync-test.ts` with:

```ts
const ipcHandlerSource = readFileSync(
  new URL('../src/main/core/IPCHandler.ts', import.meta.url),
  'utf8'
)
assert.match(
  ipcHandlerSource,
  /serviceStatus\s*=\s*ServiceProcessManager\.addPid/
)
assert.match(
  ipcHandlerSource,
  /serviceStatus\s*=\s*ServiceProcessManager\.delPid/
)
assert.match(
  ipcHandlerSource,
  /info\.data\['APP-Service-Status'\]\s*=\s*serviceStatus/
)
assert.ok(
  ipcHandlerSource.indexOf("info.data['APP-Service-Status'] = serviceStatus") <
    ipcHandlerSource.indexOf('this.deps.windowManager.sendCommandTo(win, command, key, info)'),
  'the direct response must contain the committed snapshot before it is sent'
)
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```powershell
npx tsx scripts/mcp-render-status-sync-test.ts
```

Expected: FAIL because `IPCHandler` currently discards mutation return values and does not add `APP-Service-Status`.

- [ ] **Step 3: Attach the exact returned snapshot before sending the lifecycle response**

In `IPCHandler.handleForkCallback()`, retain one snapshot variable and attach it to the same `info.data` object:

```ts
let serviceStatus

if (info?.data?.['APP-Service-Start-PID']) {
  const item = args[1]
  serviceStatus = ServiceProcessManager.addPid(
    module,
    info.data['APP-Service-Start-PID'],
    item
  )
}

if (info?.data?.['APP-Service-Stop-PID']) {
  const arr: string[] = info.data['APP-Service-Stop-PID']
  serviceStatus = ServiceProcessManager.delPid(module, arr)
}

if (serviceStatus) {
  info.data['APP-Service-Status'] = serviceStatus
}

this.deps.windowManager.sendCommandTo(win, command, key, info)
```

Do not disable the existing `ServiceProcessManager.onStatusChange()` broadcast. The broadcast and direct response intentionally carry the same revision and may arrive in either order.

- [ ] **Step 4: Run the metadata test**

Run:

```powershell
npx tsx scripts/mcp-render-status-sync-test.ts
```

Expected: PASS, including the direct-response metadata assertions.

### Task 3: Build the renderer revision coordinator

**Files:**
- Create: `src/render/core/ServiceStatusCoordinator.ts`
- Modify: `src/render/util/mcpServiceStatus.ts`
- Test: `scripts/mcp-render-status-sync-test.ts`

- [ ] **Step 1: Write failing coordinator tests**

Add this import:

```ts
import { ServiceStatusCoordinator } from '../src/render/core/ServiceStatusCoordinator'
```

Add a snapshot helper and deterministic ordering tests:

```ts
function status(flag: string, revision: number, instances: any[]) {
  return { flag, revision, running: instances.length > 0, instances }
}

function testRendererCoordinator() {
  const coordinator = new ServiceStatusCoordinator()
  const php82 = makeInstalled('8.2.18', 'E:/FlyEnv/data/php')
  const php83 = makeInstalled('8.3.0', 'E:/FlyEnv/data/php')
  const target = { installed: [php82, php83], isOnlyRunOne: false }

  const stopped = coordinator.receive(status('php', 11, []), target)
  assert.equal(stopped.accepted, true)
  assert.equal(stopped.applied, true)
  assert.equal(php82.run, false)

  const staleStart = coordinator.receive(
    status('php', 10, [{ bin: php82.bin, pid: '24528', version: php82.version }]),
    target
  )
  assert.equal(staleStart.accepted, false)
  assert.equal(php82.run, false, 'revision 10 must not overwrite applied revision 11')

  const duplicateStop = coordinator.receive(status('php', 11, []), target)
  assert.equal(duplicateStop.accepted, false, 'duplicate revisions are idempotent')

  php82.running = true
  const externalStart = coordinator.receive(
    status('php', 12, [{ bin: php83.bin, pid: '3002', version: php83.version }]),
    target
  )
  assert.equal(externalStart.accepted, true)
  assert.equal(externalStart.applied, false)
  assert.equal(php83.run, false, 'the whole module snapshot is deferred while one version is busy')

  php82.running = false
  const flushed = coordinator.flush('php', target)
  assert.equal(flushed.applied, true)
  assert.equal(php82.run, false)
  assert.equal(php83.run, true)
  assert.equal(php83.pid, '3002')
  assert.equal(php82.running, false)
  assert.equal(php83.running, false, 'snapshot application never writes the execution flag')

  const phpMulti = coordinator.receive(
    status('php', 13, [
      { bin: php82.bin, pid: '4001', version: php82.version },
      { bin: php83.bin, pid: '4002', version: php83.version }
    ]),
    target
  )
  assert.equal(phpMulti.applied, true)
  assert.equal(php82.run, true)
  assert.equal(php83.run, true)

  const legacy = makeInstalled('1.29.0', 'E:/FlyEnv/data/nginx')
  const legacyResult = coordinator.receive(
    { flag: 'nginx', running: true, instances: [{ bin: legacy.bin, pid: '5001' }] } as any,
    { installed: [legacy], isOnlyRunOne: true }
  )
  assert.equal(legacyResult.applied, true)
  assert.equal(legacy.run, true, 'unversioned initialization/older notifications remain compatible')
}
```

Call `testRendererCoordinator()` from `main()`.

- [ ] **Step 2: Run the test and verify it fails**

Run:

```powershell
npx tsx scripts/mcp-render-status-sync-test.ts
```

Expected: FAIL because `ServiceStatusCoordinator` does not exist.

- [ ] **Step 3: Make snapshot mapping preserve local execution ownership**

In `src/render/util/mcpServiceStatus.ts`, export the structural types for the coordinator and remove all assignments to `item.running`:

```ts
export type RunningInstanceLike = {
  bin?: string
  path?: string
  version?: string | null
  pid?: string
}

export type CurrentVersionLike = {
  version?: string | null
  bin?: string
  path?: string
}

export type InstalledVersionLike = CurrentVersionLike & {
  pid?: string
  run?: boolean
  running?: boolean
}

export type ServiceStatusApplyTarget = {
  current?: CurrentVersionLike
  installed: InstalledVersionLike[]
  isOnlyRunOne?: boolean
}
```

Keep the legacy per-item busy guard, but update only `run` and `pid`:

```ts
installed.forEach((item) => {
  if (item.running) return
  const hit = item.bin ? runningByBin.get(item.bin) : undefined
  if (hit) {
    item.run = true
    item.pid = hit.pid ? `${hit.pid}` : item.pid
  } else {
    item.run = false
    item.pid = ''
  }
})
```

- [ ] **Step 4: Implement the pure coordinator class and reactive singleton**

Create `src/render/core/ServiceStatusCoordinator.ts`:

```ts
import type { ServiceStatusItem } from '@shared/ServiceStatus'
import { isVersionedServiceStatus } from '@shared/ServiceStatus'
import { reactiveBind } from '@/util/Index'
import {
  syncServiceStatusFromMcp,
  type CurrentVersionLike,
  type ServiceStatusApplyTarget
} from '@/util/mcpServiceStatus'

type ModuleStatusRecord = {
  latestRevision: number
  appliedRevision: number
  latestSnapshot?: ServiceStatusItem
}

export type ServiceStatusApplyResult = {
  accepted: boolean
  applied: boolean
  nextCurrent?: CurrentVersionLike
}

export class ServiceStatusCoordinator {
  modules: Record<string, ModuleStatusRecord> = {}

  private record(flag: string) {
    if (!this.modules[flag]) {
      this.modules[flag] = { latestRevision: -1, appliedRevision: -1 }
    }
    return this.modules[flag]
  }

  receive(status: unknown, target: ServiceStatusApplyTarget): ServiceStatusApplyResult {
    if (!isVersionedServiceStatus(status)) {
      const legacy = status as { instances?: any[] }
      return {
        accepted: true,
        applied: true,
        nextCurrent: syncServiceStatusFromMcp({
          ...target,
          instances: legacy?.instances ?? []
        })
      }
    }

    const record = this.record(status.flag)
    if (status.revision <= record.latestRevision) {
      return { accepted: false, applied: false, nextCurrent: target.current }
    }
    record.latestRevision = status.revision
    record.latestSnapshot = status
    return this.flush(status.flag, target, true)
  }

  flush(
    flag: string,
    target: ServiceStatusApplyTarget,
    accepted = false
  ): ServiceStatusApplyResult {
    const record = this.record(flag)
    const snapshot = record.latestSnapshot
    if (
      target.installed.some((item) => item.running) ||
      !snapshot ||
      snapshot.revision <= record.appliedRevision
    ) {
      return { accepted, applied: false, nextCurrent: target.current }
    }

    const nextCurrent = syncServiceStatusFromMcp({
      ...target,
      instances: snapshot.instances
    })
    record.appliedRevision = snapshot.revision
    return { accepted, applied: true, nextCurrent }
  }
}

export default reactiveBind(new ServiceStatusCoordinator())
```

The class stores only revision/snapshot ordering metadata. The actual running state remains on the existing installed version objects owned by `BrewStore`.

- [ ] **Step 5: Run coordinator tests**

Run:

```powershell
npx tsx scripts/mcp-render-status-sync-test.ts
```

Expected: PASS for stale, duplicate, deferred, flush, PHP multi-version, and legacy cases.

### Task 4: Route broadcasts and direct lifecycle responses through the coordinator

**Files:**
- Modify: `src/render/util/MCP.ts`
- Modify: `src/render/core/Module/ModuleInstalledItem.ts`
- Test: `scripts/mcp-render-status-sync-test.ts`

- [ ] **Step 1: Add failing source-contract assertions for both renderer entry points**

Add these assertions to `scripts/mcp-render-status-sync-test.ts`:

```ts
const mcpSource = readFileSync(new URL('../src/render/util/MCP.ts', import.meta.url), 'utf8')
assert.match(mcpSource, /ServiceStatusCoordinator\.receive\(res,/)

const installedItemSource = readFileSync(
  new URL('../src/render/core/Module/ModuleInstalledItem.ts', import.meta.url),
  'utf8'
)
assert.match(installedItemSource, /\['APP-Service-Status'\]/)
assert.match(installedItemSource, /ServiceStatusCoordinator\.receive/)
assert.match(installedItemSource, /ServiceStatusCoordinator\.flush/)
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```powershell
npx tsx scripts/mcp-render-status-sync-test.ts
```

Expected: FAIL because notifications and lifecycle callbacks still call/write state directly.

- [ ] **Step 3: Route service-status broadcasts through the singleton**

In `src/render/util/MCP.ts`, import the singleton as `ServiceStatusCoordinator`. Replace the direct `syncServiceStatusFromMcp()` call with:

```ts
const result = ServiceStatusCoordinator.receive(res, {
  current,
  installed: module.installed,
  isOnlyRunOne: module.isOnlyRunOne
})
const nextCurrent = result.nextCurrent
if (
  result.applied &&
  nextCurrent &&
  (current?.version !== nextCurrent.version ||
    current?.path !== nextCurrent.path ||
    current?.bin !== nextCurrent.bin)
) {
  appStore.UPDATE_SERVER_CURRENT({
    flag,
    data: JSON.parse(JSON.stringify(nextCurrent))
  })
}
```

Keep the exported `applyServiceStatusChangeFromMcp` alias for callers/tests that use the pure legacy mapping helper.

- [ ] **Step 4: Add lifecycle status helpers without importing the coordinator into Pinia**

In `ModuleInstalledItem`, import the shared status type and coordinator. Add methods that build the target from the already imported `BrewStore` and update current only after an applied snapshot:

```ts
import type { ServiceStatusItem } from '@shared/ServiceStatus'
import ServiceStatusCoordinator, {
  type ServiceStatusApplyResult
} from '@/core/ServiceStatusCoordinator'

private statusTarget() {
  const brewStore = BrewStore()
  const module = brewStore.module(this.typeFlag)
  const appStore = AppStore()
  return {
    target: {
      current: appStore.config.server?.[this.typeFlag]?.current,
      installed: module.installed.includes(this) ? module.installed : [this],
      isOnlyRunOne: module.isOnlyRunOne
    },
    appStore
  }
}

private applyStatusResult(result: ServiceStatusApplyResult) {
  if (!result.applied || !result.nextCurrent) return
  const { appStore } = this.statusTarget()
  const current = appStore.config.server?.[this.typeFlag]?.current
  const next = result.nextCurrent
  if (
    current?.version === next.version &&
    current?.path === next.path &&
    current?.bin === next.bin
  ) return
  appStore.UPDATE_SERVER_CURRENT({
    flag: this.typeFlag,
    data: JSON.parse(JSON.stringify(next))
  })
}

private receiveLifecycleStatus(res: any): ServiceStatusItem | undefined {
  const status = res?.data?.['APP-Service-Status'] as ServiceStatusItem | undefined
  if (!status) return undefined
  const { target } = this.statusTarget()
  this.applyStatusResult(ServiceStatusCoordinator.receive(status, target))
  return status
}

private flushLifecycleStatus() {
  const { target } = this.statusTarget()
  this.applyStatusResult(ServiceStatusCoordinator.flush(this.typeFlag, target))
}
```

This does not add a coordinator-to-store dependency: `ModuleInstalledItem` already owns the lifecycle and already imports both stores.

- [ ] **Step 5: Make terminal start handling snapshot-first and fallback-safe**

For terminal `res.code === 0` in `start()`, retain the direct result fallback only when no committed snapshot exists:

```ts
const status = this.receiveLifecycleStatus(res)
if (!status) {
  this.pid = res?.data?.['APP-Service-Start-PID'] ?? ''
  this.run = true
}
this.running = false
this.flushLifecycleStatus()
resolve(true)
```

For `res.code === 1`, keep existing error collection and local fallback fields, then clear execution ownership and flush any newer external snapshot:

```ts
error.push(res.msg)
this.pid = ''
this.run = false
this.running = false
this.flushLifecycleStatus()
resolve(error.join('\n'))
```

For a `startExtParam` failure, also call `flushLifecycleStatus()` immediately after `this.running = false`.

- [ ] **Step 6: Make terminal stop handling use the same snapshot protocol**

Change the stop callback to receive `res`:

```ts
).then((key: string, res: any) => {
  IPC.off(key)
  const status = this.receiveLifecycleStatus(res)
  if (!status) {
    this.run = false
    this.pid = ''
  }
  this.running = false
  this.flushLifecycleStatus()
  resolve(true)
})
```

For a `stopExtParam` failure, clear `running` and flush pending status before resolving.

- [ ] **Step 7: Ensure the direct-response snapshot and duplicate broadcast converge**

Run:

```powershell
npx tsx scripts/mcp-render-status-sync-test.ts
```

Expected: PASS. Whether the direct response or broadcast arrives first, one revision is accepted, the duplicate is ignored, and the accepted snapshot flushes when `running` becomes false.

### Task 5: Remove completion-layer stale state writers

**Files:**
- Modify: `src/render/core/Module/ModuleInstalledItem.ts`
- Modify: `src/render/components/ServiceManager/setup.ts`
- Test: `scripts/mcp-render-status-sync-test.ts`

- [ ] **Step 1: Add failing assertions that completion wrappers no longer force final run state**

Add source checks scoped to the completion blocks:

```ts
assert.doesNotMatch(
  installedItemSource,
  /action\.then\([\s\S]*?this\.run\s*=\s*(?:true|false)[\s\S]*?resolve\(true\)/,
  'ModuleInstalledItem.serviceDo must not overwrite a newer committed snapshot'
)

const serviceManagerSetupSource = readFileSync(
  new URL('../src/render/components/ServiceManager/setup.ts', import.meta.url),
  'utf8'
)
assert.doesNotMatch(
  serviceManagerSetupSource,
  /action\.then\([\s\S]*?item\.run\s*=\s*(?:true|false)/,
  'ServiceManager completion must leave final service state to lifecycle/coordinator code'
)
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```powershell
npx tsx scripts/mcp-render-status-sync-test.ts
```

Expected: FAIL because both completion wrappers currently write `run` after the asynchronous lifecycle has already settled.

- [ ] **Step 3: Simplify `ModuleInstalledItem.serviceDo()`**

Keep error display and successful completion, but remove every `this.run = ...` and `this.running = ...` assignment from `action.then()`. The lifecycle methods and coordinator now own those fields:

```ts
action.then((res: any) => {
  if (typeof res === 'string') {
    MessageError(res)
  }
  resolve(true)
})
```

Current-version selection remains handled by `onItemStart()` for local single-instance starts and by applied snapshots for external/newer state.

- [ ] **Step 4: Simplify `ServiceManager/setup.ts` completion handling**

Keep MySQL group side effects and error display, but remove writes to `currentVersion.value.run`, `currentVersion.value.running`, `item.run`, and `item.running`. Remove the completion block's current-version persistence as well: local single-instance starts already select current in `onItemStart()`, while external/newer snapshots select it when the coordinator applies them.

```ts
action.then((res: any) => {
  if (typeof res === 'string') {
    MessageError(res)
    return
  }
  if (typeFlag === 'mysql') {
    const mysqlStore = MysqlStore()
    if (flag === 'stop') {
      mysqlStore.groupStop().then()
    } else {
      mysqlStore.groupStart().then()
    }
  }
})
```

- [ ] **Step 5: Run the stale-writer regression tests**

Run:

```powershell
npx tsx scripts/mcp-render-status-sync-test.ts
```

Expected: PASS with no lifecycle completion wrapper able to restore an obsolete `run=true` or clear a newer external state.

### Task 6: Run focused and full verification

**Files:**
- Verify all files changed in Tasks 1-5

- [ ] **Step 1: Run the dedicated synchronization regression**

```powershell
npx tsx scripts/mcp-render-status-sync-test.ts
```

Expected: `mcp render status sync tests passed`.

- [ ] **Step 2: Run startup-group regressions**

```powershell
yarn test:startup-groups
```

Expected: all startup-group tests pass, including exact-target removal, reverse stop order, and switch-state assertions.

- [ ] **Step 3: Run targeted ESLint**

```powershell
npx eslint src/shared/ServiceStatus.ts src/main/core/ServiceProcess.ts src/main/core/IPCHandler.ts src/render/core/ServiceStatusCoordinator.ts src/render/util/mcpServiceStatus.ts src/render/util/MCP.ts src/render/core/Module/ModuleInstalledItem.ts src/render/components/ServiceManager/setup.ts scripts/mcp-render-status-sync-test.ts
```

Expected: exit code 0 with no lint or Prettier errors.

- [ ] **Step 4: Run TypeScript validation**

```powershell
npx vue-tsc --noEmit
```

Expected: exit code 0. If the repository has unrelated pre-existing errors, record their exact file/line output and verify none originate in the files above.

- [ ] **Step 5: Check patch integrity**

```powershell
git diff --check
git status --short
```

Expected: no whitespace errors. Confirm unrelated dirty files remain untouched and no generated files were added.

- [ ] **Step 6: Manual Electron race verification**

Run FlyEnv in development, open a startup group containing PHP-FPM, and perform:

1. Start PHP-FPM, then immediately stop it from the startup-group card.
2. Confirm the version stays stopped and does not show the sequence stopped → running → stopped.
3. Repeat while triggering an MCP start/stop for the same PHP version.
4. Confirm the UI ends at the highest committed revision regardless of notification arrival order.
5. Start two PHP versions if the module permits it and confirm both instances match the latest complete module snapshot.

Expected: `running` is true only while a local command is executing; after completion, `run` and `pid` match the newest main-process snapshot.
