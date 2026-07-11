# Startup Group License Limit and Default Route Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Limit unlicensed users to one startup group and prefer Startup Groups as the initial route while retaining the existing first-visible-module fallback.

**Architecture:** Put the license-count rule in a pure Startup Group core helper and consume it from the page using the existing `SetupStore.isActive` state. Change only the router and app-store initial route values; the existing Aside watcher remains responsible for redirecting away from hidden modules.

**Tech Stack:** TypeScript, Vue 3, Pinia, Vue Router, Element Plus, Vue I18n, existing Startup Group regression script.

---

### Task 1: Add Failing License and Route Tests

**Files:**
- Modify: `scripts/startup-group-test.ts`
- Test: `scripts/startup-group-test.ts`

- [ ] **Step 1: Assert the license-count rule**

Add a test using the existing `StartupGroupCore` namespace:

```ts
assert.equal(typeof (StartupGroupCore as any).isStartupGroupCreationLocked, 'function')
assert.equal((StartupGroupCore as any).isStartupGroupCreationLocked(false, 0), false)
assert.equal((StartupGroupCore as any).isStartupGroupCreationLocked(false, 1), true)
assert.equal((StartupGroupCore as any).isStartupGroupCreationLocked(true, 1), false)
assert.equal((StartupGroupCore as any).isStartupGroupCreationLocked(true, 10), false)
```

- [ ] **Step 2: Read router and app-store sources**

In the source-contract block, add:

```ts
const routerSource = readSource('src/render/router/index.ts')
const appStoreSource = readSource('src/render/store/app.ts')
```

- [ ] **Step 3: Assert locked-button integration and license copy**

Add:

```ts
assert.match(indexSource, /SetupStore/)
assert.match(indexSource, /isStartupGroupCreationLocked/)
assert.match(indexSource, /const isAddLocked = computed/)
assert.match(indexSource, /:icon="Lock"/)
assert.match(indexSource, /common\.startupGroup\.licenseTips/)
assert.match(indexSource, /const toLicense =/)
assert.match(indexSource, /setupStore\.tab = 'licenses'/)
assert.match(indexSource, /if \(!group && isAddLocked\.value\)/)
assert.match(zhCommonSource, /"licenseTips": "未获得许可证，只能创建一个启动组。"/)
assert.match(
  enCommonSource,
  /"licenseTips": "Without a license, only one startup group can be created\."/
)
```

- [ ] **Step 4: Assert preferred route and existing fallback**

Add:

```ts
assert.match(routerSource, /redirect: '\/startup-group'/)
assert.match(appStoreSource, /currentPage: '\/startup-group'/)
assert.match(asideSource, /const isRouteCurrent = computed/)
assert.match(asideSource, /const item = allModule\.value\[0\]/)
assert.match(asideSource, /const sub = item\?\.sub\?\.\[0\]/)
```

- [ ] **Step 5: Run the regression script and verify RED**

Run:

```bash
yarn test:startup-groups
```

Expected: FAIL because the pure rule, locked-button integration, translations, and `/startup-group` defaults do not exist.

### Task 2: Implement the Pure License Rule

**Files:**
- Modify: `src/render/core/StartupGroup.ts`
- Test: `scripts/startup-group-test.ts`

- [ ] **Step 1: Export the rule**

Add:

```ts
export function isStartupGroupCreationLocked(isLicenseActive: boolean, groupCount: number) {
  return !isLicenseActive && groupCount >= 1
}
```

- [ ] **Step 2: Refactor the test to use the typed export directly**

Replace `(StartupGroupCore as any).isStartupGroupCreationLocked` calls with `StartupGroupCore.isStartupGroupCreationLocked`.

- [ ] **Step 3: Run the regression script**

Run:

```bash
yarn test:startup-groups
```

Expected: helper assertions pass; source and translation assertions still fail.

### Task 3: Add License Tooltip Copy

**Files:**
- Modify: `src/lang/zh/common.json`
- Modify: `src/lang/en/common.json`
- Test: `scripts/startup-group-test.ts`

- [ ] **Step 1: Add Chinese copy under `common.startupGroup`**

```json
"licenseTips": "未获得许可证，只能创建一个启动组。"
```

- [ ] **Step 2: Add English copy under `common.startupGroup`**

