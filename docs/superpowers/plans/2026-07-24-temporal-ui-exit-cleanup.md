# Temporal UI Exit Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Register the detached Temporal UI PID independently so the existing application-exit shutdown stops it.

**Architecture:** Preserve `serviceStartSpawn`'s UI PID response in the Temporal fork module. Return a UI-specific installed-item payload, then let `IPCHandler` choose that payload while registering the PID. The existing `ServiceProcessManager.stop()` sees both PID records and sends `SIGINT` to both.

**Tech Stack:** TypeScript, Electron IPC, Node assert regression script.

---

### Task 1: Add the failing exit-cleanup regression assertions

**Files:**
- Modify: `scripts/temporal-module-test.ts:46-54`
- Test: `scripts/temporal-module-test.ts`

- [ ] **Step 1: Write the failing test**

Add assertions for the intended IPC contract:

```ts
assert.match(temporalForkSource, /const res = await serviceStartSpawn\(/)
assert.match(temporalForkSource, /'APP-Service-Start-Item': uiVersion/)

const ipcHandlerSource = readFileSync(
  new URL('../src/main/core/IPCHandler.ts', import.meta.url),
  'utf8'
)
assert.match(
  ipcHandlerSource,
  /info\.data\?\.\['APP-Service-Start-Item'\] \?\? args\[1\]/
)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test:temporal`

Expected: fail because `startUiServer` discards the `serviceStartSpawn` result and `IPCHandler` only uses `args[1]`.

- [ ] **Step 3: Write the minimal implementation**

In `src/fork/module/Temporal/index.ts`, preserve the spawn response and expose its PID alongside the UI start item:

```ts
const res = await serviceStartSpawn({ /* existing UI spawn arguments */ })
resolve({
  ...res,
  'APP-Service-Start-Item': uiVersion
})
```

In `src/main/core/IPCHandler.ts`, register the optional start item when present:

```ts
const item = info.data?.['APP-Service-Start-Item'] ?? args[1]
ServiceProcessManager.addPid(module, info.data['APP-Service-Start-PID'], item)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test:temporal`

Expected: both Temporal scripts print `ALL CHECKS PASSED`.

- [ ] **Step 5: Verify formatting and types**

Run:

```bash
npx prettier --check scripts/temporal-module-test.ts src/fork/module/Temporal/index.ts src/main/core/IPCHandler.ts
yarn vue-tsc --noEmit
```

Expected: both commands exit 0.

- [ ] **Step 6: Commit**

```bash
git add scripts/temporal-module-test.ts src/fork/module/Temporal/index.ts src/main/core/IPCHandler.ts
git commit -m "fix: stop temporal ui on application exit"
```
