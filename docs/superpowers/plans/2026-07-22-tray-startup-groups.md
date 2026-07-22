# Tray Startup Groups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show every saved startup group above individual services in both tray menu styles and let users start or stop each group while preserving the existing top-level power control.

**Architecture:** The main renderer remains the sole startup-group runtime owner. It projects saved groups into a typed tray snapshot, both tray implementations render that snapshot, and tray clicks return only a group ID for live resolution and execution in the main renderer.

**Tech Stack:** TypeScript 5.8, Vue 3 Composition API, Pinia, Element Plus, Electron 39, custom `tsx` regression scripts, ESLint, vue-tsc

---

## File Structure

- Create `src/shared/Tray.ts`: cross-process tray snapshot and action contracts.
- Create `src/render/components/StartupGroup/tray.ts`: pure projection from saved startup groups to tray items.
- Create `src/render/tray/StartupGroupItem.vue`: modern tray row for one startup group.
- Modify `src/render/components/Aside/Index.vue`: initialize saved groups, include all groups in tray sync, and execute ID-addressed tray group commands.
- Modify `src/render/tray/store/app.ts`: consume the shared typed tray snapshot.
- Modify `src/render/tray/App.vue`: render startup groups as a section above services.
- Modify `src/main/ui/TrayManager.ts`: render startup groups in the classic native menu.
- Modify `src/main/Application.ts`: relay the new classic tray action to the main renderer.
- Modify `scripts/startup-group-test.ts`: add projection and source-contract regression coverage.

### Task 1: Typed Tray Projection

**Files:**
- Create: `src/shared/Tray.ts`
- Create: `src/render/components/StartupGroup/tray.ts`
- Modify: `scripts/startup-group-test.ts`

- [ ] **Step 1: Write the failing projection test**

Add these imports to `scripts/startup-group-test.ts`:

```ts
import { buildStartupGroupTrayItems } from '../src/render/components/StartupGroup/tray'
import type { StartupGroupTrayState } from '../src/render/components/StartupGroup/tray'
```

Add this test after the `makeGroup` helper:

```ts
{
  const work = new StartupGroupEntity(
    {
      id: 'work',
      name: 'Work',
      color: '#ff6600',
      items: [mysql],
      createdAt: 1,
      updatedAt: 1
    },
    testRunner
  )
  const empty = new StartupGroupEntity(
    { id: 'empty', name: 'Empty', items: [], createdAt: 2, updatedAt: 2 },
    testRunner
  )
  let busy = false
  let executingId = ''
  const state: StartupGroupTrayState = {
    get busy() {
      return busy
    },
    isGroupRunning: (group) => group.id === 'work',
    isGroupExecuting: (group) => group.id === executingId
  }

  assert.deepEqual(buildStartupGroupTrayItems([work, empty], state), [
    {
      id: 'work',
      name: 'Work',
      color: '#ff6600',
      run: true,
      running: false,
      disabled: false
    },
    {
      id: 'empty',
      name: 'Empty',
      color: undefined,
      run: false,
      running: false,
      disabled: true
    }
  ])

  executingId = 'work'
  assert.deepEqual(buildStartupGroupTrayItems([work], state)[0], {
    id: 'work',
    name: 'Work',
    color: '#ff6600',
    run: true,
    running: true,
    disabled: true
  })

  executingId = ''
  busy = true
  assert.equal(buildStartupGroupTrayItems([work], state)[0]?.disabled, true)
}
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```powershell
yarn test:startup-groups
```

Expected: FAIL because `src/render/components/StartupGroup/tray.ts` does not exist.

- [ ] **Step 3: Add the shared tray contracts**

Create `src/shared/Tray.ts`:

```ts
export type TrayAction =
  | 'groupDo'
  | 'startupGroupDo'
  | 'switchChange'
  | 'show'
  | 'exit'

export type TrayModuleItemState = {
  show: boolean
  run: boolean
  running: boolean
  disabled: boolean
}

export type TrayServiceItem = {
  id: string
  label: string
  icon: string
  iconPadding?: number
  typeFlag: string
} & TrayModuleItemState

export type TrayStartupGroupItem = {
  id: string
  name: string
  color?: string
  run: boolean
  running: boolean
  disabled: boolean
}

