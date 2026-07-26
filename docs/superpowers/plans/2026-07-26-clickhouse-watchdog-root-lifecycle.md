# ClickHouse Watchdog Root Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make ClickHouse use its watchdog root as the managed process, so version switching, stopping, main-process status, and the selected `current` version stay consistent with other single-instance services.

**Architecture:** Keep the common single-instance workflow unchanged: the renderer selects the requested version first and closes the other version before starting it. ClickHouse adds only a process-model adapter: a root is trusted when it is either the exact version binary or a `clickhouse-watchdog` whose descendant is that exact binary. The fork returns only validated roots for signal-based cleanup; untrusted saved PIDs produce a bin-specific deregistration request. The main process applies every deregistration before adding a replacement root, and renderer broadcasts never replace `current` during a local lifecycle operation.

**Tech Stack:** Electron main/fork processes, TypeScript, Vue 3/Pinia renderer status synchronisation, Node `assert` regression scripts.

---

## File structure

| File | Responsibility |
| --- | --- |
| `src/shared/Process.ts` | Pure, reusable validation of a direct service root or a named watchdog whose descendant has an exact owned marker. |
| `src/fork/module/ClickHouse/index.ts` | Resolves the spawned watchdog root, stops validated ClickHouse root trees, and emits bin-specific stale-registration cleanup. |
| `src/main/core/IPCHandler.ts` | Removes stale ClickHouse registration by exact `bin` before a replacement PID is added. |
| `src/main/core/MCPTools.ts` | Uses the same stale-bin-before-add ordering for MCP lifecycle calls. |
| `src/render/util/mcpServiceStatus.ts` | Preserves the locally selected `current` while a local row is starting or stopping. |
| `scripts/clickhouse-service-lifecycle-test.ts` | Covers watchdog ownership, stale PID safety, start PID handoff, and IPC cleanup ordering. |
| `scripts/mcp-render-status-sync-test.ts` | Covers the renderer replacement race while the previous row is stopping. |

### Task 1: Add a testable watchdog ownership primitive

**Files:**

- Modify: `scripts/clickhouse-service-lifecycle-test.ts`
- Modify: `src/shared/Process.ts:162-192`

- [ ] **Step 1: Write the failing ownership regression tests**

Add these imports and assertions to `scripts/clickhouse-service-lifecycle-test.ts` before its final `console.log`:

```ts
import type { PItem } from '../src/shared/Process'
import { ProcessOwnedPidsByPidOrDescendant } from '../src/shared/Process'

const bin = '/tmp/flyenv/app/clickhouse-26.7/clickhouse'
const processList: PItem[] = [
  { PID: '100', PPID: '1', USER: 'x', COMMAND: 'clickhouse-watchdog' },
  { PID: '101', PPID: '100', USER: 'x', COMMAND: `${bin} server` },
  { PID: '200', PPID: '1', USER: 'x', COMMAND: 'clickhouse-watchdog' },
  { PID: '201', PPID: '200', USER: 'x', COMMAND: '/tmp/other/clickhouse server' },
  {
    PID: '300',
    PPID: '1',
    USER: 'x',
    COMMAND: '/Applications/FlyEnv.app/Contents/MacOS/FlyEnv --type=renderer'
  },
  { PID: '301', PPID: '300', USER: 'x', COMMAND: `${bin} server` }
]

assert.deepEqual(
  ProcessOwnedPidsByPidOrDescendant('100', processList, [bin], ['clickhouse-watchdog']),
  ['100', '101'],
  'a ClickHouse watchdog is owned only when its descendant runs the exact requested binary'
)
assert.deepEqual(
  ProcessOwnedPidsByPidOrDescendant('200', processList, [bin], ['clickhouse-watchdog']),
  [],
  'a watchdog for another ClickHouse binary must not be signalled'
)
assert.deepEqual(
  ProcessOwnedPidsByPidOrDescendant('300', processList, [bin], ['clickhouse-watchdog']),
  [],
  'a reused Electron renderer PID must never become owned through its descendants'
)
```

- [ ] **Step 2: Run the focused test and observe the expected failure**

Run: `yarn test:clickhouse-service-lifecycle`

Expected: TypeScript import failure because `ProcessOwnedPidsByPidOrDescendant` does not exist.

- [ ] **Step 3: Implement the minimal ownership helper**

Add this export after `ProcessOwnedPidsByPid` in `src/shared/Process.ts`:

```ts
/**
 * Accept either an exact service root, or a known watchdog root whose descendant
 * command contains an exact owned marker. The latter is needed for ClickHouse,
 * whose managed root is `clickhouse-watchdog` rather than the version binary.
 */
export const ProcessOwnedPidsByPidOrDescendant = (
  pid: string,
  arr: PItem[],
  ownedMarkers: Array<string | null | undefined>,
  watchdogMarkers: Array<string | null | undefined>
): string[] => {
  const tree = ProcessListByExactPid(pid, arr)
  if (tree.length === 0) {
    return []
  }
  const rootPid = `${pid}`.trim()
  const root = tree.find((item) => item.PID === rootPid)
  const rootCommand = root?.COMMAND ?? ''
  if (!rootCommand || ProcessCommandLooksLikeElectronChild(rootCommand)) {
    return []
  }
  const markers = ownedMarkers
    .map((marker) => `${marker ?? ''}`.trim())
    .filter(Boolean)
  const watchdogs = watchdogMarkers
    .map((marker) => `${marker ?? ''}`.trim())
    .filter(Boolean)
  if (markers.length === 0) {
    return []
  }
  if (markers.some((marker) => rootCommand.includes(marker))) {
    return tree.map((item) => item.PID)
  }
  if (!watchdogs.some((marker) => rootCommand.includes(marker))) {
    return []
  }
  if (!tree.some((item) => item.PID !== rootPid && markers.some((marker) => item.COMMAND.includes(marker)))) {
    return []
  }
  return tree.map((item) => item.PID)
}
```

- [ ] **Step 4: Run the focused regression test and confirm it passes**

Run: `yarn test:clickhouse-service-lifecycle`

Expected: exit code 0 and `clickhouse service lifecycle tests passed`.

- [ ] **Step 5: Commit the ownership primitive and its test**

```bash
git add src/shared/Process.ts scripts/clickhouse-service-lifecycle-test.ts
git commit -m "test: cover ClickHouse watchdog ownership"
```

### Task 2: Manage ClickHouse by the validated watchdog root

**Files:**

- Modify: `scripts/clickhouse-service-lifecycle-test.ts`
- Modify: `src/fork/module/ClickHouse/index.ts:29,209-317,463-490`

- [ ] **Step 1: Extend the lifecycle regression test before changing production code**

Replace the existing direct-stop source assertion with these assertions:

```ts
assert.match(
  directStopSource,
  /ProcessOwnedPidsByPidOrDescendant\(pid, plist, \[version\.bin\], \['clickhouse-watchdog'\]\)/,
  'direct ClickHouse stop must validate a watchdog through its exact version-binary descendant'
)
assert.match(
  directStopSource,
  /'APP-Service-Stale-Bins': staleBins/,
  'untrusted saved PIDs must request bin-specific deregistration instead of PID deregistration'
)
assert.match(
  source,
  /const managedPid = await this\.managedClickHousePid\(spawnedPid, version\)/,
  'the PID handed to main must be the validated stable ClickHouse root'
)
assert.match(source, /await writeFile\(this\.versionPidFile\(version\), managedPid\)/)
assert.doesNotMatch(
  directStopSource,
  /ProcessOwnedPidsByPid\(pid, plist, \[version\.bin\]\)/,
  'the old root-command-only check cannot validate a watchdog'
)
```

- [ ] **Step 2: Run the focused test and observe the expected failure**

Run: `yarn test:clickhouse-service-lifecycle`

Expected: assertion failure because the ClickHouse module still calls `ProcessOwnedPidsByPid` and returns the raw spawned PID.

- [ ] **Step 3: Implement root validation and safe stale-PID handling**

Update the process import in `src/fork/module/ClickHouse/index.ts`:

```ts
import {
  ProcessKill,
  ProcessListFetch,
  ProcessOwnedPidsByPidOrDescendant
} from '@shared/Process'
```

Add this method above `_stopServer`:

```ts
private async managedClickHousePid(pid: string, version: SoftInstalled): Promise<string> {
  const plist = await ProcessListFetch()
  const owned = ProcessOwnedPidsByPidOrDescendant(pid, plist, [version.bin], [
    'clickhouse-watchdog'
  ])
  return owned.length > 0 ? `${pid}` : ''
}
```

In `_startServer`, replace its raw-PID handoff with the validated root handoff:

```ts
const spawnedPid = `${res['APP-Service-Start-PID']}`.trim().split('\n').shift()!.trim()
const managedPid = await this.managedClickHousePid(spawnedPid, version)
if (!managedPid) {
  throw new Error(I18nT('fork.startFail'))
}
await writeFile(this.versionPidFile(version), managedPid)
on({
  'APP-On-Log': AppLog('info', I18nT('appLog.startServiceSuccess', { pid: managedPid }))
})
resolve({ 'APP-Service-Start-PID': managedPid })
```

