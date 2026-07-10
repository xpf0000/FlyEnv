# Startup Groups Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** 在不改变现有侧边栏群组启停回退行为的前提下，实现可持久化、可排序、按具体服务版本或语言项目精确执行的启动组，并把唯一默认启动组接入现有群组按钮。

**Architecture:** 启动组配置保存到现有 config.setup。纯数据模型、状态归纳、顺序执行和停用队列放在可单测的 renderer core 层；运行时适配器只解析精确安装版本或稳定项目 ID。页面、侧栏和设置页调用该执行器，旧 groupDo 保留为兼容回退。

**Tech Stack:** Vue 3 Composition API、TypeScript、Pinia、Element Plus、vuedraggable、Electron renderer IPC、Node assert、tsx。

---

## 实施前决定

- 模块标识固定为 startup-group；新增 console 分类并放在 AppModuleTypeList 第一位。路由仍由 AppModules 自动生成。
- 服务版本成员除 versionBin 外增加必填 versionPath。bin 无法跨安装目录唯一定位，运行时必须按 module + versionPath 精确解析。
- 启动组调用 ModuleInstalledItem.start({ updateCurrent: false, stopOtherVersions: false })。常规页面不传该选项，因此仍保持既有“切当前版本、停止其他版本”行为。
- 版本候选项只包含当前平台可独立启停的已安装非语言服务，加上从 PHP 已安装版本派生的 PHP-FPM；语言候选项只包含 isService 为 true 的 ProjectItem。
- 默认组“有效”仅表示组仍存在且非空。成员失效时执行其余有效成员并报告异常，绝不回退启动侧栏全部服务。

## File Structure

- Create: src/render/core/StartupGroup.ts — 数据模型、默认组规则、状态、runner、隐藏前去重停止队列。
- Create: src/render/core/StartupGroupRuntime.ts — 服务版本、PHP-FPM、语言项目适配器和候选项查询。
- Create: src/render/core/ModuleVisibility.ts — 设置页和分类开关复用的异步可见性守卫。
- Modify: src/render/core/type.ts — console 分类和 startup-group 模块枚举。
- Modify: src/render/core/Module/Module.ts、src/render/core/Module/ModuleInstalledItem.ts — 精确版本启动选项。
- Modify: src/render/store/app.ts — setup.startupGroups 初始化和持久化。
- Create: src/render/components/StartupGroup/Module.ts、aside.vue、store.ts、Index.vue、GroupCard.vue、GroupEditor.vue。
- Modify: src/render/components/Aside/groupService.ts、src/render/components/Aside/Index.vue — 默认组优先路由。
- Modify: src/render/components/Setup/ModuleShowHide/index.vue、src/render/components/Setup/Module/moduleItem.vue — 隐藏前守卫。
- Modify: src/lang/en/aside.json、src/lang/zh/aside.json、src/lang/en/common.json、src/lang/zh/common.json。
- Modify: package.json; Create: test/startup-group.test.ts。

### Task 1: 建立红灯测试和纯数据模型

**Files:**
- Create: test/startup-group.test.ts
- Create: src/render/core/StartupGroup.ts
- Modify: package.json
- Modify: src/render/store/app.ts

- [ ] **Step 1: 编写失败测试**

Create test/startup-group.test.ts. Use node:assert/strict and fake adapters that record start:<id> and stop:<id>. Test all six cases:

1. Start uses saved order, skips a running member, stops after Redis fails, and marks later members not-run.
2. Stop uses reverse order and continues after a Redis stop failure.
3. Two groups sharing Redis generate one deduplicated hide-stop entry.
4. Invalid wins over executing/running/stopped; otherwise state is running, stopped, or partial-running.
5. Selecting B as default replaces A; clearing B clears default.
6. An empty group cannot become default.

Use MySQL service version with versionPath D:/mysql/8.4, Redis with versionPath D:/redis/7, and a Node project with projectId project-api.

