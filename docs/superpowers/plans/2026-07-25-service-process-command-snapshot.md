# Service Process Command Snapshot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent exit cleanup from killing PID-reused terminal processes while still stopping services, including services such as PHP-FPM that replace their launch command with a process title.

**Architecture:** Keep the existing immediate `servicePID` registration unchanged and add an optional root `command` snapshot to each record. `addPid()` coalesces newly registered PIDs into one trailing two-second batch; the batch fetches a single platform process list and fills the current root command for every still-registered PID. At exit, a root is eligible only when its saved command is non-empty and exactly equals the current root command; only then is its descendant tree included in the signal set.

**Tech Stack:** TypeScript, Electron main process, existing `ProcessListFetch` / `ProcessPidList`, Node `setTimeout`, standalone `tsx` assertion script.

---

## File structure

- Modify: `src/main/core/ServiceProcess.ts`
  - Extend each registered PID with an optional command snapshot.
  - Coalesce command snapshot reads and use exact-command ownership validation at exit.
- Modify: `src/shared/Process.ts`
  - Provide a narrowly named helper that validates a root PID against an exact saved command before returning its process tree.
- Modify: `scripts/service-process-exit-safety-test.ts`
  - Cover snapshot capture, PHP-FPM-style process titles, PID reuse, and the no-broad-path invariant.
- Verify: `package.json`
  - No script change is expected; retain `test:service-process-exit-safety` as the regression entry point.

### Task 1: Define exact-command ownership behavior with a failing regression

**Files:**
- Modify: `scripts/service-process-exit-safety-test.ts`
- Modify: `src/shared/Process.ts`
- Modify: `src/main/core/ServiceProcess.ts`

- [ ] **Step 1: Write the failing ownership assertions**

  Replace the binary-marker fixture with saved root commands. Include an FPM process whose visible command does not include its launch binary, and a stale PID whose current command is Codex:

  ```ts
  const nginxCommand = `${serviceBin} -c /Users/x/Library/PhpWebStudy/server/nginx/conf/nginx.conf`
  const phpFpmCommand =
    'php-fpm: master process (/Users/x/Library/PhpWebStudy/server/php/85/conf/php-fpm.conf)'

  const serviceItems: ServiceProcessItem[] = [
    { pid: '4100', item: serviceItem('/Users/x/Library/PhpWebStudy/app/nginx-1.28.0'), command: nginxCommand },
    { pid: '6200', item: phpFpmItem, command: phpFpmCommand },
    // PID 5200 was once a service PID, but now belongs to Codex.
    { pid: '5200', item: serviceItem('/Users/x/Library/PhpWebStudy/app'), command: nginxCommand }
  ]

  assert.deepEqual(ownedServicePids(serviceItems, processList).sort(), [
    '4100',
    '4101',
    '6200',
    '6201'
  ])
  ```

  Use a `processList` containing the corresponding Nginx root and worker, FPM master and worker, and the Codex PID. The assertion must fail on the current `item.bin`-based implementation because the FPM master command no longer contains `phpFpmItem.bin`.

- [ ] **Step 2: Run the regression to verify it fails for the expected reason**

  Run:

  ```bash
  yarn test:service-process-exit-safety
  ```

  Expected: assertion failure because `6200` and `6201` are absent from `ownedServicePids(...)`.

- [ ] **Step 3: Add the exact-command helper**

  In `src/shared/Process.ts`, add a dedicated helper next to `ProcessListByExactPid`; do not weaken the old helper's `includes` semantics or reuse it for this job:

  ```ts
  export const ProcessOwnedPidsByPidAndCommand = (
    pid: string,
    expectedCommand: string | undefined,
    arr: PItem[]
  ): string[] => {
    const tree = ProcessListByExactPid(pid, arr)
    const root = tree.find((item) => item.PID === `${pid}`.trim())
    if (!expectedCommand || !root?.COMMAND) return []
    if (ProcessCommandLooksLikeElectronChild(root.COMMAND)) return []
    if (root.COMMAND !== expectedCommand) return []
    return tree.map((item) => item.PID)
  }
  ```

  In `src/main/core/ServiceProcess.ts`, extend the record and select PIDs with the new helper:

  ```ts
  export type ServiceProcessItem = {
    item: SoftInstalled
    pid: string
    command?: string
  }

  export const ownedServicePids = (serviceItems: ServiceProcessItem[], processList: PItem[]) =>
    Array.from(
      new Set(
        serviceItems.flatMap(({ command, pid }) =>
          ProcessOwnedPidsByPidAndCommand(pid, command, processList)
        )
      )
    )
  ```

