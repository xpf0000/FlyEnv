# Local Lifecycle Status Sync Protection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep delayed main-process service-status notifications from overwriting versions that are currently executing a local start or stop operation.

**Architecture:** Add a per-version guard to the renderer's existing status synchronization loop. Versions with `running=true` remain owned by their local lifecycle callback, while idle versions continue to synchronize from main-process PID instances.

**Tech Stack:** TypeScript, Node `assert`, Electron renderer state synchronization, ESLint, vue-tsc.

---

## File Map

- `scripts/mcp-render-status-sync-test.ts`: regression coverage for local start/stop races.
- `src/render/util/mcpServiceStatus.ts`: per-version local lifecycle guard.

Implementation changes remain uncommitted because the current `master` worktree contains existing user-owned changes.

### Task 1: Write failing local lifecycle race tests

**Files:**
- Modify: `scripts/mcp-render-status-sync-test.ts`

- [ ] **Step 1: Give installed test objects an explicit PID field**

Add this property to `makeInstalled`:

```ts
pid: ''
```

- [ ] **Step 2: Add the locally stopping regression**

Before the final success log, add:

```ts
const stopping = makeInstalled('8.2.18', 'E:/FlyEnv/data/php')
stopping.run = false
stopping.running = true
stopping.pid = '18516'

syncServiceStatusFromMcp({
  installed: [stopping],
  instances: [
    {
      bin: stopping.bin,
      path: stopping.path,
      version: stopping.version,
      pid: '18516'
    }
  ]
})

assert.deepEqual(
  { run: stopping.run, running: stopping.running, pid: stopping.pid },
  { run: false, running: true, pid: '18516' },
  'main-process status must not overwrite a locally stopping version'
)
```

- [ ] **Step 3: Add the locally starting regression**

Add:

```ts
const starting = makeInstalled('8.3.0', 'E:/FlyEnv/data/php')
starting.run = false
starting.running = true

syncServiceStatusFromMcp({
  installed: [starting],
  instances: []
})

assert.deepEqual(
  { run: starting.run, running: starting.running, pid: starting.pid },
  { run: false, running: true, pid: '' },
  'empty main-process status must not clear a locally starting version state'
)
```

- [ ] **Step 4: Run the dedicated test and verify RED**

Run:

```powershell
npx tsx scripts/mcp-render-status-sync-test.ts
```

Expected: FAIL because the stopping version is overwritten with `run=true, running=false`, or the starting version has `running` cleared.

### Task 2: Protect locally executing versions

**Files:**
- Modify: `src/render/util/mcpServiceStatus.ts`
- Test: `scripts/mcp-render-status-sync-test.ts`

- [ ] **Step 1: Add the per-version guard**

At the beginning of the `installed.forEach` callback, add:

```ts
if (item.running) {
  return
}
```

The rest of the synchronization logic remains unchanged.

- [ ] **Step 2: Run the dedicated test and verify GREEN**

Run:

```powershell
npx tsx scripts/mcp-render-status-sync-test.ts
```

Expected: `mcp render status sync tests passed`.

- [ ] **Step 3: Run related regressions**

Run:

```powershell
yarn test:startup-groups
```

Expected: PASS.

- [ ] **Step 4: Run lint and type checks**

Run:

```powershell
npx eslint scripts/mcp-render-status-sync-test.ts src/render/util/mcpServiceStatus.ts
npx vue-tsc --noEmit
```

Expected: both commands exit with code 0.

- [ ] **Step 5: Verify formatting and scope**

Run:

```powershell
git diff --check
git diff -- scripts/mcp-render-status-sync-test.ts src/render/util/mcpServiceStatus.ts
git status --short
```

Expected: no whitespace errors; the new implementation diff is limited to the dedicated test and synchronization function, alongside pre-existing worktree changes.
