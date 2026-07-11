# Remove Exact Target Service Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the alternate exact-target service lifecycle and make startup groups use each module version's native `start()` and `stop()` behavior.

**Architecture:** Startup groups remain an ordering layer only. Renderer version objects call the normal module lifecycle, which updates the selected version and stops other versions according to `Module.isOnlyRunOne`; the fork process exposes only the normal `startService` and `stopService` entry points.

**Tech Stack:** TypeScript, Vue 3 reactive renderer state, Electron IPC, custom `ForkPromise`, Node `assert` regression script, ESLint, vue-tsc.

---

## File Map

- `scripts/startup-group-test.ts`: regression expectations for native module lifecycle and removal of exact-target APIs.
- `src/render/core/StartupGroupRuntime.ts`: startup-group adapter calls installed targets without lifecycle options.
- `src/render/core/Module/Module.ts`: restores the option-free module version-selection and stop-other-versions behavior.
- `src/render/core/Module/ModuleInstalledItem.ts`: removes exact-target renderer dispatch and state branches.
- `src/fork/module/Base/index.ts`: removes exact-target fork entry points and process matching.
- `src/fork/module/Mysql/index.ts`: removes the unused exact-target graceful-stop override.
- `src/fork/module/Mariadb/index.ts`: removes the unused exact-target graceful-stop override.
- `src/fork/module/Mongodb/index.ts`: removes the unused exact-target graceful-stop override.
- `src/fork/module/Postgresql/index.ts`: removes the unused exact-target graceful-stop override.
- `src/shared/Process.ts`: removes the exact-target-only process-marker lookup helper while retaining `ProcessKillStrict`, which normal `ProcessKill` still uses.

Implementation changes remain uncommitted because the current worktree already contains user-owned changes. Each task ends with a scoped diff checkpoint instead of an implementation commit.

### Task 1: Write the failing native-lifecycle regression

**Files:**
- Modify: `scripts/startup-group-test.ts`

- [ ] **Step 1: Change the runtime expectations to option-free calls**

Replace the startup-call assertion with:

```ts
assert.deepEqual(startCalls, [{ id: 'target', options: undefined }])
assert.deepEqual(stopCalls, [{ id: 'target', options: undefined }])
```

This specifies that startup groups delegate directly to the version object's public lifecycle API.

- [ ] **Step 2: Remove the exact-target process-helper behavior test**

Delete the `ProcessTools` import and the block that calls `ProcessOwnedPidsByMarkers`. The helper exists only to implement the lifecycle path being removed.

- [ ] **Step 3: Reverse source assertions so exact-target APIs must be absent**

Replace positive exact-target assertions with:

```ts
assert.doesNotMatch(moduleCoreSource, /ModuleStartOptions|ModuleStopOptions/)
assert.doesNotMatch(installedItemSource, /exactTarget|startServiceExact|stopServiceExact/)
assert.doesNotMatch(forkBaseSource, /startServiceExact|stopServiceExact|_stopServerExactGracefully/)
assert.doesNotMatch(mysqlForkSource, /_stopServerExactGracefully/)
assert.doesNotMatch(mariaDBForkSource, /_stopServerExactGracefully/)
assert.doesNotMatch(postgreSQLForkSource, /_stopServerExactGracefully/)
assert.doesNotMatch(mongoDBForkSource, /_stopServerExactGracefully/)
```

Also read `src/shared/Process.ts` into `processSource` and assert:

```ts
assert.doesNotMatch(processSource, /ProcessOwnedPidsByMarkers/)
```

- [ ] **Step 4: Run the regression and verify RED**

Run:

```powershell
yarn test:startup-groups
```

Expected: FAIL because the runtime still passes `{ updateCurrent: false, stopOtherVersions: false, exactTarget: true }`, and source files still contain exact-target APIs.

- [ ] **Step 5: Review the scoped test diff**

Run:

```powershell
git diff -- scripts/startup-group-test.ts
```

Expected: only native-lifecycle expectations and exact-target absence assertions change.

### Task 2: Restore the renderer's native module lifecycle

**Files:**
- Modify: `src/render/core/StartupGroupRuntime.ts`
- Modify: `src/render/core/Module/Module.ts`
- Modify: `src/render/core/Module/ModuleInstalledItem.ts`

