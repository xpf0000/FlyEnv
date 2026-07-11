# Startup Group Card Live Status Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Startup Group card status/buttons with live group/member switches, a default checkbox, and small icon actions without copying service runtime state into the page or a second cache.

**Architecture:** Add a dependency-injected `StartupGroupManager` class in renderer core and export a real singleton with `reactiveBind(new StartupGroupManager(...))` from the Startup Group component area. The manager resolves `StartupGroupItem` records to the existing reactive `BrewStore` version objects or `ProjectSetup` service objects, derives state on demand, and delegates operations to the existing runner. `Index.vue` coordinates configuration and result messages; `GroupCard.vue` renders state derived from the singleton.

**Tech Stack:** TypeScript 5.8, Vue 3 Composition API, Element Plus, existing FlyEnv `reactiveBind`, existing `scripts/startup-group-test.ts` assertion harness.

---

## File Structure

- Create `src/render/core/StartupGroupManager.ts`: dependency-injected manager class, live target resolution, derived state, loading/busy state, and group/member execution methods.
- Create `src/render/components/StartupGroup/setup.ts`: wire `BrewStore`, `ProjectSetup`, `startupGroupRuntime`, and `reactiveBind` into the exported `StartupGroupSetup` singleton.
- Modify `scripts/startup-group-test.ts`: add manager behavior tests and source-contract assertions for the singleton, page data flow, and card controls.
- Modify `src/render/components/StartupGroup/Index.vue`: remove page-owned state maps, candidates, polling, and refresh orchestration; initialize global sources and delegate operations to the manager.
- Modify `src/render/components/StartupGroup/GroupCard.vue`: implement header/member switches, footer checkbox, and small edit/delete icon buttons.
- Do not modify translations: existing `common.startupGroup.default`, `common.startupGroup.noRemark`, `common.action.edit`, and `common.action.delete` cover the UI.

The worktree already contains user edits in `Index.vue` and `GroupEditor.vue`. Apply patches only to the Startup Group bindings and script sections described below. Never replace either file wholesale, and never stage `GroupEditor.vue`.

### Task 1: Add the live-target manager with test-first behavior

**Files:**
- Create: `src/render/core/StartupGroupManager.ts`
- Modify: `scripts/startup-group-test.ts`

- [ ] **Step 1: Write failing manager tests**

Add imports for `StartupGroupManager` and `StartupGroupRunner`, then add independent assertion blocks covering live state, group direction, member direction, invalid targets, busy protection, and source initialization:

```ts
import { StartupGroupManager } from '../src/render/core/StartupGroupManager'
import type { StartupGroupRunner } from '../src/render/core/StartupGroup'

{
  const service = {
    version: '8.4.0',
    bin: 'mysqld',
    path: mysql.versionPath,
    enable: true,
    run: false,
    running: false,
    start: async () => true,
    stop: async () => true
  }
  const project = {
    id: api.projectId,
    comment: 'API service',
    path: api.projectPath,
    isService: true,
    state: { isRun: false, running: false },
    start: async () => true,
    stop: async () => true
  }
  const calls: Array<{ group: StartupGroup; action: 'start' | 'stop' }> = []
  let executing = false
  const runner: Pick<StartupGroupRunner, 'isExecuting' | 'run'> = {
    get isExecuting() {
      return executing
    },
    run: async (group: StartupGroup, action: 'start' | 'stop') => {
      calls.push({ group, action })
      return { action, members: [] }
    }
  }
  const fetched: string[] = []
  const manager = new StartupGroupManager({
    runner,
    getInstalled: () => [service],
    fetchInstalled: async (module) => {
      fetched.push(`installed:${module}`)
    },
    getProjectSource: () => ({
      fetched: false,
      project: [project],
      fetchProject: async () => {
        fetched.push('project:node')
      }
    })
  })

  assert.equal(manager.getMemberState(mysql), 'stopped')
  service.run = true
  assert.equal(manager.getMemberState(mysql), 'running')
  service.running = true
  assert.equal(manager.getMemberState(mysql), 'executing')
  assert.equal(manager.isMemberRunning(mysql), true)
  assert.equal(manager.isGroupExecuting(makeGroup('executing', [mysql, api])), true)
  assert.equal(manager.isMemberDisabled(makeGroup('executing', [mysql, api]), api), true)
  service.running = false
  assert.equal(manager.getMemberTitle(mysql), '8.4.0')

  assert.equal(manager.getMemberState(api), 'stopped')
  project.state.isRun = true
  assert.equal(manager.getMemberState(api), 'running')
  assert.equal(manager.isMemberRunning(api), true)
  assert.equal(manager.getMemberTitle(api), 'API service')
  assert.equal(manager.getMemberPath(api), api.projectPath)
  assert.equal(manager.isGroupRunning(makeGroup('live', [mysql, api])), true)

  await manager.setGroupEnabled(makeGroup('partial', [mysql, redis]), false)
  assert.equal(calls.at(-1)?.action, 'stop')
  await manager.setGroupEnabled(makeGroup('stopped', [redis]), true)
  assert.equal(calls.at(-1)?.action, 'start')
  await manager.setMemberEnabled(makeGroup('single', [mysql, api]), api, false)
  assert.equal(calls.at(-1)?.action, 'stop')
  assert.deepEqual(calls.at(-1)?.group.items, [api])

  assert.equal(manager.getMemberState(redis), 'invalid')
  assert.equal(manager.isMemberDisabled(makeGroup('invalid', [redis]), redis), true)
  executing = true
  const callCount = calls.length
  assert.equal(await manager.setMemberEnabled(makeGroup('busy', [mysql]), mysql, false), undefined)
  assert.equal(calls.length, callCount)
  executing = false

  await manager.ensureSources([makeGroup('sources', [mysql, api])])
  assert.deepEqual(fetched, ['installed:mysql', 'project:node'])
}
```