~~~ts
import assert from 'node:assert/strict'
import {
  buildStartupGroupStopQueue,
  createStartupGroupRunner,
  getStartupGroupCardState,
  resolveDefaultStartupGroup,
  setDefaultStartupGroup,
  type StartupGroup,
  type StartupGroupAdapter
} from '../src/render/core/StartupGroup'

const adapter: StartupGroupAdapter = {
  exists: async (item) => item.id !== 'missing',
  getState: async (item) => (item.id === 'mysql' ? 'running' : 'stopped'),
  start: async (item) => {
    calls.push('start:' + item.id)
    if (item.id === 'redis') throw new Error('redis port is occupied')
  },
  stop: async (item) => {
    calls.push('stop:' + item.id)
    if (item.id === 'redis') throw new Error('redis did not stop')
  }
}

console.log('startup group tests passed')
~~~

- [ ] **Step 2: 注册单测命令并确认 RED**

Add this package script:

~~~json
"test:startup-groups": "tsx test/startup-group.test.ts"
~~~

Run:

~~~powershell
yarn test:startup-groups
~~~

Expected: FAIL because src/render/core/StartupGroup.ts does not exist.

- [ ] **Step 3: 定义持久化和适配器契约**

Create src/render/core/StartupGroup.ts:

~~~ts
import type { AllAppModule } from './type'

export type StartupGroupServiceVersionItem = {
  id: string
  type: 'service-version'
  module: AllAppModule
  versionBin: string
  versionPath: string
}
export type StartupGroupLanguageProjectItem = {
  id: string
  type: 'language-project'
  module: AllAppModule
  projectId: string
}
export type StartupGroupItem =
  | StartupGroupServiceVersionItem
  | StartupGroupLanguageProjectItem

export interface StartupGroup {
  id: string
  name: string
  description?: string
  color?: string
  items: StartupGroupItem[]
  createdAt: number
  updatedAt: number
}
export interface StartupGroupConfig {
  groups: StartupGroup[]
  defaultStartupGroupId?: string
}
export type StartupGroupMemberState = 'stopped' | 'running' | 'executing' | 'invalid'
export type StartupGroupCardState =
  | 'stopped'
  | 'running'
  | 'partial-running'
  | 'executing'
  | 'invalid'
export interface StartupGroupAdapter {
  exists(item: StartupGroupItem): Promise<boolean>
  getState(item: StartupGroupItem): Promise<StartupGroupMemberState>
  start(item: StartupGroupItem): Promise<void>
  stop(item: StartupGroupItem): Promise<void>
}
~~~

- [ ] **Step 4: 实现核心规则**

Implement these helpers:

~~~ts
export function getStartupGroupItemKey(item: StartupGroupItem) {
  return item.type === 'service-version'
    ? 'service-version:' + item.module + ':' + item.versionPath
    : 'language-project:' + item.module + ':' + item.projectId
}
export function resolveDefaultStartupGroup(config: StartupGroupConfig) {
  const group = config.groups.find((item) => item.id === config.defaultStartupGroupId)
  return group && group.items.length > 0 ? group : undefined
}
export function setDefaultStartupGroup(config: StartupGroupConfig, groupId?: string) {
  const group = groupId ? config.groups.find((item) => item.id === groupId) : undefined
  return { ...config, defaultStartupGroupId: group && group.items.length ? group.id : undefined }
}
~~~

getStartupGroupCardState returns invalid when any item is invalid, then executing when any item is executing, then running/stopped if all agree, otherwise partial-running. Empty group is stopped.

createStartupGroupRunner(getAdapter) exposes isExecuting, getItemState(item), getGroupState(group), and run(group, action). Start walks saved order, skips running, stops on first error, marks later items not-run, and does not roll back successful starts. Stop walks reverse order, skips stopped, records all failures, and continues. Missing adapter/member is invalid. Set isExecuting in try/finally.