```json
"licenseTips": "Without a license, only one startup group can be created."
```

- [ ] **Step 3: Run the regression script**

Run:

```bash
yarn test:startup-groups
```

Expected: helper and translation assertions pass; page and route assertions still fail.

### Task 4: Lock Startup Group Creation in the Page

**Files:**
- Modify: `src/render/components/StartupGroup/Index.vue`
- Test: `scripts/startup-group-test.ts`

- [ ] **Step 1: Add required imports and stores**

Use:

```ts
import { computed, onMounted, ref, watch } from 'vue'
import { Lock } from '@element-plus/icons-vue'
import Router from '@/router'
import { AppStore } from '@/store/app'
import { SetupStore } from '@/components/Setup/store'
import {
  isStartupGroupCreationLocked,
  type StartupGroup,
  type StartupGroupItem,
  type StartupGroupRunResult
} from '@/core/StartupGroup'

const appStore = AppStore()
const setupStore = SetupStore()
const isAddLocked = computed(() =>
  isStartupGroupCreationLocked(setupStore.isActive, groups.value.length)
)
```

- [ ] **Step 2: Render a lock button when creation is restricted**

Replace the single top-right add button with:

```vue
<el-tooltip
  v-if="isAddLocked"
  placement="left"
  :content="I18nT('common.startupGroup.licenseTips')"
>
  <el-button :icon="Lock" type="warning" @click="toLicense">
    {{ I18nT('common.startupGroup.add') }}
  </el-button>
</el-tooltip>
<el-button v-else type="primary" @click="openEditor()">
  {{ I18nT('common.startupGroup.add') }}
</el-button>
```

- [ ] **Step 3: Add license navigation and guard the create branch**

Add:

```ts
const toLicense = () => {
  setupStore.tab = 'licenses'
  appStore.currentPage = '/setup'
  Router.push({ path: '/setup' }).then().catch()
}

const openEditor = (group?: StartupGroup) => {
  if (!group && isAddLocked.value) {
    toLicense()
    return
  }
  editingGroup.value = group
  editorVisible.value = true
}
```

Keep the empty-state button unchanged; with zero groups, `isAddLocked` is false.

- [ ] **Step 4: Run the regression script**

Run:

```bash
yarn test:startup-groups
```

Expected: page license assertions pass; route assertions still fail.

### Task 5: Prefer Startup Groups as the Initial Route

**Files:**
- Modify: `src/render/router/index.ts`
- Modify: `src/render/store/app.ts`
- Test: `scripts/startup-group-test.ts`

- [ ] **Step 1: Change the router redirect**

```ts
redirect: '/startup-group'
```

- [ ] **Step 2: Change the initial current page**

```ts
currentPage: '/startup-group'
```

- [ ] **Step 3: Run the regression script and verify GREEN**

Run:

```bash
yarn test:startup-groups
```

Expected: `startup group tests passed`; existing source assertions confirm the Aside first-visible-module fallback remains present.

### Task 6: Verify the Focused Change

**Files:**
- Verify: `scripts/startup-group-test.ts`
- Verify: `src/render/core/StartupGroup.ts`
- Verify: `src/render/components/StartupGroup/Index.vue`
- Verify: `src/render/router/index.ts`
- Verify: `src/render/store/app.ts`
- Verify: `src/lang/zh/common.json`
- Verify: `src/lang/en/common.json`

- [ ] **Step 1: Run targeted ESLint**

Run:

```bash
npx eslint scripts/startup-group-test.ts src/render/core/StartupGroup.ts src/render/components/StartupGroup/Index.vue src/render/router/index.ts src/render/store/app.ts
```

Expected: exit code 0 with no ESLint errors.

- [ ] **Step 2: Run Vue TypeScript checking**

Run:

```bash
npx vue-tsc --noEmit
```

Expected: exit code 0 with no TypeScript errors.

- [ ] **Step 3: Run regression and whitespace checks**

Run:

```bash
yarn test:startup-groups
git diff --check
```

Expected: tests pass and no whitespace errors are reported.

- [ ] **Step 4: Leave implementation changes uncommitted**

The normal `master` checkout contains existing user-owned and Startup Group changes. Do not stage or commit implementation files unless the user explicitly requests it.