- [ ] **Step 2: Run the Startup Group test and verify RED**

Run:

```powershell
yarn test:startup-groups
```

Expected: FAIL with `Cannot find module .../StartupGroupManager`.

- [ ] **Step 3: Implement the minimal manager class**

Create `src/render/core/StartupGroupManager.ts` with these public types and methods:

```ts
import type {
  StartupGroup,
  StartupGroupItem,
  StartupGroupMemberState,
  StartupGroupRunResult,
  StartupGroupRunner
} from './StartupGroup'
import type {
  StartupGroupInstalledTarget,
  StartupGroupProjectTarget
} from './StartupGroupRuntime'
import type { AllAppModule } from './type'

export type StartupGroupProjectSource = {
  fetched: boolean
  project: StartupGroupProjectTarget[]
  fetchProject(): Promise<unknown>
}

export type StartupGroupManagerDependencies = {
  runner: Pick<StartupGroupRunner, 'isExecuting' | 'run'>
  getInstalled(module: AllAppModule): StartupGroupInstalledTarget[]
  fetchInstalled(module: AllAppModule): Promise<unknown>
  getProjectSource(module: AllAppModule): StartupGroupProjectSource
}

export type StartupGroupResolvedMember =
  | { type: 'service-version'; target: StartupGroupInstalledTarget }
  | { type: 'language-project'; target: StartupGroupProjectTarget }

export class StartupGroupManager {
  private loadingCount = 0

  constructor(private readonly dependencies: StartupGroupManagerDependencies) {}

  get loading() {
    return this.loadingCount > 0
  }

  get busy() {
    return this.loading || this.dependencies.runner.isExecuting
  }

  private installedModule(item: StartupGroupItem): AllAppModule {
    return item.type === 'service-version' && item.module === 'php-fpm' ? 'php' : item.module
  }

  resolveMember(item: StartupGroupItem): StartupGroupResolvedMember | undefined {
    if (item.type === 'service-version') {
      const target = this.dependencies
        .getInstalled(this.installedModule(item))
        .find((candidate) => candidate.path === item.versionPath)
      return target ? { type: item.type, target } : undefined
    }
    const target = this.dependencies
      .getProjectSource(item.module)
      .project.find(
        (candidate) =>
          candidate.id === item.projectId &&
          candidate.path === item.projectPath &&
          candidate.isService
      )
    return target ? { type: item.type, target } : undefined
  }

  getMemberState(item: StartupGroupItem): StartupGroupMemberState {
    const resolved = this.resolveMember(item)
    if (!resolved) return 'invalid'
    if (resolved.type === 'service-version') {
      if (resolved.target.running) return 'executing'
      return this.isMemberRunning(item) ? 'running' : 'stopped'
    }
    if (resolved.target.state.running) return 'executing'
    return this.isMemberRunning(item) ? 'running' : 'stopped'
  }

  isMemberRunning(item: StartupGroupItem) {
    const resolved = this.resolveMember(item)
    if (resolved?.type === 'service-version') return resolved.target.run
    if (resolved?.type === 'language-project') return resolved.target.state.isRun
    return false
  }

  getMemberTitle(item: StartupGroupItem) {
    const resolved = this.resolveMember(item)
    if (resolved?.type === 'service-version') {
      return resolved.target.version || item.versionBin
    }
    if (resolved?.type === 'language-project') return resolved.target.comment?.trim() || ''
    return item.type === 'service-version' ? item.versionBin : ''
  }

  getMemberPath(item: StartupGroupItem) {
    const resolved = this.resolveMember(item)
    return resolved?.type === 'language-project' ? resolved.target.path : undefined
  }

  isGroupRunning(group: StartupGroup) {
    return group.items.some((item) => this.isMemberRunning(item))
  }

  isGroupExecuting(group: StartupGroup) {
    return group.items.some((item) => this.getMemberState(item) === 'executing')
  }

  isMemberDisabled(group: StartupGroup, item: StartupGroupItem) {
    return this.busy || this.isGroupExecuting(group) || this.getMemberState(item) === 'invalid'
  }

  async ensureSources(groups: StartupGroup[]) {
    const installed = new Set<AllAppModule>()
    const projects = new Set<AllAppModule>()
    for (const item of groups.flatMap((group) => group.items)) {
      if (item.type === 'service-version') installed.add(this.installedModule(item))
      else projects.add(item.module)
    }
    this.loadingCount += 1
    try {
      await Promise.all([
        ...[...installed].map((module) => this.dependencies.fetchInstalled(module)),
        ...[...projects].map(async (module) => {
          const source = this.dependencies.getProjectSource(module)
          if (!source.fetched) await source.fetchProject()
        })
      ])
    } finally {
      this.loadingCount -= 1
    }
  }

  setGroupEnabled(
    group: StartupGroup,
    enabled: boolean
  ): Promise<StartupGroupRunResult | undefined> {
    if (this.busy) return Promise.resolve(undefined)
    return this.dependencies.runner.run(group, enabled ? 'start' : 'stop')
  }

  setMemberEnabled(
    group: StartupGroup,
    item: StartupGroupItem,
    enabled: boolean
  ): Promise<StartupGroupRunResult | undefined> {
    if (this.busy) return Promise.resolve(undefined)
    return this.dependencies.runner.run({ ...group, items: [item] }, enabled ? 'start' : 'stop')
  }
}
```