buildStartupGroupStopQueue(groups) visits groups in stored order, each items array in reverse, and keeps the first occurrence of each stable member key.

- [ ] **Step 5: 规范化配置**

Add startupGroups?: StartupGroupConfig to StateBase in src/render/store/app.ts and call this after config hydration:

~~~ts
export function normalizeStartupGroupConfig(value: unknown): StartupGroupConfig {
  const candidate = value as Partial<StartupGroupConfig> | undefined
  const groups = Array.isArray(candidate?.groups) ? candidate.groups : []
  const defaultStartupGroupId = groups.some(
    (group) => group.id === candidate?.defaultStartupGroupId && group.items.length > 0
  )
    ? candidate?.defaultStartupGroupId
    : undefined
  return { groups, defaultStartupGroupId }
}
~~~

Use the existing saveConfig path only.

- [ ] **Step 6: Verify GREEN and commit**

~~~powershell
yarn test:startup-groups
git add -- src/render/core/StartupGroup.ts src/render/store/app.ts test/startup-group.test.ts package.json
git commit -m "feat: add startup group execution core"
~~~

Expected: startup group tests passed.

### Task 2: 实现精确服务版本和语言项目适配器

**Files:**
- Create: src/render/core/StartupGroupRuntime.ts
- Modify: src/render/core/Module/Module.ts
- Modify: src/render/core/Module/ModuleInstalledItem.ts
- Modify: test/startup-group.test.ts

- [ ] **Step 1: 增加精确目标红灯测试**

Create fake current and target installed versions. Assert only target gets:

~~~ts
assert.deepEqual(target.startOptions, {
  updateCurrent: false,
  stopOtherVersions: false
})
assert.equal(current.startOptions, undefined)
~~~

Add language-project assertions that project-api alone gets start(false) and stop(false), while an unknown project ID is invalid.

- [ ] **Step 2: 确认 RED**

~~~powershell
yarn test:startup-groups
~~~

Expected: FAIL because options and runtime resolver are absent.

- [ ] **Step 3: 保持旧启动默认值**

In Module.ts add:

~~~ts
export type ModuleStartOptions = {
  updateCurrent?: boolean
  stopOtherVersions?: boolean
}
~~~

Change onItemStart(item, options = {}) so config.server.current updates only if updateCurrent is not false and sibling installed versions stop only if stopOtherVersions is not false. Existing calls pass no options, so retain existing behavior.

In ModuleInstalledItem.ts:

~~~ts
_onStart!: (item: ModuleInstalledItem, options?: ModuleStartOptions) => Promise<Module>

start(options?: ModuleStartOptions): Promise<string | boolean> {
  const module = await this._onStart(this, options)
  // preserve all existing state and IPC behavior
}
~~~

Do not alter stop.

- [ ] **Step 4: 实现运行时适配器和候选项**

Create StartupGroupRuntime.ts with an injected resolver factory for tests and a production wrapper over BrewStore and ProjectSetup.

~~~ts
export type StartupGroupCandidate = {
  key: string
  label: string
  moduleLabel: string
  item: StartupGroupItem
  warning?: string
}
~~~

- ServiceVersionAdapter finds the exact module installed item by versionPath and starts it with both options false.
- PhpFpmAdapter keeps item.module equal to php-fpm but resolves from brewStore.module('php').installed by versionPath.
- LanguageProjectAdapter resolves ProjectSetup(item.module).project by project.id, requires project.isService, and uses project.state.isRun and project.state.running.
- Convert string/false start results into Error; never select a substitute version/project.
- listCandidates awaits fetchInstalled, includes enabled eligible versions, assigns item IDs with uuid, and gives a non-blocking warning for selected items with equal known ports.

- [ ] **Step 5: Verify GREEN and commit**

~~~powershell
yarn test:startup-groups
git add -- src/render/core/StartupGroupRuntime.ts src/render/core/Module/Module.ts src/render/core/Module/ModuleInstalledItem.ts test/startup-group.test.ts
git commit -m "feat: run startup groups against exact service targets"
~~~