In `_stopServer`, for each candidate PID use the new helper and collect untrusted candidates:

```ts
const staleBins = new Set<string>()
const candidates = Array.from(new Set([versionPid, legacyPid, `${version.pid ?? ''}`].filter(Boolean)))
for (const pid of candidates) {
  const ownedPids = ProcessOwnedPidsByPidOrDescendant(pid, plist, [version.bin], [
    'clickhouse-watchdog'
  ])
  if (ownedPids.length === 0) {
    staleBins.add(version.bin)
    continue
  }
  if (pid === legacyPid) {
    legacyPids = ownedPids
  }
  ownedPids.forEach((ownedPid) => pids.add(ownedPid))
}
```

Leave `ProcessKill('-INT', arr)` guarded by `arr.length > 0`; remove the version PID file regardless of the result. Return only actually validated/signalled PIDs plus the bin-specific cleanup request:

```ts
resolve({
  'APP-Service-Stop-PID': Array.from(new Set(arr)),
  'APP-Service-Stale-Bins': Array.from(staleBins)
})
```

When `startService` forwards `_stopAllServers` results into the start response, also forward `APP-Service-Stale-Bins`, so the main process removes old registration before it adds the new root.

- [ ] **Step 4: Run the focused test and confirm it passes**

Run: `yarn test:clickhouse-service-lifecycle`

Expected: exit code 0 and all watchdog/stale-PID assertions pass.

- [ ] **Step 5: Commit the ClickHouse watchdog lifecycle**

```bash
git add src/fork/module/ClickHouse/index.ts scripts/clickhouse-service-lifecycle-test.ts
git commit -m "fix: manage ClickHouse watchdog roots"
```

### Task 3: Remove stale registration by exact binary before registering a replacement

**Files:**

- Modify: `scripts/clickhouse-service-lifecycle-test.ts`
- Modify: `src/main/core/IPCHandler.ts:225-235`
- Modify: `src/main/core/MCPTools.ts:551-560`

- [ ] **Step 1: Write the ordering regression assertions**

Append these checks to `scripts/clickhouse-service-lifecycle-test.ts`:

```ts
const ipcHandlerSource = readFileSync(
  new URL('../src/main/core/IPCHandler.ts', import.meta.url),
  'utf8'
)
const staleBinCleanup = ipcHandlerSource.indexOf('APP-Service-Stale-Bins')
const startPidRegistration = ipcHandlerSource.indexOf('ServiceProcessManager.addPid')
assert.ok(staleBinCleanup >= 0, 'IPC must recognise ClickHouse stale-bin cleanup')
assert.ok(
  ipcHandlerSource.indexOf('ServiceProcessManager.delByBin', staleBinCleanup) > staleBinCleanup,
  'stale cleanup must delete by exact bin'
)
assert.ok(
  staleBinCleanup < startPidRegistration,
  'stale registration must be deleted before a replacement PID is added'
)

const mcpToolsSource = readFileSync(new URL('../src/main/core/MCPTools.ts', import.meta.url), 'utf8')
const mcpStart = mcpToolsSource.indexOf('async startService(flag: string, version?: string)')
const mcpStartEnd = mcpToolsSource.indexOf('async stopService(flag: string, version?: string)')
const mcpStartSource = mcpToolsSource.slice(mcpStart, mcpStartEnd)
assert.match(mcpStartSource, /APP-Service-Stale-Bins/)
assert.ok(
  mcpStartSource.indexOf('ServiceProcessManager.delByBin') <
    mcpStartSource.indexOf('ServiceProcessManager.addPid'),
  'MCP replacement must also remove stale registrations before adding a PID'
)
```

- [ ] **Step 2: Run the focused test and observe the expected failure**

Run: `yarn test:clickhouse-service-lifecycle`

Expected: assertion failure because neither lifecycle entry point recognises `APP-Service-Stale-Bins`.

- [ ] **Step 3: Implement the exact-bin cleanup in both lifecycle entry points**

Between the existing `APP-Service-Stop-PID` block and the start-PID block in `src/main/core/IPCHandler.ts`, add:

```ts
if (info?.data?.['APP-Service-Stale-Bins']) {
  const bins: string[] = info.data['APP-Service-Stale-Bins']
  ServiceProcessManager.delByBin(module, bins)
}
```

