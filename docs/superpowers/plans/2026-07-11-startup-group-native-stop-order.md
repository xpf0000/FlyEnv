# Startup Group Native Stop Ordering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make startup groups start members forward and stop members in reverse while relying only on each resolved module/version/project service promise result, with no startup-group-specific stop timeout or post-stop state polling.

**Architecture:** Keep `createStartupGroupRunner` as the sequential orchestration layer. The runtime adapter resolves the existing global version or project object and delegates directly to its native `start`/`stop` method; the runner records returned failures and continues reverse-order stopping without adding another state check.

**Tech Stack:** TypeScript, Vue 3 reactive service objects, existing `scripts/startup-group-test.ts` assertion runner.

---

### Task 1: Lock Native Stop Semantics in Regression Tests

**Files:**
- Modify: `scripts/startup-group-test.ts`
- Test: `scripts/startup-group-test.ts`

- [ ] **Step 1: Change the runtime adapter assertion to require native stop arguments**

Replace the existing exact-target expectation:

```ts
assert.deepEqual(stopCalls, [{ id: 'target', options: { exactTarget: true } }])
```

with:

```ts
assert.deepEqual(stopCalls, [{ id: 'target', options: undefined }])
```

- [ ] **Step 2: Change the runner assertion to trust the native stop result**

Use an adapter whose `stop()` resolves but whose mocked `getState()` remains `running`, and assert that the member outcome is `stopped`:

```ts
{
  const adapter: StartupGroupAdapter = {
    exists: async () => true,
    getState: async () => 'running',
    start: async () => undefined,
    stop: async () => undefined
  }

  const result = await createStartupGroupRunner(() => adapter).run(
    makeGroup('stop-native-result', [mysql]),
    'stop'
  )

  assert.equal(result.members[0].outcome, 'stopped')
}
```

- [ ] **Step 3: Preserve reverse-order and continue-on-failure assertions**

Keep the existing test that expects:

```ts
assert.deepEqual(calls, ['stop:api', 'stop:redis', 'stop:mysql'])
assert.deepEqual(
  result.members.map((item) => item.outcome),
  ['stopped', 'failed', 'stopped']
)
```

- [ ] **Step 4: Run the regression test and verify RED**

Run:

```bash
yarn test:startup-groups
```

Expected: FAIL because the runtime still passes `{ exactTarget: true }` and the runner still converts a successful native stop into `failed` when the mocked state remains running.

### Task 2: Delegate Stop Completion to Native Services

**Files:**
- Modify: `src/render/core/StartupGroupRuntime.ts`
- Modify: `src/render/core/StartupGroup.ts`
- Test: `scripts/startup-group-test.ts`

- [ ] **Step 1: Call the installed version's native stop method without startup-group options**

Change the service adapter stop implementation to:

```ts
stop: async (item) => {
  const target = await installedTarget(item)
  if (!target) throw new Error('Service version not found')
  await ensureSuccess(target.stop())
}
```

Do not change project service delegation; it remains:

```ts
await ensureSuccess(target.stop(false))
```

- [ ] **Step 2: Remove the runner's post-stop state polling**

Change the stop branch to rely on the adapter promise result only:

```ts
} else {
  await adapter.stop(item)
  members.push({ item, outcome: 'stopped' })
}
```

Keep the existing reverse iteration:

```ts
const items = action === 'start' ? group.items : [...group.items].reverse()
```

Keep stop failure handling unchanged so `startFailed` is set only for start failures.

- [ ] **Step 3: Run the regression test and verify GREEN**

Run:

```bash
yarn test:startup-groups
```

Expected: `startup group tests passed`.

### Task 3: Verify the Focused Change

**Files:**
- Verify: `scripts/startup-group-test.ts`
- Verify: `src/render/core/StartupGroupRuntime.ts`
- Verify: `src/render/core/StartupGroup.ts`

- [ ] **Step 1: Run targeted lint**

Run:

```bash
npx eslint scripts/startup-group-test.ts src/render/core/StartupGroupRuntime.ts src/render/core/StartupGroup.ts
```

Expected: exit code 0 with no ESLint errors.

- [ ] **Step 2: Run Vue TypeScript checking**

Run:

```bash
npx vue-tsc --noEmit
```

Expected: exit code 0 with no TypeScript errors.

- [ ] **Step 3: Check whitespace and inspect the final diff**

Run:

```bash
git diff --check
git diff -- scripts/startup-group-test.ts src/render/core/StartupGroupRuntime.ts src/render/core/StartupGroup.ts
```

Expected: no whitespace errors; the functional diff only removes exact-target stop options and post-stop state polling while preserving forward start and reverse stop order.

- [ ] **Step 4: Leave implementation changes uncommitted**

The workspace already contains user-owned and earlier startup-group changes. Do not stage or commit the implementation files unless the user explicitly requests a commit.