- [ ] **Step 4: Run the regression to verify exact command matching passes**

  Run:

  ```bash
  yarn test:service-process-exit-safety
  ```

  Expected: success; Nginx and PHP-FPM roots/workers are selected, while the Codex PID is excluded because its current command differs from its saved snapshot.

- [ ] **Step 5: Commit the exact-command ownership change**

  ```bash
  git add src/shared/Process.ts src/main/core/ServiceProcess.ts scripts/service-process-exit-safety-test.ts
  git commit -m "fix: validate service exit cleanup by command snapshot"
  ```

### Task 2: Batch command snapshot capture after PID registration

**Files:**
- Modify: `src/main/core/ServiceProcess.ts`
- Modify: `scripts/service-process-exit-safety-test.ts`

- [ ] **Step 1: Add a failing capture regression**

  Add an import for the not-yet-existing `applyServiceProcessCommandSnapshots` export. In the regression script, call it with two registered records whose `command` fields are omitted and one record whose PID is not in the queued set. Assert that only queued, registered PIDs receive their current root `COMMAND` values:

  ```ts
  applyServiceProcessCommandSnapshots(serviceItems, new Set(['4100', '6200']), processList)

  assert.equal(serviceItems[0].command, nginxCommand)
  assert.equal(serviceItems[1].command, phpFpmCommand)
  assert.equal(serviceItems[2].command, undefined)
  ```

  Also assert the source declares a two-second command-snapshot delay:

  ```ts
  assert.match(serviceProcessSource, /COMMAND_SNAPSHOT_DELAY\s*=\s*2_000/)
  ```

- [ ] **Step 2: Run the regression to verify it fails**

  Run:

  ```bash
  yarn test:service-process-exit-safety
  ```

  Expected: TypeScript import or assertion failure because the snapshot helper and delay constant do not yet exist.

- [ ] **Step 3: Implement one shared trailing debounce in `ServiceProcess`**

  Keep `addPid()` synchronous and register the PID immediately. Replace its body with the following so an existing binary registration loses its old snapshot before the new PID is queued:

  ```ts
  const COMMAND_SNAPSHOT_DELAY = 2_000

  addPid(type: string, pid: string, item: SoftInstalled) {
    if (!this.servicePID[type]) {
      this.servicePID[type] = []
    }
    const bin = item?.bin
    const existing = bin ? this.servicePID[type].find((entry) => entry.item?.bin === bin) : undefined
    if (existing) {
      existing.pid = pid
      existing.item = item
      existing.command = undefined
    } else {
      this.servicePID[type].push({ item, pid })
    }
    this.emitChange(type)
    this.scheduleCommandSnapshot(pid)
  }
  ```

  Add private state and methods to the class. The queue is only an internal batching mechanism; it does not add a new service state or delay PID registration:

  ```ts
  private commandSnapshotPids = new Set<string>()
  private commandSnapshotTimer?: NodeJS.Timeout

  private scheduleCommandSnapshot(pid: string) {
    this.commandSnapshotPids.add(`${pid}`)
    if (this.commandSnapshotTimer) clearTimeout(this.commandSnapshotTimer)
    this.commandSnapshotTimer = setTimeout(() => {
      this.commandSnapshotTimer = undefined
      this.captureCommandSnapshots().catch((error) =>
        console.log('captureCommandSnapshots error: ', error)
      )
    }, COMMAND_SNAPSHOT_DELAY)
  }

  private async captureCommandSnapshots() {
    const pids = this.commandSnapshotPids
    this.commandSnapshotPids = new Set<string>()
    const processList = isWindows() ? await ProcessPidList() : await ProcessListFetch()
    applyServiceProcessCommandSnapshots(Object.values(this.servicePID).flat(), pids, processList)
  }
  ```

  Implement the pure helper with a PID-to-command map and only update records whose PID is both queued and still present in `servicePID`:

  ```ts
  export const applyServiceProcessCommandSnapshots = (
    serviceItems: ServiceProcessItem[],
    pids: Set<string>,
    processList: PItem[]
  ) => {
    const commandByPid = new Map(processList.map((item) => [item.PID, item.COMMAND]))
    for (const serviceItem of serviceItems) {
      const pid = `${serviceItem.pid}`
      if (!pids.has(pid)) continue
      const command = commandByPid.get(pid)
      if (command) serviceItem.command = command
    }
  }
  ```

  Do not add a renderer-visible pending state and do not synchronously fetch a list from `addPid()`. A record without a captured command remains registered and visible as running, but is deliberately ineligible for exit cleanup.