- [ ] **Step 4: Run the Startup Group test and verify GREEN**

Run `yarn test:startup-groups`.

Expected: `startup group tests passed`.

- [ ] **Step 5: Commit the isolated core/test change**

```powershell
git add -- src/render/core/StartupGroupManager.ts scripts/startup-group-test.ts
git diff --cached --check
git commit -m "feat: add startup group live state manager"
```

Expected: only those two files are staged.

### Task 2: Wire the reactive singleton to FlyEnv global sources

**Files:**
- Create: `src/render/components/StartupGroup/setup.ts`
- Modify: `scripts/startup-group-test.ts`

- [ ] **Step 1: Add failing source-contract assertions**

Add `setupSource` to the existing `readSource` block and assert the required class singleton wiring:

```ts
const startupGroupSetupSource = readSource('src/render/components/StartupGroup/setup.ts')
assert.match(startupGroupSetupSource, /new StartupGroupManager/)
assert.match(startupGroupSetupSource, /reactiveBind\(/)
assert.match(startupGroupSetupSource, /export const StartupGroupSetup/)
assert.match(startupGroupSetupSource, /BrewStore\(\)\.module/)
assert.match(startupGroupSetupSource, /ProjectSetup/)
assert.match(startupGroupSetupSource, /startupGroupRuntime\.runner/)
```

- [ ] **Step 2: Run the test and verify RED**

Run `yarn test:startup-groups`.

Expected: FAIL because `setup.ts` does not exist.

- [ ] **Step 3: Create the singleton wiring**

Create `src/render/components/StartupGroup/setup.ts`:

```ts
import { StartupGroupManager } from '@/core/StartupGroupManager'
import type { AllAppModule } from '@/core/type'
import { BrewStore } from '@/store/brew'
import { reactiveBind } from '@/util/Index'
import { ProjectSetup } from '@/components/LanguageProjects/setup'
import { startupGroupRuntime } from './runtime'

export const StartupGroupSetup = reactiveBind(
  new StartupGroupManager({
    runner: startupGroupRuntime.runner,
    getInstalled: (module: AllAppModule) => BrewStore().module(module).installed,
    fetchInstalled: (module: AllAppModule) => BrewStore().module(module).fetchInstalled(),
    getProjectSource: (module: AllAppModule) => ProjectSetup(module)
  })
)
```