Expected: tests pass and a non-current target never changes current-version configuration.

### Task 3: 实现控制台、卡片页和三步编辑器

**Files:**
- Modify: src/render/core/type.ts
- Create: src/render/components/StartupGroup/Module.ts
- Create: src/render/components/StartupGroup/aside.vue
- Create: src/render/components/StartupGroup/store.ts
- Create: src/render/components/StartupGroup/Index.vue
- Create: src/render/components/StartupGroup/GroupCard.vue
- Create: src/render/components/StartupGroup/GroupEditor.vue
- Modify: src/lang/en/aside.json
- Modify: src/lang/zh/aside.json
- Modify: src/lang/en/common.json
- Modify: src/lang/zh/common.json

- [ ] **Step 1: 注册控制台模块**

Add console = 'console' to AppModuleTypeEnum, place console before site in AppModuleTypeList, and add startup-group to AppModuleEnum. Module.ts uses moduleType console, typeFlag startup-group, asideIndex 1, isService false, isTray false, and async Index/aside components. aside.vue follows Cron/aside.vue using AsideSetup('startup-group') and I18nT('startupGroup.title').

- [ ] **Step 2: 创建单一 CRUD 入口**

Implement createGroup, updateGroup, deleteGroup, and setDefault in store.ts. Create assigns uuid and equal timestamps. Update preserves id, createdAt, and member order. Delete clears default ID when needed. setDefault rejects empty groups. Every successful operation clones startupGroups, assigns the new config to appStore.config.setup.startupGroups, and awaits one saveConfig call.

- [ ] **Step 3: 创建 GroupEditor.vue**

Use a local draft and Element Plus three-step flow:

1. Basic info: non-empty trimmed name, maximum 64 chars; optional description, maximum 240; optional color.
2. Select services: group listCandidates results by module label; preserve saved invalid rows; deduplicate with getStartupGroupItemKey; show port warnings but permit Save.
3. Start order: use vuedraggable with item-key id. The draft array is the persisted start order.

Final Save calls the store and emits saved. Virtual hosts do not appear. Clone selected members with new uuid values: duplicate inside a group is blocked, same service in different groups is allowed.

- [ ] **Step 4: 创建 Index.vue 和 GroupCard.vue**

Cards show name, optional description, member/running counts, state tag, first three member labels with +N, Start, Stop, Edit, Delete, and a footer default switch. State comes from runner.

~~~ts
const startDisabled = cardState === 'running' || cardState === 'executing'
const stopDisabled = cardState === 'stopped' || cardState === 'executing'
const defaultDisabled = group.items.length === 0 || cardState === 'executing'
~~~

Start/Stop result presentation groups started/stopped, skipped, failed, not-run, and invalid. Delete confirms and deletes configuration only; it never stops services. Empty config renders explanation and Add action.

- [ ] **Step 5: 本地化**

Add console to both aside JSON files. Add matching startupGroup keys to both common JSON files:

~~~text
title, add, edit, delete, default, defaultEmptyDisabled, basicInfo,
selectServices, startOrder, noGroups, memberCount, runningCount,
stopped, running, partialRunning, executing, invalid, invalidMember,
startSummary, stopSummary, skipped, failed, notRun, hideConfirm,
hideFailed, hideBusy, portConflict
~~~

Required wording includes Startup Groups / 启动组, Partially running / 部分运行, Configuration invalid / 配置异常, and confirmation that hiding stops every member in every startup group.

- [ ] **Step 6: Check and commit**

~~~powershell
yarn test:startup-groups
npx vue-tsc --noEmit
git add -- src/render/core/type.ts src/render/components/StartupGroup src/lang/en/aside.json src/lang/zh/aside.json src/lang/en/common.json src/lang/zh/common.json
git commit -m "feat: add startup group console"
~~~