- [ ] **Step 4: Run the regression to verify the batch behavior passes**

  Run:

  ```bash
  yarn test:service-process-exit-safety
  ```

  Expected: success; the helper fills both root commands from one supplied process list and ignores unregistered PIDs.

- [ ] **Step 5: Commit the debounced capture change**

  ```bash
  git add src/main/core/ServiceProcess.ts scripts/service-process-exit-safety-test.ts
  git commit -m "perf: batch service command snapshots"
  ```

### Task 3: Verify all registration paths and final shutdown safety

**Files:**
- Verify: `src/main/core/IPCHandler.ts`
- Verify: `src/main/core/MCPTools.ts`
- Verify: `src/main/core/ServiceProcess.ts`

- [ ] **Step 1: Verify both service-start entry points keep using `addPid()`**

  Run:

  ```bash
  rg -n "ServiceProcessManager\.addPid" src/main/core/IPCHandler.ts src/main/core/MCPTools.ts
  ```

  Expected: `IPCHandler.handleForkCallback()` registers UI-started services, and `MCPTools.startService()` registers MCP-started services. No entry-point change is required because `addPid()` owns snapshot scheduling for both.

- [ ] **Step 2: Verify the final shutdown contract in the regression**

  Add one final fixture to the regression script with a registered record whose `command` is omitted. Assert `ownedServicePids(...)` does not select its root or descendants. Retain the existing source assertion that `stopAllProcessByName` does not exist.

  Run:

  ```bash
  yarn test:service-process-exit-safety
  ```

  Expected: success. A record lacking a pre-exit command snapshot is excluded, while all exact command matches are retained.

- [ ] **Step 3: Confirm shutdown remains read-only and fail closed**

  Review `killAllPid()` and confirm both platform branches fetch one current process list for final comparison, pass it to `ownedServicePids(...)`, and signal only the returned PIDs. Do not flush the debounce timer or invent a command snapshot during shutdown: a command first observed at shutdown cannot prove the PID is the original service process.

  The resulting invariant is:

  ```ts
  // current root must exist and match a command captured shortly after registration
  ProcessOwnedPidsByPidAndCommand(record.pid, record.command, currentProcessList)
  ```

- [ ] **Step 4: Run focused, formatting, and type verification**

  Run:

  ```bash
  yarn test:service-process-exit-safety
  yarn test:stop-process-list-cache
  npx prettier --check src/main/core/ServiceProcess.ts src/shared/Process.ts scripts/service-process-exit-safety-test.ts
  npx eslint src/main/core/ServiceProcess.ts src/shared/Process.ts scripts/service-process-exit-safety-test.ts
  yarn vue-tsc --noEmit
  git diff --check
  ```

  Expected: every command exits with code 0. The existing stop-process-list-cache test remains green because no shared process-list API contract changes.

- [ ] **Step 5: Commit the final verification additions if Task 3 changed the regression script**

  ```bash
  git add scripts/service-process-exit-safety-test.ts
  git commit -m "test: cover command snapshot exit safety"
  ```

## Behavioural notes

- The two-second timer is shared by all service starts in the main process, so ten starts in one burst produce one process-list query rather than ten.
- A re-registration for the same binary clears the old command before queuing the new PID, so a previous process's snapshot cannot validate a replacement PID.
- Stopping a service before the timer runs removes its registration. Its queued PID may remain in the internal set until the batch fires, but the batch only mutates records that still exist, so it has no effect.
- If process-list access fails or the root process exits before the batch, no command is stored. Exit cleanup skips that record rather than broadening its match criteria.
- The `COMMAND` comparison is exact equality, not `includes`; this prevents a terminal or Codex process from qualifying merely because it mentions FlyEnv, a service directory, or a configuration path.