export interface TrayState {
  password: string
  lang: string
  theme: string
  groupIsRunning: boolean
  groupDisabled: boolean
  startupGroups: TrayStartupGroupItem[]
  service: TrayServiceItem[]
  isMacOS?: boolean
  isLinux?: boolean
  isWindows?: boolean
}
```

- [ ] **Step 4: Implement the pure startup-group tray projection**

Create `src/render/components/StartupGroup/tray.ts`:

```ts
import type { TrayStartupGroupItem } from '@shared/Tray'
import type { StartupGroup } from './class/StartupGroup'

export type StartupGroupTrayState = {
  readonly busy: boolean
  isGroupRunning(group: StartupGroup): boolean
  isGroupExecuting(group: StartupGroup): boolean
}

export const buildStartupGroupTrayItems = (
  groups: StartupGroup[],
  state: StartupGroupTrayState
): TrayStartupGroupItem[] =>
  groups.map((group) => {
    const running = state.isGroupExecuting(group)
    return {
      id: group.id,
      name: group.name,
      color: group.color,
      run: state.isGroupRunning(group),
      running,
      disabled: state.busy || running || group.empty
    }
  })
```

- [ ] **Step 5: Run the focused test to verify it passes**

Run:

```powershell
yarn test:startup-groups
```

Expected: PASS with `startup group tests passed`.

- [ ] **Step 6: Commit the projection contract**

```powershell
git add -- src/shared/Tray.ts src/render/components/StartupGroup/tray.ts scripts/startup-group-test.ts
git commit -m "feat: project startup groups into tray state"
```

### Task 2: Main Renderer Sync and Command Handling

**Files:**
- Modify: `src/render/components/Aside/Index.vue:117-143, 199-270, 541-652, 713-805`
- Modify: `scripts/startup-group-test.ts`

- [ ] **Step 1: Write failing source-contract assertions**

In the existing source-contract block in `scripts/startup-group-test.ts`, read the tray projection and assert the main renderer owns synchronization and execution:

```ts
const startupGroupTraySource = readSource('src/render/components/StartupGroup/tray.ts')