Expected: both commands exit 0; the Console category automatically disappears from the sidebar when its only module is hidden.

### Task 4: 接入默认启动组并保留旧群组逻辑

**Files:**
- Modify: src/render/components/Aside/groupService.ts
- Modify: src/render/components/Aside/Index.vue
- Modify: test/startup-group.test.ts

- [ ] **Step 1: 为路由选择写红灯测试**

Add these assertions and stale-default cleanup coverage:

~~~ts
assert.equal(resolveGroupExecutionRoute(true, defaultGroup), 'startup-group')
assert.equal(resolveGroupExecutionRoute(true, undefined), 'legacy')
assert.equal(resolveGroupExecutionRoute(false, defaultGroup), 'legacy')
~~~

- [ ] **Step 2: 确认 RED**

~~~powershell
yarn test:startup-groups
~~~

Expected: FAIL because resolveGroupExecutionRoute is absent.

- [ ] **Step 3: 增加纯路由选择器**

Add this to Aside/groupService.ts:

~~~ts
export function resolveGroupExecutionRoute(
  startupGroupsVisible: boolean,
  defaultGroup: StartupGroup | undefined
) {
  return startupGroupsVisible && defaultGroup ? 'startup-group' : 'legacy'
}
~~~

- [ ] **Step 4: 用包装函数接入按钮**

Rename the current body of groupDo in Aside/Index.vue to legacyGroupDo. Preserve its filters, current-version behavior, ordering, customer modules, and messages exactly.

The new groupDo resolves default, persists a stale default ID as cleared, and runs this flow:

~~~ts
if (resolveGroupExecutionRoute(startupGroupsVisible.value, defaultGroup) === 'legacy') {
  legacyGroupDo()
  return
}
const state = await startupGroupRunner.getGroupState(defaultGroup!)
const action = state === 'stopped' ? 'start' : 'stop'
const result = await startupGroupRunner.run(defaultGroup!, action)
showStartupGroupResult(result)
~~~

When startup-group route is selected, derive button state from default group and runner.isExecuting, not legacy groupIsRunning/groupDisabled. Invalid default members still run through the runner and never trigger legacy services.

Keep tray APP:Tray-Command and existing auto-start calling the wrapper. Hiding startup groups or clearing default therefore restores legacy behavior automatically.

- [ ] **Step 5: Check and commit**

~~~powershell
yarn test:startup-groups
npx vue-tsc --noEmit
git add -- src/render/components/Aside/groupService.ts src/render/components/Aside/Index.vue test/startup-group.test.ts
git commit -m "feat: route group controls through default startup group"
~~~

### Task 5: 实现隐藏前停止与失败阻止

**Files:**
- Create: src/render/core/ModuleVisibility.ts
- Modify: src/render/components/StartupGroup/Module.ts
- Modify: src/render/components/Setup/ModuleShowHide/index.vue
- Modify: src/render/components/Setup/Module/moduleItem.vue
- Modify: test/startup-group.test.ts

- [ ] **Step 1: 为隐藏队列增加红灯测试**

Use two groups sharing Redis. Assert queue is first-group reverse order, then unseen second-group reverse members. Force Redis stop failure; assert subsequent stop attempts still execute and guard returns false.

- [ ] **Step 2: 实现可见性守卫**

Create src/render/core/ModuleVisibility.ts:

~~~ts
import type { AllAppModule } from './type'

export type ModuleVisibilityGuard = (visible: boolean) => Promise<boolean>
const guards = new Map<AllAppModule, ModuleVisibilityGuard>()

export function registerModuleVisibilityGuard(typeFlag: AllAppModule, guard: ModuleVisibilityGuard) {
  guards.set(typeFlag, guard)
}
export async function canSetModuleVisibility(typeFlag: AllAppModule, visible: boolean) {
  return (await guards.get(typeFlag)?.(visible)) ?? true
}
~~~

- [ ] **Step 3: 在模块定义中注册隐藏守卫**