- [ ] **Step 1: Make startup-group installed targets option-free**

In `StartupGroupRuntime.ts`, remove imports of `ModuleStartOptions` and `ModuleStopOptions`, then define the installed target contract as:

```ts
export type StartupGroupInstalledTarget = {
  id?: string
  version: string | null
  bin: string
  path: string
  enable: boolean
  run: boolean
  running: boolean
  port?: number
  start(): Promise<string | boolean>
  stop(): Promise<string | boolean>
}
```

Use native calls in the service adapter:

```ts
await ensureSuccess(target.start())
```

```ts
await ensureSuccess(target.stop())
```

- [ ] **Step 2: Remove module lifecycle option types and branches**

In `Module.ts`, delete `ModuleStartOptions` and `ModuleStopOptions`. Restore `onItemStart` to an option-free method:

```ts
onItemStart(item: ModuleInstalledItem): Promise<Module> {
  return new Promise((resolve) => {
    if (!this.isOnlyRunOne) {
      console.log('onItemStart exit: ', this.typeFlag)
      resolve(this)
      return
    }
    const appStore = AppStore()
    const current = appStore.serverCurrent(this.typeFlag)
    if (
      current?.current?.version !== item.version ||
      current?.current?.path !== item.path ||
      current?.current?.bin !== item.bin
    ) {
      appStore.UPDATE_SERVER_CURRENT({
        flag: this.typeFlag,
        data: JSON.parse(JSON.stringify(item))
      })
      appStore.saveConfig().catch()
    }
    Promise.all(this.installed.map((installed) => installed.stop()))
      .then(() => resolve(this))
      .catch(() => resolve(this))
  })
}
```

- [ ] **Step 3: Remove exact-target renderer dispatch**

In `ModuleInstalledItem.ts`:

- Import only `Module` from `Module.ts`.
- Define `_onStart` as `(item: ModuleInstalledItem) => Promise<Module>`.
- Define `start()` and `stop()` without options.
- Always send `startService` from `start()`.
- On `startExtParam` failure, restore the existing normal behavior: clear `run` and `running`, then resolve `true`.
- Delete the entire `stopServiceExact` branch and its exact-target error-state restoration.
- Keep the normal `stopService` dispatch and its existing final state updates.

The resulting IPC selections must be:

```ts
IPC.send(`app-fork:${this.typeFlag}`, 'startService', JSON.parse(JSON.stringify(this)), ...params)
```

```ts
IPC.send(`app-fork:${this.typeFlag}`, 'stopService', JSON.parse(JSON.stringify(this)), ...params)
```

- [ ] **Step 4: Run targeted TypeScript-aware linting**

Run:

```powershell
npx eslint src/render/core/StartupGroupRuntime.ts src/render/core/Module/Module.ts src/render/core/Module/ModuleInstalledItem.ts scripts/startup-group-test.ts
```

Expected: exit code 0.

- [ ] **Step 5: Run the regression and observe the remaining fork-side failure**

Run:

```powershell
yarn test:startup-groups
```

Expected: runtime call assertions pass; the test still fails because fork and module-specific exact-target APIs have not yet been removed.

- [ ] **Step 6: Review the scoped renderer diff**

Run:

```powershell
git diff -- src/render/core/StartupGroupRuntime.ts src/render/core/Module/Module.ts src/render/core/Module/ModuleInstalledItem.ts scripts/startup-group-test.ts
```

Expected: startup groups now use native version lifecycle and no renderer exact-target types or dispatch remain.

### Task 3: Remove the fork exact-target lifecycle

**Files:**
- Modify: `src/fork/module/Base/index.ts`
- Modify: `src/fork/module/Mysql/index.ts`
- Modify: `src/fork/module/Mariadb/index.ts`
- Modify: `src/fork/module/Mongodb/index.ts`
- Modify: `src/fork/module/Postgresql/index.ts`
- Modify: `src/shared/Process.ts`

- [ ] **Step 1: Remove exact-target entry points from the base fork module**

In `Base/index.ts`:

- Remove `ProcessOwnedPidsByMarkers` and `ProcessKillStrict` from this file's imports.
- Delete `startServiceExact`.
- Delete `_stopServerExactGracefully`.
- Delete `stopServiceExact`, including its PID marker lookup, graceful-stop attempt, forced termination, polling, and alternate result handling.
- Keep `startService`, `stopService`, `_startServer`, and `_stopServer` unchanged.

- [ ] **Step 2: Remove module-specific exact graceful-stop overrides**

Delete the complete `_stopServerExactGracefully` method from each of:

```text
src/fork/module/Mysql/index.ts
src/fork/module/Mariadb/index.ts
src/fork/module/Mongodb/index.ts
src/fork/module/Postgresql/index.ts
```

Do not alter their normal `_stopServer` implementations. Remove imports only if ESLint or TypeScript confirms they became unused.

- [ ] **Step 3: Remove the exact-target-only process marker helper**

Delete this export from `src/shared/Process.ts`:

```ts
export const ProcessOwnedPidsByMarkers = (
  ownedMarkers: Array<string | null | undefined>,
  arr: PItem[],
  caseSensitive = true
): string[] => {
  // complete helper body removed
}
```

Keep `ProcessKillStrict` because `ProcessKill` calls it in the normal process-management path.

- [ ] **Step 4: Search for stale exact-target references**

Run:

```powershell
rg -n "exactTarget|ModuleStartOptions|ModuleStopOptions|startServiceExact|stopServiceExact|_stopServerExactGracefully|ProcessOwnedPidsByMarkers" src scripts/startup-group-test.ts
```

Expected: no matches.

- [ ] **Step 5: Run targeted linting**

Run:

```powershell
npx eslint src/fork/module/Base/index.ts src/fork/module/Mysql/index.ts src/fork/module/Mariadb/index.ts src/fork/module/Mongodb/index.ts src/fork/module/Postgresql/index.ts src/shared/Process.ts
```

Expected: exit code 0, with no unused imports left by deleted methods.

- [ ] **Step 6: Run the regression and verify GREEN**

Run:

```powershell
yarn test:startup-groups
```

Expected: PASS.

- [ ] **Step 7: Review the scoped fork diff**

Run:

```powershell
git diff -- src/fork/module/Base/index.ts src/fork/module/Mysql/index.ts src/fork/module/Mariadb/index.ts src/fork/module/Mongodb/index.ts src/fork/module/Postgresql/index.ts src/shared/Process.ts
```

Expected: only exact-target lifecycle and its now-unused helper are removed.

### Task 4: Full verification

**Files:**
- Verify all modified implementation and test files.

- [ ] **Step 1: Run the complete startup-group regression**

Run:

```powershell
yarn test:startup-groups
```

Expected: PASS with no assertion failures.

- [ ] **Step 2: Run ESLint on every touched source file**

Run:

```powershell
npx eslint scripts/startup-group-test.ts src/render/core/StartupGroupRuntime.ts src/render/core/Module/Module.ts src/render/core/Module/ModuleInstalledItem.ts src/fork/module/Base/index.ts src/fork/module/Mysql/index.ts src/fork/module/Mariadb/index.ts src/fork/module/Mongodb/index.ts src/fork/module/Postgresql/index.ts src/shared/Process.ts
```

Expected: exit code 0.

- [ ] **Step 3: Run Vue and TypeScript checking**

Run:

```powershell
npx vue-tsc --noEmit
```

Expected: exit code 0.

- [ ] **Step 4: Verify formatting and stale references**

Run:

```powershell
git diff --check
```

Expected: no whitespace errors.

Run:

```powershell
rg -n "exactTarget|ModuleStartOptions|ModuleStopOptions|startServiceExact|stopServiceExact|_stopServerExactGracefully|ProcessOwnedPidsByMarkers" src scripts/startup-group-test.ts
```

Expected: no matches.

- [ ] **Step 5: Inspect final worktree scope**

Run:

```powershell
git status --short
git diff --stat
```

Expected: exact-target cleanup files are modified alongside the pre-existing startup-group worktree changes; user-owned `src/render/components/StartupGroup/GroupEditor.vue` and `.tmp_video_tools/` remain untouched by this cleanup.
