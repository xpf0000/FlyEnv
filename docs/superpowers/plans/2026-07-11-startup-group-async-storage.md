# Startup Group Async Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move startup-group persistence out of `AppStore` and Electron preferences into the existing asynchronous renderer storage API.

**Architecture:** A module-level reactive singleton in `src/render/components/StartupGroup/store.ts` owns the normalized startup-group configuration. Renderer bootstrap loads it with `StorageGetAsync` before mounting, every startup-group consumer reads the singleton, and mutations persist through `StorageSetAsync` without calling `AppStore.saveConfig()`.

**Tech Stack:** TypeScript, Vue 3 reactivity, localForage through `StorageGetAsync`/`StorageSetAsync`, existing TSX assertion test script.

---

## File Structure

- Modify `scripts/startup-group-test.ts`: add regression assertions for storage ownership, bootstrap ordering, and removal from AppStore.
- Modify `src/render/components/StartupGroup/store.ts`: own, initialize, expose, and persist the shared startup-group configuration.
- Modify `src/render/store/app.ts`: remove the startup-group field and Electron-preference initialization path.
- Modify `src/render/main.ts`: await startup-group storage initialization before mounting Vue.
- Modify `src/render/components/Aside/Index.vue`: use the dedicated store for default-group routing and correction.
- Modify `src/render/components/StartupGroup/aside.vue`: use the dedicated store for the running indicator.
- Modify `src/render/components/StartupGroup/Module.ts`: use the dedicated store in the module visibility guard.

### Task 1: Add Failing Persistence-Boundary Regression Checks

**Files:**
- Modify: `scripts/startup-group-test.ts:831`
- Test: `scripts/startup-group-test.ts`

- [ ] **Step 1: Read the additional implementation sources in the existing source-contract test block**

Add these declarations beside the existing `readSource(...)` declarations:

```ts
const startupGroupStoreSource = readSource('src/render/components/StartupGroup/store.ts')
const mainSource = readSource('src/render/main.ts')
```

- [ ] **Step 2: Add assertions defining the new persistence boundary**

Add these assertions near the existing startup-group integration assertions:

```ts
assert.match(startupGroupStoreSource, /StorageGetAsync/)
assert.match(startupGroupStoreSource, /StorageSetAsync/)
assert.doesNotMatch(startupGroupStoreSource, /AppStore/)
assert.doesNotMatch(startupGroupStoreSource, /saveConfig\(/)
assert.doesNotMatch(appStoreSource, /startupGroups/)
assert.match(startupGroupAsideSource, /useStartupGroupStore/)
assert.doesNotMatch(startupGroupAsideSource, /config\.setup\.startupGroups/)
assert.match(moduleSource, /useStartupGroupStore/)
assert.doesNotMatch(moduleSource, /config\.setup\.startupGroups/)
assert.match(asideSource, /useStartupGroupStore/)
assert.doesNotMatch(asideSource, /config\.setup\.startupGroups/)
assert.match(mainSource, /initStartupGroupStore/)
assert.match(mainSource, /await initStartupGroupStore\(\)/)
```

- [ ] **Step 3: Run the focused test and verify RED**

Run:

```bash
yarn test:startup-groups
```

Expected: FAIL because the startup-group store does not yet use `StorageGetAsync`, and `AppStore` still contains `startupGroups`.

- [ ] **Step 4: Commit the failing regression test only**

```bash
git add scripts/startup-group-test.ts
git commit -m "test: require async storage for startup groups" -- scripts/startup-group-test.ts
```

### Task 2: Implement the Dedicated Async Startup-Group Store

**Files:**
- Modify: `src/render/components/StartupGroup/store.ts`
- Test: `scripts/startup-group-test.ts`

- [ ] **Step 1: Replace AppStore ownership with module-level reactive state**

Use these imports and state declarations:

```ts
import { computed, reactive } from 'vue'

import {
  createStartupGroup,
  deleteStartupGroup,
  normalizeStartupGroupConfig,
  setDefaultStartupGroup,
  updateStartupGroup,
  type StartupGroup,
  type StartupGroupConfig,
  type StartupGroupDraft
} from '@/core/StartupGroup'
import { uuid } from '@/util/Index'
import { StorageGetAsync, StorageSetAsync } from '@/util/Storage'

const storageKey = 'flyenv-startup-groups'
const state = reactive<{ config: StartupGroupConfig }>({
  config: normalizeStartupGroupConfig(undefined)
})
const config = computed(() => state.config)
const groups = computed(() => state.config.groups)

let loaded = false
let loading: Promise<StartupGroupConfig> | undefined

const replaceConfig = (value: unknown) => {
  state.config = normalizeStartupGroupConfig(value)
  return state.config
}
```