assert.match(asideSource, /startupGroupStore\.init\(\)\.catch\(\)/)
assert.match(asideSource, /buildStartupGroupTrayItems\(startupGroupStore\.groups, StartupGroupManager\)/)
assert.match(asideSource, /startupGroups: startupGroups\.value/)
assert.match(asideSource, /const startupGroupDo = async \(id: string\)/)
assert.match(asideSource, /startupGroupStore\.find\(id\)/)
assert.match(asideSource, /StartupGroupManager\.setGroupEnabled/)
assert.match(asideSource, /startupGroupDo,\s*switchChange/)
assert.match(startupGroupTraySource, /groups\.map\(\(group\)/)
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```powershell
yarn test:startup-groups
```

Expected: FAIL because `Aside/Index.vue` does not initialize, synchronize, or route all saved groups yet.

- [ ] **Step 3: Initialize and project all saved groups**

In `src/render/components/Aside/Index.vue`, add:

```ts
import { buildStartupGroupTrayItems } from '@/components/StartupGroup/tray'
import type { StartupGroup } from '@/components/StartupGroup/class/StartupGroup'
```

Immediately after obtaining `startupGroupStore`, initialize it independently of whether the Startup Group page mounts:

```ts
const startupGroupStore = StartupGroupManager.store
startupGroupStore.init().catch()
```

Create the projection next to the existing tray state computations:

```ts
const startupGroups = computed(() =>
  buildStartupGroupTrayItems(startupGroupStore.groups, StartupGroupManager)
)
```

Add it to the returned `trayStore` object:

```ts
return {
  ...dict,
  password: appStore?.config?.password,
  lang: appStore?.config?.setup?.lang,
  theme: appStore?.config?.setup?.theme,
  groupDisabled: groupDisabled.value,
  groupIsRunning: groupIsRunning.value,
  startupGroups: startupGroups.value,
  customerModule: customerModule.value,
  isWindows: window.Server.isWindows,
  isMacOS: window.Server.isMacOS,
  isLinux: window.Server.isLinux
}
```

- [ ] **Step 4: Reuse one execution path for default and selected groups**

Replace the startup-group branch inside the current `groupDo` implementation with this shared helper and handlers:

```ts
const executeStartupGroup = async (group: StartupGroup) => {
  if (StartupGroupManager.busy || group.empty) return

  startupGroupBusy.value = true
  try {
    const result = await StartupGroupManager.setGroupEnabled(
      group,
      !StartupGroupManager.isGroupRunning(group)
    )
    if (!result) return
    const message = startupGroupResultMessage(result)
    if (result.members.some((item) => ['failed', 'invalid'].includes(item.outcome))) {
      MessageError(message)
    } else {
      MessageSuccess(message || I18nT('base.success'))
    }
  } catch (error) {
    MessageError(error instanceof Error ? error.message : `${error}`)
  } finally {
    startupGroupBusy.value = false
    await refreshStartupGroupState()
  }
}

const groupDo = async () => {
  if (groupDisabled.value) return

  const group = defaultStartupGroup.value
  if (!group && startupGroupConfig.value.defaultStartupGroupId) {
    await startupGroupStore.setDefault()
  }

  if (resolveGroupExecutionRoute(startupGroupsVisible.value, group) === 'legacy') {
    legacyGroupDo()
    return
  }

  await executeStartupGroup(group!)
}

const startupGroupDo = async (id: string) => {
  const group = startupGroupStore.find(id)
  if (!group) return
  await executeStartupGroup(group)
}
```

Add `startupGroupDo` to the command dispatch table:

```ts
const fns: { [k: string]: CallbackFn } = {
  groupDo,
  startupGroupDo,
  switchChange
}
```

- [ ] **Step 5: Run the focused test and type-check the renderer changes**

Run:

```powershell
yarn test:startup-groups
npx vue-tsc --noEmit
```

Expected: both commands PASS with no TypeScript diagnostics.

- [ ] **Step 6: Commit main-renderer synchronization**

```powershell
git add -- src/render/components/Aside/Index.vue scripts/startup-group-test.ts
git commit -m "feat: sync startup groups with tray"
```

### Task 3: Modern Tray Startup-Group Section

**Files:**
- Create: `src/render/tray/StartupGroupItem.vue`
- Modify: `src/render/tray/store/app.ts`
- Modify: `src/render/tray/App.vue`
- Modify: `scripts/startup-group-test.ts`

- [ ] **Step 1: Write failing modern-tray source-contract assertions**

In the source-contract block in `scripts/startup-group-test.ts`, read the modern tray files and add:

```ts
const trayAppSource = readSource('src/render/tray/App.vue')
const trayStartupGroupItemSource = readSource('src/render/tray/StartupGroupItem.vue')
const trayStoreSource = readSource('src/render/tray/store/app.ts')

assert.match(trayStoreSource, /TrayState/)
assert.match(trayAppSource, /v-for="group in startupGroups"/)
assert.match(trayAppSource, /<StartupGroupItem :item="group"/)
assert.match(trayAppSource, /startupGroups\.length && service\.length/)
assert.ok(
  trayAppSource.indexOf('v-for="group in startupGroups"') <
    trayAppSource.indexOf('v-for="item in service"')
)
assert.match(trayStartupGroupItemSource, /item\.color \|\| '#409eff'/)
assert.match(trayStartupGroupItemSource, /:model-value="item\.run"/)
assert.match(trayStartupGroupItemSource, /:disabled="item\.disabled"/)
assert.match(trayStartupGroupItemSource, /:loading="item\.running"/)
assert.match(
  trayStartupGroupItemSource,
  /IPC\.send\('APP:Tray-Command', 'startupGroupDo', props\.item\.id\)/
)
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```powershell
yarn test:startup-groups
```

Expected: FAIL because `StartupGroupItem.vue` does not exist and the modern tray has no group section.

- [ ] **Step 3: Use the shared state contract in the tray Pinia store**

Replace the local item and state declarations in `src/render/tray/store/app.ts` with imports and initialize the new collection:

```ts
import { defineStore } from 'pinia'
import type { TrayServiceItem, TrayState } from '@shared/Tray'

export type CustomerModuleItem = TrayServiceItem
export type { TrayState }

const state: TrayState = {
  lang: '',
  theme: '',
  password: '',
  groupIsRunning: false,
  groupDisabled: true,
  startupGroups: [],
  service: [],
  isMacOS: undefined,
  isLinux: undefined,
  isWindows: undefined
}

export const AppStore = defineStore('trayApp', {
  state: (): TrayState => state,
  getters: {},
  actions: {}
})
```

- [ ] **Step 4: Create the modern startup-group row**

Create `src/render/tray/StartupGroupItem.vue`:

```vue
<template>
  <li class="non-draggable startup-group-item">
    <div class="left">
      <span
        class="startup-group-color"
        :style="{ backgroundColor: item.color || '#409eff' }"
      ></span>
      <span class="title">{{ item.name }}</span>
    </div>
    <el-switch
      :model-value="item.run"
      :disabled="item.disabled"
      :loading="item.running"
      @change="startupGroupDo"
    />
  </li>
</template>

<script lang="ts" setup>
  import type { TrayStartupGroupItem } from '@shared/Tray'
  import IPC from '@/util/IPC'

  const props = defineProps<{
    item: TrayStartupGroupItem
  }>()

  const startupGroupDo = () => {
    IPC.send('APP:Tray-Command', 'startupGroupDo', props.item.id).then((key: string) => {
      IPC.off(key)
    })
  }
</script>
```

- [ ] **Step 5: Render startup groups above services with a conditional separator**

In `src/render/tray/App.vue`, replace the current service-only scroll area with:

```vue
<div class="menu-scroll">
  <el-scrollbar>
    <ul v-if="startupGroups.length" class="menu startup-group-menu">
      <StartupGroupItem v-for="group in startupGroups" :key="group.id" :item="group" />
    </ul>
    <div
      v-if="startupGroups.length && service.length"
      class="tray-menu-separator"
    ></div>
    <ul v-if="service.length" class="menu service-menu">
      <CustomerItem v-for="item in service" :key="item.id" :item="item" />
    </ul>
  </el-scrollbar>
</div>
```

Import the component and expose the group collection:

```ts
import StartupGroupItem from './StartupGroupItem.vue'

const startupGroups = computed(() => store.startupGroups)
```

Rename the existing `.top-menu` flex/overflow rule to `.menu-scroll`, then add these styles under `.tray-aside-inner`:

```scss
.menu-scroll {
  flex: 1;
  overflow: hidden;
}

.startup-group-color {
  width: 10px;
  height: 10px;
  border-radius: 9999px;
  flex-shrink: 0;
}

.tray-menu-separator {
  margin: 4px 18px;
  border-top: 1px solid currentColor;
  opacity: 0.16;
}
```

- [ ] **Step 6: Run the focused tests and lint the modern tray**

Run:

```powershell
yarn test:startup-groups
npx eslint src/shared/Tray.ts src/render/components/StartupGroup/tray.ts src/render/tray/store/app.ts src/render/tray/App.vue src/render/tray/StartupGroupItem.vue scripts/startup-group-test.ts
```

Expected: both commands PASS.

- [ ] **Step 7: Commit the modern tray section**

```powershell
git add -- src/render/tray/store/app.ts src/render/tray/App.vue src/render/tray/StartupGroupItem.vue scripts/startup-group-test.ts
git commit -m "feat: show startup groups in modern tray"
```

### Task 4: Classic Tray Section and Action Relay

**Files:**
- Modify: `src/main/ui/TrayManager.ts:1-125`
- Modify: `src/main/Application.ts:1-20, 458-469, 522-550`
- Modify: `scripts/startup-group-test.ts`

- [ ] **Step 1: Write failing classic-tray and relay assertions**

In the source-contract block in `scripts/startup-group-test.ts`, read the main-process tray files and add:

```ts
const trayManagerSource = readSource('src/main/ui/TrayManager.ts')
const applicationSource = readSource('src/main/Application.ts')

assert.match(trayManagerSource, /status: TrayState \| undefined/)
assert.match(trayManagerSource, /const startupGroups = status\?\.startupGroups \?\? \[\]/)
assert.ok(
  trayManagerSource.indexOf('for (const group of startupGroups)') <
    trayManagerSource.indexOf('for (const item of service)')
)
assert.match(trayManagerSource, /label: group\.name/)
assert.match(trayManagerSource, /enabled: !group\.disabled && !group\.running/)
assert.match(trayManagerSource, /this\.emit\('action', 'startupGroupDo', group\.id\)/)
assert.match(trayManagerSource, /startupGroups\.length > 0 && service\.length > 0/)
assert.match(applicationSource, /case 'startupGroupDo':/)
assert.match(
  applicationSource,
  /'APP:Tray-Command',[\s\S]*?'startupGroupDo',[\s\S]*?typeFlag/
)
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```powershell
yarn test:startup-groups
```

Expected: FAIL because the classic tray and `Application` do not know `startupGroupDo`.

- [ ] **Step 3: Type and render the classic startup-group section**

In `src/main/ui/TrayManager.ts`, import the shared types:

```ts
import type { TrayState } from '@shared/Tray'
```

Change the status field and method signature:

```ts
status: TrayState | undefined

menuChange(status: TrayState) {
```

After the existing top-level control and its separator, build the startup-group section before the service loop:

```ts
const startupGroups = status?.startupGroups ?? []
const service = status?.service ?? []

for (const group of startupGroups) {
  menus.push({
    label: group.name,
    type: 'normal',
    enabled: !group.disabled && !group.running,
    icon: group.run ? this.runIcon : this.stopIcon,
    click: () => {
      this.emit('action', 'startupGroupDo', group.id)
    }
  })
}

if (startupGroups.length > 0 && service.length > 0) {
  menus.push({ type: 'separator' })
}

for (const item of service) {
  menus.push({
    label: item.label,
    type: 'normal',
    enabled: !item.disabled && !item.running,
    icon: item.run ? this.runIcon : this.stopIcon,
    click: () => {
      this.emit('action', 'switchChange', item?.typeFlag ?? item?.id)
    }
  })
}

if (startupGroups.length > 0 || service.length > 0) {
  menus.push({ type: 'separator' })
}
```

Remove the old service-only block and its unconditional trailing separator. This produces `top control → separator → groups → conditional separator → services → separator → window actions` without duplicate empty-section separators.

- [ ] **Step 4: Relay the new native tray action**

In `src/main/Application.ts`, import and use `TrayAction`:

```ts
import type { TrayAction } from '@shared/Tray'
```

Change both tray action annotations to `TrayAction`, then add the switch branch:

```ts
case 'startupGroupDo':
  this.windowManager.sendCommandTo(
    this.mainWindow!,
    'APP:Tray-Command',
    'APP:Tray-Command',
    'startupGroupDo',
    typeFlag
  )
  break
```

Keep the existing `groupDo`, `switchChange`, `show`, and `exit` branches unchanged.

- [ ] **Step 5: Run focused tests, lint, and type-check**

Run:

```powershell
yarn test:startup-groups
npx eslint src/main/ui/TrayManager.ts src/main/Application.ts scripts/startup-group-test.ts
npx vue-tsc --noEmit
```

Expected: all commands PASS.

- [ ] **Step 6: Commit classic tray support**

```powershell
git add -- src/main/ui/TrayManager.ts src/main/Application.ts scripts/startup-group-test.ts
git commit -m "feat: show startup groups in classic tray"
```

### Task 5: Full Verification and Manual Acceptance

**Files:**
- Verify: all files changed in Tasks 1-4

- [ ] **Step 1: Run the startup-group regression suite**

Run:

```powershell
yarn test:startup-groups
```

Expected: PASS with `startup group tests passed`.

- [ ] **Step 2: Run focused lint over every changed source file**

Run:

```powershell
npx eslint src/shared/Tray.ts src/render/components/StartupGroup/tray.ts src/render/components/Aside/Index.vue src/render/tray/store/app.ts src/render/tray/App.vue src/render/tray/StartupGroupItem.vue src/main/ui/TrayManager.ts src/main/Application.ts scripts/startup-group-test.ts
```

Expected: PASS with no lint errors.

- [ ] **Step 3: Run the project type-check**

Run:

```powershell
npx vue-tsc --noEmit
```

Expected: PASS with no TypeScript diagnostics.

- [ ] **Step 4: Check patch hygiene and repository state**

Run:

```powershell
git diff --check
git status --short
```

Expected: `git diff --check` produces no output. `git status --short` lists only intentional plan or implementation files that have not already been committed.

- [ ] **Step 5: Perform manual tray acceptance in both styles**

Run:

```powershell
yarn dev
```

Verify:

1. Create at least two saved startup groups and leave one group empty.
2. In modern tray style, confirm saved groups appear in saved order above individual services, the empty group is disabled, and a separator divides the sections.
3. Start and stop each non-empty group from its own switch and confirm the switches refresh as member services change.
4. Confirm the top-level power button still toggles the default group and the individual service switches still work.
5. Switch to classic tray style and repeat the ordering, disabled-state, start/stop, top-level, and individual-service checks.
6. Delete a group while a tray snapshot is open, then select the stale entry if the platform leaves it visible; confirm no unintended group is executed.

Expected: both tray styles match the approved design with no duplicate separators or command-routing regressions.

- [ ] **Step 6: Commit any verification-only corrections**

If manual or automated verification required a correction, stage only the correction and its regression test:

```powershell
git add -- src scripts/startup-group-test.ts
git commit -m "fix: harden tray startup group controls"
```

If no correction was needed, do not create an empty commit.