Module.ts registers a guard for startup-group.

1. Showing returns true.
2. If runner is executing, show startupGroup.hideBusy and return false.
3. Confirm with startupGroup.hideConfirm.
4. Build queue from all groups and use the shared runner to stop every member.
5. If any stop fails, show every member/error under startupGroup.hideFailed and return false.
6. Invalid/already stopped entries are reported but do not count as a stop failure.
7. On success return true without changing groups/default configuration.

- [ ] **Step 4: 让两个设置入口都经过守卫**

Replace ModuleShowHide direct setter with asynchronous mutation:

~~~ts
const changeShowItem = async (visible: boolean) => {
  if (!(await canSetModuleVisibility(props.typeFlag as AllAppModule, visible))) return
  appStore.config.setup.common.showItem[props.typeFlag] = visible
  await appStore.saveConfig()
  if (!visible) stopMatchingCustomerModule()
}
~~~

In Module/moduleItem.vue, call canSetModuleVisibility for every built-in module before changing category state, and call saveConfig only after all guards allow. This covers the Console category switch, which would otherwise bypass the individual Startup Groups control.

- [ ] **Step 5: Verify and commit**

~~~powershell
yarn test:startup-groups
npx vue-tsc --noEmit
git add -- src/render/core/ModuleVisibility.ts src/render/components/StartupGroup/Module.ts src/render/components/Setup/ModuleShowHide/index.vue src/render/components/Setup/Module/moduleItem.vue test/startup-group.test.ts
git commit -m "feat: stop startup group services before hiding module"
~~~

Expected: cancellation, active execution, or one failed stop leaves the module visible. Re-enabling does not auto-start services.

### Task 6: 完整验证与手工验收

**Files:**
- Verify all implementation and test files.

- [ ] **Step 1: Run automated checks**

~~~powershell
yarn test:startup-groups
npx vue-tsc --noEmit
npx eslint src/render/core/StartupGroup.ts src/render/core/StartupGroupRuntime.ts src/render/core/ModuleVisibility.ts src/render/core/Module/Module.ts src/render/core/Module/ModuleInstalledItem.ts src/render/components/StartupGroup src/render/components/Aside/Index.vue src/render/components/Aside/groupService.ts src/render/components/Setup/ModuleShowHide/index.vue src/render/components/Setup/Module/moduleItem.vue test/startup-group.test.ts
git diff --check
~~~

Expected: every command exits 0 and git diff --check has no output.

- [ ] **Step 2: 手工验证卡片和精确版本**

1. Create a group with a non-current installed service version, PHP-FPM version, and runnable Node/Python/Go project; drag project last.
2. Navigate away and back; verify order persists.
3. Start; verify target is attempted without current-version replacement, and running members are skipped.
4. Stop; verify reverse order and a failed stop does not block later stops.

- [ ] **Step 3: 手工验证默认组与回退**

1. Set A default then B default; only B switch is on and config has one ID.
2. Sidebar and tray group buttons operate only B.
3. Delete one B target; valid B members run, invalid member is reported, and no extra legacy services start.
4. Clear/delete B default; next click uses old current-version behavior.
5. Hide startup-group module; group controls use old behavior regardless of retained default ID.

- [ ] **Step 4: 手工验证隐藏保护**

1. Put one manually started service in two groups, hide Startup Groups, and verify it stops exactly once while configuration remains.
2. Re-enable module and verify no service starts automatically; original default again drives group button.
3. Repeat through Console category switch.
4. Force a stop failure; hiding must be refused and failure list shown.
5. Start a long group operation, attempt hiding, and verify rejection while execution is active.

- [ ] **Step 5: Inspect final scope**

~~~powershell
git status --short
git diff --stat
git diff --check
~~~

Expected: only intentional startup-group implementation, tests, and localization files change. Preserve the pre-existing untracked .tmp_video_tools/ and the existing design document.