- [ ] **Step 2: Add idempotent asynchronous initialization**

```ts
export const initStartupGroupStore = async (): Promise<StartupGroupConfig> => {
  if (loaded) return state.config

  if (!loading) {
    loading = StorageGetAsync<StartupGroupConfig>(storageKey)
      .catch(() => normalizeStartupGroupConfig(undefined))
      .then((saved) => {
        loaded = true
        return replaceConfig(saved)
      })
      .finally(() => {
        loading = undefined
      })
  }

  return loading
}
```

- [ ] **Step 3: Persist normalized data without AppStore**

Define the shared save function before `useStartupGroupStore`:

```ts
const save = async (next: StartupGroupConfig) => {
  await initStartupGroupStore()
  const normalized = normalizeStartupGroupConfig(next)
  await StorageSetAsync(storageKey, JSON.parse(JSON.stringify(normalized)))
  replaceConfig(normalized)
}
```

Keep the existing `add`, `update`, `remove`, `setDefault`, and `find` behavior, but make them operate on the module-level `config` and `groups`. Return the shared values and initializer:

```ts
export function useStartupGroupStore() {
  const add = async (draft: StartupGroupDraft) => {
    const result = createStartupGroup(config.value, draft, uuid(), Date.now())
    await save(result.config)
    return result.group
  }

  const update = async (id: string, draft: StartupGroupDraft) => {
    await save(updateStartupGroup(config.value, id, draft, Date.now()))
  }

  const remove = async (id: string) => {
    await save(deleteStartupGroup(config.value, id))
  }

  const setDefault = async (id?: string) => {
    const group = id ? groups.value.find((item) => item.id === id) : undefined
    if (id && (!group || group.items.length === 0)) return false
    await save(setDefaultStartupGroup(config.value, id))
    return true
  }

  const find = (id: string): StartupGroup | undefined =>
    groups.value.find((group) => group.id === id)

  return { config, groups, init: initStartupGroupStore, add, update, remove, setDefault, find }
}
```

- [ ] **Step 4: Run the focused test and inspect the remaining failures**

Run:

```bash
yarn test:startup-groups
```

Expected: FAIL only on AppStore, bootstrap, and consumer assertions that are addressed in Task 3.

- [ ] **Step 5: Commit the dedicated store**

```bash
git add src/render/components/StartupGroup/store.ts
git commit -m "refactor: add startup group async store" -- src/render/components/StartupGroup/store.ts
```

### Task 3: Redirect Initialization and All Consumers

**Files:**
- Modify: `src/render/store/app.ts`
- Modify: `src/render/main.ts`
- Modify: `src/render/components/Aside/Index.vue`
- Modify: `src/render/components/StartupGroup/aside.vue`
- Modify: `src/render/components/StartupGroup/Module.ts`
- Test: `scripts/startup-group-test.ts`

- [ ] **Step 1: Remove startup-group data from AppStore**

In `src/render/store/app.ts`:

- Remove the `normalizeStartupGroupConfig` and `StartupGroupConfig` import.
- Remove `startupGroups?: StartupGroupConfig` from `StateBase`.
- Remove the `INIT_CONFIG` block that assigns `this.config.setup.startupGroups`.

The end of `INIT_CONFIG` must remain:

```ts
if (!this.config.setup.phpGroupStart) {
  this.config.setup.phpGroupStart = reactive({})
}
```

- [ ] **Step 2: Load startup groups before Vue mounts**

In `src/render/main.ts`, import:

```ts
import { initStartupGroupStore } from '@/components/StartupGroup/store'
```

Make the existing `initConfig` continuation asynchronous and initialize storage before theme/i18n setup and mount:

```ts
store
  .initConfig()
  .then(async () => {
    await initStartupGroupStore()
    ThemeInit()
    const config = store.config.setup
    AppI18n(config?.lang)
    appRoot.mount('#app')
  })
  .catch()
```

