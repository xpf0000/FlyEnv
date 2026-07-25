# Startup Hosts Synchronization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Synchronize saved site domains to the system hosts file before the renderer mounts, independent of Site module visibility.

**Architecture:** Add a small pure renderer utility that orders site-list loading before the existing hosts writer. The renderer bootstrap calls it after configuration initialization and before mounting Vue, while the Site page relinquishes its mount-time system-write responsibility. Site visibility remains UI-only and no visibility watcher is introduced.

**Tech Stack:** TypeScript, Vue 3 renderer bootstrap, Pinia, Node `assert`, `tsx`.

---

## File Structure

- Create: `src/render/util/HostStartupSync.ts` — pure startup sequencing helper, testable without Electron or Vue.
- Modify: `src/render/main.ts` — run and contain startup hosts synchronization before `appRoot.mount('#app')`.
- Modify: `src/render/components/Host/Index.vue` — remove its mount-time `hostsWrite(false)` side effect; retain its missing-list fallback.
- Create: `scripts/startup-hosts-sync-test.ts` — test the real sequencing helper and static integration boundaries.
- Modify: `package.json` — register `test:startup-hosts-sync`.

### Task 1: Establish regression coverage for startup sequencing

**Files:**
- Create: `scripts/startup-hosts-sync-test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the failing test**

Create `scripts/startup-hosts-sync-test.ts`:

```ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { synchronizeHostsAtStartup } from '../src/render/util/HostStartupSync'

const calls: string[] = []
await synchronizeHostsAtStartup(
  async () => {
    calls.push('load')
  },
  async () => {
    calls.push('write')
  }
)
assert.deepEqual(calls, ['load', 'write'])

let writerCalled = false
await assert.rejects(
  synchronizeHostsAtStartup(
    async () => {
      throw new Error('host list unavailable')
    },
    async () => {
      writerCalled = true
    }
  ),
  /host list unavailable/
)
assert.equal(writerCalled, false)

const root = process.cwd()
const mainSource = readFileSync(join(root, 'src/render/main.ts'), 'utf-8')
const siteSource = readFileSync(join(root, 'src/render/components/Host/Index.vue'), 'utf-8')
assert.ok(mainSource.includes("synchronizeHostsAtStartup"))
assert.ok(
  mainSource.indexOf('await synchronizeHostsAtStartup') < mainSource.indexOf("appRoot.mount('#app')")
)
assert.equal(siteSource.includes('hostsWrite(false)'), false)

console.log('startup-hosts-sync-test: ok')
```

Add to `package.json` scripts:

```json
"test:startup-hosts-sync": "tsx scripts/startup-hosts-sync-test.ts"
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `yarn test:startup-hosts-sync`

Expected: failure because `src/render/util/HostStartupSync.ts` and the package script do not exist.

### Task 2: Implement pre-mount site hosts synchronization

**Files:**
- Create: `src/render/util/HostStartupSync.ts`
- Modify: `src/render/main.ts`

- [ ] **Step 1: Write the minimal sequencing helper**

Create `src/render/util/HostStartupSync.ts`:

```ts
export const synchronizeHostsAtStartup = async (
  loadHosts: () => Promise<unknown>,
  writeHosts: () => Promise<unknown>
) => {
  await loadHosts()
  await writeHosts()
}
```

- [ ] **Step 2: Connect it before renderer mount**

In `src/render/main.ts`, import `handleWriteHosts` from `@/util/Host` and `synchronizeHostsAtStartup` from `@/util/HostStartupSync`. In the existing `store.initConfig().then(async () => { ... })` callback, place this block after `RendererLanguage.initialize()` and before `appRoot.mount('#app')`:

```ts
try {
  await synchronizeHostsAtStartup(() => store.initHost(), handleWriteHosts)
} catch (error) {
  console.error('Startup hosts synchronization failed:', error)
}
```

This deliberately catches an error so a missing helper or an unreadable hosts file cannot block renderer startup; it deliberately waits for the operation before mounting the Startup Group route.

- [ ] **Step 3: Run the focused test to verify it passes**

Run: `yarn test:startup-hosts-sync`

Expected: `startup-hosts-sync-test: ok` and exit code 0.

### Task 3: Remove the Site page's redundant mount-time write

**Files:**
- Modify: `src/render/components/Host/Index.vue`

- [ ] **Step 1: Remove only the system-write side effect**

Keep the existing empty-list fallback and change the lifecycle block to:

```ts
onMounted(() => {
  if (appStore.hosts.length === 0) {
    appStore.initHost()
  }
})
```

Do not alter the `hostsSet` watcher or the explicit `hostsWrite()` used after importing sites; those are data/settings mutation paths rather than page-mount behavior.

- [ ] **Step 2: Re-run the focused regression test**

Run: `yarn test:startup-hosts-sync`

Expected: `startup-hosts-sync-test: ok` and exit code 0.

### Task 4: Verify integration and record the change

**Files:**
- Modify: `package.json`
- Create: `scripts/startup-hosts-sync-test.ts`
- Create: `src/render/util/HostStartupSync.ts`
- Modify: `src/render/main.ts`
- Modify: `src/render/components/Host/Index.vue`

- [ ] **Step 1: Run formatting and type-aware lint checks for changed source files**

Run: `yarn eslint src/render/main.ts src/render/util/HostStartupSync.ts src/render/components/Host/Index.vue scripts/startup-hosts-sync-test.ts`

Expected: exit code 0 with no lint errors.

- [ ] **Step 2: Run the focused regression test one final time**

Run: `yarn test:startup-hosts-sync`

Expected: `startup-hosts-sync-test: ok` and exit code 0.

- [ ] **Step 3: Check the final diff for whitespace errors**

Run: `git diff --check`

Expected: exit code 0 and no output.

- [ ] **Step 4: Commit the implementation**

```bash
git add package.json scripts/startup-hosts-sync-test.ts src/render/util/HostStartupSync.ts src/render/main.ts src/render/components/Host/Index.vue docs/superpowers/plans/2026-07-25-startup-hosts-sync.md
git commit -m "fix: synchronize site hosts at startup"
```