Immediately after `stoppedPids` handling and before `const pid = ...` in `MCPTools.startService`, add:

```ts
const staleBins: string[] = data?.['APP-Service-Stale-Bins'] ?? []
if (staleBins.length > 0) {
  ServiceProcessManager.delByBin(flag, staleBins)
}
```

- [ ] **Step 4: Run the focused test and confirm it passes**

Run: `yarn test:clickhouse-service-lifecycle`

Expected: exit code 0 and cleanup ordering assertions pass.

- [ ] **Step 5: Commit main-process registry cleanup**

```bash
git add src/main/core/IPCHandler.ts src/main/core/MCPTools.ts scripts/clickhouse-service-lifecycle-test.ts
git commit -m "fix: clear stale ClickHouse process registrations"
```

### Task 4: Keep `current` stable during an in-flight version replacement

**Files:**

- Modify: `scripts/mcp-render-status-sync-test.ts`
- Modify: `src/render/util/mcpServiceStatus.ts:34-54`

- [ ] **Step 1: Write the failing replacement-race regression test**

Add this test before the IPC source assertions in `scripts/mcp-render-status-sync-test.ts`:

```ts
const oldVersion = makeInstalled('26.6.0', 'E:/FlyEnv/data/app')
oldVersion.running = true
const selectedVersion = makeInstalled('26.7.0', 'E:/FlyEnv/data/app')
const selectedCurrent = { ...selectedVersion }

const currentDuringReplacement = syncServiceStatusFromMcp({
  current: selectedCurrent,
  installed: [oldVersion, selectedVersion],
  isOnlyRunOne: true,
  instances: [
    {
      bin: oldVersion.bin,
      path: oldVersion.path,
      version: oldVersion.version,
      pid: '2606'
    }
  ]
})

assert.equal(
  currentDuringReplacement?.bin,
  selectedVersion.bin,
  'a status broadcast for the stopping version must not overwrite the locally selected version'
)
assert.equal(oldVersion.run, false, 'the stopping row remains lifecycle-owned even when main reports it')
```

- [ ] **Step 2: Run the test and observe the expected failure**

Run: `npx tsx scripts/mcp-render-status-sync-test.ts`

Expected: assertion failure because the one running broadcast replaces `current` with `oldVersion`.

- [ ] **Step 3: Preserve current when any local lifecycle operation is in progress**

In `syncServiceStatusFromMcp`, insert this guard immediately before the existing `if (!isOnlyRunOne || instances.length !== 1)` check:

```ts
if (installed.some((item) => item.running)) {
  return current
}
```

The existing per-row `if (item.running) return` remains unchanged, allowing status broadcasts to update idle rows without overriding a locally starting/stopping row.

- [ ] **Step 4: Run both renderer and ClickHouse regression scripts**

Run: `yarn test:clickhouse-service-lifecycle && npx tsx scripts/mcp-render-status-sync-test.ts`

Expected: both scripts exit code 0 and print their success messages.

- [ ] **Step 5: Commit renderer race protection**

```bash
git add src/render/util/mcpServiceStatus.ts scripts/mcp-render-status-sync-test.ts
git commit -m "fix: preserve current during service replacement"
```

### Task 5: Full verification and review

**Files:**

- Verify: all files above

- [ ] **Step 1: Inspect the final diff for unintended scope**

Run: `git diff --check HEAD~4..HEAD && git status --short`

Expected: no whitespace errors; only the ClickHouse watchdog lifecycle files and their regression scripts are changed/committed.

- [ ] **Step 2: Run focused static and type checks**

Run: `yarn eslint src/shared/Process.ts src/fork/module/ClickHouse/index.ts src/main/core/IPCHandler.ts src/main/core/MCPTools.ts src/render/util/mcpServiceStatus.ts scripts/clickhouse-service-lifecycle-test.ts scripts/mcp-render-status-sync-test.ts && yarn vue-tsc --noEmit`

Expected: exit code 0.

- [ ] **Step 3: Re-run regression coverage from a clean command**

Run: `yarn test:clickhouse-service-lifecycle && npx tsx scripts/mcp-render-status-sync-test.ts && yarn test:service-process-exit-safety`

Expected: all commands exit code 0.

- [ ] **Step 4: Report the concrete behavior change**

Report that ClickHouse now records/signals the watchdog root only when its descendant matches the exact selected binary; untrusted PID files are cleaned by exact `bin` without signalling; and an intermediate status broadcast cannot switch the selected `current` version back to the stopped version.