- [ ] **Step 3: Redirect the main sidebar to the dedicated store**

In `src/render/components/Aside/Index.vue`:

- Remove `normalizeStartupGroupConfig` and `setDefaultStartupGroup` from the core import.
- Import `useStartupGroupStore` from `@/components/StartupGroup/store`.
- Create `const startupGroupStore = useStartupGroupStore()` beside the existing stores.
- Replace the computed normalization with the shared computed ref:

```ts
const startupGroupConfig = startupGroupStore.config
```

- Replace the invalid-default cleanup with:

```ts
if (!group && startupGroupConfig.value.defaultStartupGroupId) {
  await startupGroupStore.setDefault()
}
```

- [ ] **Step 4: Redirect the startup-group sidebar item**

In `src/render/components/StartupGroup/aside.vue`:

- Remove imports of `normalizeStartupGroupConfig` and `AppStore`.
- Import `useStartupGroupStore` from `./store`.
- Replace the local AppStore-derived computed with:

```ts
const { groups } = useStartupGroupStore()
```

Keep the existing running-state computed, watcher, and source initialization unchanged.

- [ ] **Step 5: Redirect the module visibility guard**

In `src/render/components/StartupGroup/Module.ts`:

- Remove `normalizeStartupGroupConfig` from the core import.
- Remove the `AppStore` import.
- Import `useStartupGroupStore` from `./store`.
- Replace the AppStore lookup with:

```ts
const config = useStartupGroupStore().config.value
```

- [ ] **Step 6: Run the focused test and verify GREEN**

Run:

```bash
yarn test:startup-groups
```

Expected: PASS with the existing final message `startup group tests passed` and exit code 0.

- [ ] **Step 7: Commit the consumer migration**

```bash
git add src/render/store/app.ts src/render/main.ts src/render/components/Aside/Index.vue src/render/components/StartupGroup/aside.vue src/render/components/StartupGroup/Module.ts
git commit -m "refactor: move startup groups out of app preferences" -- src/render/store/app.ts src/render/main.ts src/render/components/Aside/Index.vue src/render/components/StartupGroup/aside.vue src/render/components/StartupGroup/Module.ts
```

### Task 4: Static and Requirement Verification

**Files:**
- Verify: `scripts/startup-group-test.ts`
- Verify: `src/render/components/StartupGroup/store.ts`
- Verify: `src/render/store/app.ts`
- Verify: `src/render/main.ts`
- Verify: `src/render/components/Aside/Index.vue`
- Verify: `src/render/components/StartupGroup/aside.vue`
- Verify: `src/render/components/StartupGroup/Module.ts`

- [ ] **Step 1: Confirm no startup-group AppStore persistence remains**

Run:

```bash
rg -n "config\.setup\.startupGroups|startupGroups\?:|saveConfig\(\)" src/render/components/StartupGroup src/render/components/Aside/Index.vue src/render/store/app.ts
```

Expected: no matches related to startup-group persistence.

- [ ] **Step 2: Run focused ESLint**

Run:

```bash
npx eslint scripts/startup-group-test.ts src/render/components/StartupGroup/store.ts src/render/store/app.ts src/render/main.ts src/render/components/Aside/Index.vue src/render/components/StartupGroup/aside.vue src/render/components/StartupGroup/Module.ts
```

Expected: exit code 0 with no lint or Prettier errors.

- [ ] **Step 3: Run TypeScript/Vue static checking**

Run:

```bash
npx vue-tsc --noEmit
```

Expected: exit code 0. If the repository has unrelated baseline errors, record the exact errors and additionally confirm that none reference the changed files.

- [ ] **Step 4: Re-run the startup-group regression suite**

Run:

```bash
yarn test:startup-groups
```

Expected: PASS with exit code 0.

- [ ] **Step 5: Review the final scoped diff**

Run:

```bash
git diff HEAD~3 -- scripts/startup-group-test.ts src/render/components/StartupGroup/store.ts src/render/store/app.ts src/render/main.ts src/render/components/Aside/Index.vue src/render/components/StartupGroup/aside.vue src/render/components/StartupGroup/Module.ts
```

Expected: only the tested async-storage migration, with no startup-group writes through AppStore or Electron preferences.
