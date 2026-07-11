# Startup Group Sidebar Running State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Highlight the Startup Group left-navigation icon whenever any member in any configured startup group is running, including members outside the default group.

**Architecture:** Add an aggregate query to the existing `StartupGroupManager` singleton and consume it directly from the Startup Group navigation component. The navigation component loads required global version/project sources when mounted or when group configuration changes, but stores no copied running state and uses no polling.

**Tech Stack:** Vue 3 Composition API, TypeScript, existing reactive `StartupGroupSetup`, assertion-based `scripts/startup-group-test.ts` regression script.

---

### Task 1: Add Failing Aggregate and Sidebar Contract Tests

**Files:**
- Modify: `scripts/startup-group-test.ts`
- Test: `scripts/startup-group-test.ts`

- [ ] **Step 1: Assert aggregate running behavior on the manager**

In the existing `StartupGroupManager` test block, add:

```ts
assert.equal(
  typeof (manager as StartupGroupManager & {
    isAnyGroupRunning?: (groups: StartupGroup[]) => boolean
  }).isAnyGroupRunning,
  'function'
)
assert.equal(
  (
    manager as StartupGroupManager & {
      isAnyGroupRunning(groups: StartupGroup[]): boolean
    }
  ).isAnyGroupRunning([makeGroup('default', [redis]), makeGroup('secondary', [api])]),
  true
)
project.state.isRun = false
assert.equal(
  (
    manager as StartupGroupManager & {
      isAnyGroupRunning(groups: StartupGroup[]): boolean
    }
  ).isAnyGroupRunning([makeGroup('default', [redis]), makeGroup('secondary', [api])]),
  false
)
```

This specifically proves that a running member in a non-default group contributes to the aggregate state.

- [ ] **Step 2: Read the Startup Group navigation source in the source-contract block**

Add:

```ts
const startupGroupAsideSource = readSource('src/render/components/StartupGroup/aside.vue')
```

- [ ] **Step 3: Assert global live-state wiring and absence of duplicated state**

Add:

```ts
assert.match(startupGroupAsideSource, /StartupGroupSetup\.isAnyGroupRunning/)
assert.match(startupGroupAsideSource, /normalizeStartupGroupConfig/)
assert.match(startupGroupAsideSource, /StartupGroupSetup\.ensureSources/)
assert.match(startupGroupAsideSource, /:class="\{ run: startupGroupRunning \}"/)
assert.doesNotMatch(startupGroupAsideSource, /setInterval/)
assert.doesNotMatch(startupGroupAsideSource, /runningMap/)
```

- [ ] **Step 4: Run the regression script and verify RED**

Run:

```bash
yarn test:startup-groups
```

Expected: FAIL because `StartupGroupManager.isAnyGroupRunning` and the navigation wiring do not exist yet.

### Task 2: Add the Aggregate Query to the Global Manager

**Files:**
- Modify: `src/render/core/StartupGroupManager.ts`
- Test: `scripts/startup-group-test.ts`

- [ ] **Step 1: Add the aggregate live-state method**

Immediately after `isGroupRunning`, add:

```ts
isAnyGroupRunning(groups: StartupGroup[]) {
  return groups.some((group) => this.isGroupRunning(group))
}
```

The method delegates to existing live member resolution and creates no new state.

- [ ] **Step 2: Run the regression script**

Run:

```bash
yarn test:startup-groups
```

Expected: the aggregate assertions pass; the script still fails on the navigation source-contract assertions.

### Task 3: Wire the Startup Group Navigation Item

**Files:**
- Modify: `src/render/components/StartupGroup/aside.vue`
- Test: `scripts/startup-group-test.ts`

- [ ] **Step 1: Bind the existing running icon class**

Change the icon wrapper to:

```vue
<div class="icon-block" :class="{ run: startupGroupRunning }">
```

- [ ] **Step 2: Compute all configured groups and their aggregate running state**

Use these imports and computed values:

```ts
import { computed, onMounted, watch } from 'vue'
import { AppStore } from '@/store/app'
import { normalizeStartupGroupConfig } from '@/core/StartupGroup'
import { StartupGroupSetup } from './setup'

const appStore = AppStore()
const groups = computed(
  () => normalizeStartupGroupConfig(appStore.config.setup.startupGroups).groups
)
const startupGroupRunning = computed(() =>
  StartupGroupSetup.isAnyGroupRunning(groups.value)
)
```

- [ ] **Step 3: Ensure global member sources are loaded without storing local state**

Add:

```ts
const ensureSources = () => StartupGroupSetup.ensureSources(groups.value).catch(() => {})

watch(
  () => groups.value.map((group) => `${group.id}:${group.updatedAt}`).join('|'),
  ensureSources
)
onMounted(ensureSources)
```

- [ ] **Step 4: Run the regression script and verify GREEN**

Run:

```bash
yarn test:startup-groups
```

Expected: `startup group tests passed`.

### Task 4: Verify the Focused Change

**Files:**
- Verify: `scripts/startup-group-test.ts`
- Verify: `src/render/core/StartupGroupManager.ts`
- Verify: `src/render/components/StartupGroup/aside.vue`

- [ ] **Step 1: Run targeted ESLint**

Run:

```bash
npx eslint scripts/startup-group-test.ts src/render/core/StartupGroupManager.ts src/render/components/StartupGroup/aside.vue
```

Expected: exit code 0 with no ESLint errors.

- [ ] **Step 2: Run Vue TypeScript checking**

Run:

```bash
npx vue-tsc --noEmit
```

Expected: exit code 0 with no TypeScript errors.

- [ ] **Step 3: Run whitespace and focused diff checks**

Run:

```bash
git diff --check
git diff -- scripts/startup-group-test.ts src/render/core/StartupGroupManager.ts src/render/components/StartupGroup/aside.vue
```

Expected: no whitespace errors; the navigation component contains only computed global-state wiring and source loading, with no polling or copied run state.

- [ ] **Step 4: Leave implementation changes uncommitted**

The repository is a normal `master` checkout with existing user-owned and startup-group modifications. Do not stage or commit implementation files unless the user explicitly requests it.