- [ ] **Step 4: Run the test and verify GREEN**

Run `yarn test:startup-groups`.

Expected: `startup group tests passed`.

- [ ] **Step 5: Commit the isolated singleton change**

```powershell
git add -- src/render/components/StartupGroup/setup.ts scripts/startup-group-test.ts
git diff --cached --check
git commit -m "feat: expose startup group reactive manager"
```

Expected: only `setup.ts` and the test harness are staged.

### Task 3: Remove page-owned runtime state and delegate actions

**Files:**
- Modify: `src/render/components/StartupGroup/Index.vue`
- Modify: `scripts/startup-group-test.ts`

- [ ] **Step 1: Replace old Index source contracts with failing new contracts**

In the existing source-contract block, remove assertions requiring `stateMap`, `runningMap`, refresh generations, runner revisions, and the two-second timer. Add:

```ts
assert.match(indexSource, /StartupGroupSetup\.ensureSources/)
assert.match(indexSource, /StartupGroupSetup\.setGroupEnabled/)
assert.match(indexSource, /StartupGroupSetup\.setMemberEnabled/)
assert.match(indexSource, /@group-change="executeGroup"/)
assert.match(indexSource, /@member-change="executeMember"/)
assert.doesNotMatch(indexSource, /stateMap/)
assert.doesNotMatch(indexSource, /runningMap/)
assert.doesNotMatch(indexSource, /setInterval/)
assert.doesNotMatch(indexSource, /runner\.getItemState/)
```

- [ ] **Step 2: Run the test and verify RED**

Run `yarn test:startup-groups`.

Expected: FAIL because `Index.vue` still owns maps and polling.

- [ ] **Step 3: Make the minimal template binding change**

Preserve the user's existing `.main-block`, `el-scrollbar`, and grid changes. Change only the `GroupCard` attributes/events to:

```vue
<GroupCard
  v-for="group in groups"
  :key="group.id"
  :group="group"
  :is-default="config.defaultStartupGroupId === group.id"
  @group-change="executeGroup"
  @member-change="executeMember"
  @edit="openEditor"
  @delete="removeGroup"
  @default-change="defaultChange"
/>
```

- [ ] **Step 4: Replace page state orchestration with manager calls**

Keep editor/default/delete functions. Remove `computed`, `onBeforeUnmount`, `reactive`, candidates, state maps, timer variables, `candidateByKey`, `fetchGroupState`, `refreshOnce`, `refreshAll`, and runner revision watchers. Import `StartupGroupSetup` and use:

```ts
import { onMounted, ref, watch } from 'vue'
import { StartupGroupSetup } from './setup'

const itemLabel = (item: StartupGroupItem) =>
  StartupGroupSetup.getMemberTitle(item) ||
  (item.type === 'service-version'
    ? `${item.module} · ${item.versionBin}`
    : `${item.module} · ${item.projectId}`)

const execute = async (
  operation: () => Promise<StartupGroupRunResult | undefined>
) => {
  try {
    const result = await operation()
    if (!result) return
    const hasError = result.members.some((item) => ['failed', 'invalid'].includes(item.outcome))
    if (hasError) MessageError(resultMessage(result))
    else MessageSuccess(resultMessage(result))
  } catch (error) {
    MessageError(error instanceof Error ? error.message : `${error}`)
  }
}

const executeGroup = (group: StartupGroup, enabled: boolean) =>
  execute(() => StartupGroupSetup.setGroupEnabled(group, enabled))

const executeMember = (
  group: StartupGroup,
  item: StartupGroupItem,
  enabled: boolean
) => execute(() => StartupGroupSetup.setMemberEnabled(group, item, enabled))

const ensureSources = () =>
  StartupGroupSetup.ensureSources(groups.value).catch((error) => {
    MessageError(error instanceof Error ? error.message : `${error}`)
  })

const refreshAfterMutation = async () => {
  editingGroup.value = undefined
  await ensureSources()
}

watch(
  () => groups.value.map((group) => `${group.id}:${group.updatedAt}`).join('|'),
  ensureSources
)
onMounted(ensureSources)
```

Keep the existing `ElMessageBox` delete confirmation and configuration store calls unchanged.

- [ ] **Step 5: Run the test and verify GREEN**

Run `yarn test:startup-groups`.

Expected: `startup group tests passed`.

- [ ] **Step 6: Preserve the dirty-worktree boundary**

Run:

```powershell
git diff -- src/render/components/StartupGroup/Index.vue
git status --short
```

Confirm the diff still contains the user's pre-existing layout changes plus the new manager delegation, and that `GroupEditor.vue` remains modified but untouched by this task. Do not stage or commit `Index.vue` while it contains inseparable pre-existing user edits.

### Task 4: Redesign GroupCard controls

**Files:**
- Modify: `src/render/components/StartupGroup/GroupCard.vue`
- Modify: `scripts/startup-group-test.ts`

- [ ] **Step 1: Add failing card source-contract assertions**

Replace the old `default-change`-only assertion with:

```ts
assert.match(cardSource, /StartupGroupSetup\.isGroupRunning/)
assert.match(cardSource, /StartupGroupSetup\.isMemberRunning/)
assert.match(cardSource, /StartupGroupSetup\.isMemberDisabled/)
assert.match(cardSource, /@change="groupChange"/)
assert.match(cardSource, /@change="memberChange\(item, \$event\)"/)
assert.match(cardSource, /<el-checkbox/)
assert.match(cardSource, /:icon="Edit"/)
assert.match(cardSource, /:icon="Delete"/)
assert.match(cardSource, /size="small"/)
assert.match(cardSource, /<el-tooltip/)
assert.doesNotMatch(cardSource, /<el-tag/)
assert.doesNotMatch(cardSource, /common\.action\.start/)
assert.doesNotMatch(cardSource, /common\.action\.stop/)
```

- [ ] **Step 2: Run the test and verify RED**

Run `yarn test:startup-groups`.

Expected: FAIL because the current card still uses a tag, text buttons, and a default switch.

- [ ] **Step 3: Implement the header and member controls**

Use the existing color/name/description header, placing this group switch at the right:

```vue
<el-switch
  :model-value="groupRunning"
  :disabled="groupDisabled"
  @change="groupChange"
/>
```

Replace counts/tags/text buttons with member rows:

```vue
<div v-if="group.items.length" class="flex flex-col gap-2">
  <div
    v-for="item in group.items"
    :key="item.id"
    class="flex items-center justify-between gap-3 rounded border border-zinc-200 px-3 py-2 dark:border-zinc-700"
  >
    <div class="min-w-0 flex-1">
      <div class="truncate text-sm font-medium">
        {{ memberTitle(item) || I18nT('common.startupGroup.noRemark') }}
      </div>
      <div v-if="memberPath(item)" class="mt-1 truncate text-xs text-zinc-500">
        {{ memberPath(item) }}
      </div>
    </div>
    <el-switch
      :model-value="memberRunning(item)"
      :disabled="StartupGroupSetup.isMemberDisabled(group, item)"
      @change="memberChange(item, $event)"
    />
  </div>
</div>
<span v-else class="text-sm text-zinc-400">
  {{ I18nT('common.startupGroup.emptyMembers') }}
</span>
```

- [ ] **Step 4: Implement footer checkbox and icon actions**

Use:

```vue
<template #footer>
  <div class="flex items-center justify-between gap-3">
    <el-checkbox
      :model-value="isDefault"
      :disabled="defaultDisabled"
      @change="defaultChange"
    >
      {{ I18nT('common.startupGroup.default') }}
    </el-checkbox>
    <div class="flex items-center gap-2">
      <el-tooltip :content="I18nT('common.action.edit')" placement="top">
        <el-button :icon="Edit" size="small" circle @click="emit('edit', group)" />
      </el-tooltip>
      <el-tooltip :content="I18nT('common.action.delete')" placement="top">
        <el-button
          :icon="Delete"
          size="small"
          circle
          type="danger"
          plain
          @click="emit('delete', group)"
        />
      </el-tooltip>
    </div>
  </div>
</template>
```

- [ ] **Step 5: Replace GroupCard props/computed/events**

Import `Delete`, `Edit`, `computed`, `StartupGroupItem`, and `StartupGroupSetup`. Keep only `group` and `isDefault` props. Define:

```ts
const emit = defineEmits<{
  'group-change': [group: StartupGroup, enabled: boolean]
  'member-change': [group: StartupGroup, item: StartupGroupItem, enabled: boolean]
  edit: [group: StartupGroup]
  delete: [group: StartupGroup]
  'default-change': [group: StartupGroup, enabled: boolean]
}>()

const groupRunning = computed(() => StartupGroupSetup.isGroupRunning(props.group))
const groupDisabled = computed(
  () =>
    StartupGroupSetup.busy ||
    StartupGroupSetup.isGroupExecuting(props.group) ||
    props.group.items.length === 0
)
const defaultDisabled = computed(
  () => StartupGroupSetup.busy || props.group.items.length === 0
)
const memberTitle = (item: StartupGroupItem) => StartupGroupSetup.getMemberTitle(item)
const memberPath = (item: StartupGroupItem) => StartupGroupSetup.getMemberPath(item)
const memberRunning = (item: StartupGroupItem) => StartupGroupSetup.isMemberRunning(item)
const booleanValue = (value: string | number | boolean) => value === true
const groupChange = (value: string | number | boolean) =>
  emit('group-change', props.group, booleanValue(value))
const memberChange = (item: StartupGroupItem, value: string | number | boolean) =>
  emit('member-change', props.group, item, booleanValue(value))
const defaultChange = (value: string | number | boolean) =>
  emit('default-change', props.group, booleanValue(value))
```

Remove obsolete status-label/type/start/stop computed values and props. Adjust `.el-card__body` minimum height only if the new member list requires it; do not impose a fixed height that clips rows.

- [ ] **Step 6: Run the test and verify GREEN**

Run `yarn test:startup-groups`.

Expected: `startup group tests passed`.

- [ ] **Step 7: Keep overlapping user work unstaged**

Stage and commit only `GroupCard.vue` and the test harness if `scripts/startup-group-test.ts` contains no unrelated user edits:

```powershell
git add -- src/render/components/StartupGroup/GroupCard.vue scripts/startup-group-test.ts
git diff --cached --check
git diff --cached --name-only
```

Expected staged paths: `GroupCard.vue` and `scripts/startup-group-test.ts`. Then commit:

```powershell
git commit -m "feat: redesign startup group card controls"
```

Leave `Index.vue` and `GroupEditor.vue` unstaged.

### Task 5: Full verification and requirement audit

**Files:**
- Verify all modified files; do not add new behavior.

- [ ] **Step 1: Format the touched implementation files**

Run:

```powershell
npx prettier --write src/render/core/StartupGroupManager.ts src/render/components/StartupGroup/setup.ts src/render/components/StartupGroup/Index.vue src/render/components/StartupGroup/GroupCard.vue scripts/startup-group-test.ts
```

Expected: exit code 0. Review `Index.vue` afterward to ensure formatting did not disturb the user's layout edits.

- [ ] **Step 2: Run the focused regression test**

Run `yarn test:startup-groups`.

Expected: `startup group tests passed` and exit code 0.

- [ ] **Step 3: Run targeted ESLint**

Run:

```powershell
npx eslint src/render/core/StartupGroupManager.ts src/render/components/StartupGroup/setup.ts src/render/components/StartupGroup/Index.vue src/render/components/StartupGroup/GroupCard.vue scripts/startup-group-test.ts
```

Expected: exit code 0 with no errors.

- [ ] **Step 4: Run Vue/TypeScript checking**

Run:

```powershell
npx vue-tsc --noEmit
```

Expected: exit code 0. If unrelated pre-existing errors occur, record their exact paths and still run the focused checks above.

- [ ] **Step 5: Check whitespace and worktree scope**

Run:

```powershell
git diff --check
git status --short
git diff -- src/render/components/StartupGroup/Index.vue src/render/components/StartupGroup/GroupEditor.vue
```

Expected:

- No whitespace errors.
- `GroupEditor.vue` contains only the user's pre-existing changes.
- `Index.vue` contains both the user's preserved layout work and the requested manager delegation.
- No `stateMap`, `runningMap`, or two-second page polling remains in `Index.vue`.

- [ ] **Step 6: Audit the four requested interactions**

Confirm directly from the final template and manager code:

1. Footer default selection is a left-side checkbox.
2. Footer edit/delete actions are right-side small icon buttons.
3. Header uses a switch, any running member makes it on, and execution disables all switches.
4. Each configured version/service has a row with live global state and its own switch; header-off stops the whole group.

- [ ] **Step 7: Report completion without committing user-owned overlap**

Report the verification commands and results. Explicitly identify any remaining unstaged `Index.vue`/`GroupEditor.vue` changes as preserved user work. Do not create a final catch-all commit that would absorb those pre-existing edits.
