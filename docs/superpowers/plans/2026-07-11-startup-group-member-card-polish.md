# Startup Group Member Card Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show module names and paths consistently in Startup Group member cards, limit the card body to four scrollable rows, and keep NodeJS project services visible in the service selector.

**Architecture:** Extend the existing `StartupGroupManager` presentation adapter with module-label and service-path derivation, keeping runtime state in the original global targets. Remove the eager path-existence filter only from language-project candidate discovery; execution-time validation remains in the runner. Update `GroupCard.vue` to render a uniform fixed-height two-line row inside an Element Plus scrollbar.

**Tech Stack:** TypeScript 5.8, Vue 3 Composition API, Element Plus, FlyEnv `AppModules`, existing `scripts/startup-group-test.ts` assertion harness.

---

## File Structure

- Modify `src/render/core/StartupGroupManager.ts`: add module-label dependency/getter and return paths for both member types.
- Modify `src/render/components/StartupGroup/setup.ts`: resolve module labels from `AppModules` and pass them into the manager.
- Modify `src/render/core/StartupGroupRuntime.ts`: stop hiding language-project candidates when eager path checking returns false.
- Modify `src/render/components/StartupGroup/GroupCard.vue`: render module-prefixed two-line rows in a fixed four-row scrollbar.
- Modify `scripts/startup-group-test.ts`: add behavior and source-contract regression coverage.
- Preserve existing user edits in `src/render/components/StartupGroup/Index.vue` and `GroupEditor.vue`; neither file needs implementation changes for this follow-up.

### Task 1: Derive module labels and paths in StartupGroupManager

**Files:**
- Modify: `src/render/core/StartupGroupManager.ts`
- Modify: `src/render/components/StartupGroup/setup.ts`
- Test: `scripts/startup-group-test.ts`

- [ ] **Step 1: Write failing manager tests**

Extend the existing manager test dependencies and assertions:

```ts
const moduleLabels: Partial<Record<AllAppModule, string>> = {
  mysql: 'MySQL',
  node: 'NodeJS'
}
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
  }),
  getModuleLabel: (module) => moduleLabels[module]
})

assert.equal(manager.getMemberModuleLabel(mysql), 'MySQL')
assert.equal(manager.getMemberModuleLabel(api), 'NodeJS')
assert.equal(manager.getMemberModuleLabel({ ...redis, module: 'redis' }), 'redis')
assert.equal(manager.getMemberPath(mysql), mysql.versionPath)
assert.equal(manager.getMemberPath(api), api.projectPath)
```

Update the `StartupGroupManagerDependencies` constructor call in every test instance so `getModuleLabel` is supplied.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
yarn test:startup-groups
```

Expected: TypeScript/runtime failure because `getModuleLabel` and `getMemberModuleLabel` do not exist, or assertion failure because service-version path is undefined.

- [ ] **Step 3: Implement the minimal manager API**

Add the dependency and methods:

```ts
export type StartupGroupManagerDependencies = {
  runner: Pick<StartupGroupRunner, 'isExecuting' | 'run'>
  getInstalled(module: AllAppModule): StartupGroupInstalledTarget[]
  fetchInstalled(module: AllAppModule): Promise<unknown>
  getProjectSource(module: AllAppModule): StartupGroupProjectSource
  getModuleLabel(module: AllAppModule): string | undefined
}

getMemberModuleLabel(item: StartupGroupItem) {
  return this.dependencies.getModuleLabel(item.module) || item.module
}

getMemberPath(item: StartupGroupItem) {
  const resolved = this.resolveMember(item)
  if (resolved?.type === 'service-version') return resolved.target.path
  if (resolved?.type === 'language-project') return resolved.target.path
  return item.type === 'service-version' ? item.versionPath : item.projectPath
}
```

- [ ] **Step 4: Wire AppModules label resolution**

In `src/render/components/StartupGroup/setup.ts`, import `AppModules` and add:

```ts
getModuleLabel: (module: AllAppModule) => {
  const label = AppModules.find((item) => item.typeFlag === module)?.label
  return typeof label === 'function' ? label() : label
}
```

This supports string labels, function labels, and manager fallback to the type flag.

- [ ] **Step 5: Add source-contract assertions for singleton wiring**

Add:

```ts
assert.match(startupGroupSetupSource, /AppModules/)
assert.match(startupGroupSetupSource, /getModuleLabel/)
assert.match(startupGroupSetupSource, /typeof label === 'function'/)
```

- [ ] **Step 6: Run the focused test and verify GREEN**

Run `yarn test:startup-groups`.

Expected: `startup group tests passed`.

### Task 2: Keep NodeJS project services in selector candidates

**Files:**
- Modify: `src/render/core/StartupGroupRuntime.ts`
- Test: `scripts/startup-group-test.ts`

- [ ] **Step 1: Write the failing candidate regression**

In the existing runtime candidate test, clear the simulated path set before candidate discovery and require both NodeJS services to remain visible:

```ts
existingProjectPaths.clear()
const candidates = await runtime.listCandidates()
assert.deepEqual(
  candidates
    .filter((candidate) => candidate.item.module === 'node')
    .map((candidate) => candidate.displayName),
  ['API Server', 'Missing Service']
)
```

Update the complete expected candidate arrays so they include:

```ts
['node', 'API Server']
['node', 'Missing Service']
```

and:

```ts
['node', 'language', 'API Server', 'D:/projects/api']
['node', 'language', 'Missing Service', 'D:/projects/missing']
```

Keep the earlier adapter assertion proving a missing project path is invalid during execution.

- [ ] **Step 2: Run the test and verify RED**

Run `yarn test:startup-groups`.

Expected: FAIL because both NodeJS candidates are currently skipped by `pathExists`.

- [ ] **Step 3: Remove only the eager candidate filter**

In the language-project portion of `listCandidates`, delete:

```ts
if (!(await dependencies.pathExists(project.path))) continue
```

Do not change `projectTarget`; it must continue checking `pathExists` for runner operations.

- [ ] **Step 4: Add source-contract coverage for the boundary**

Add the source read and assert that the candidate loop no longer contains the eager continue while `projectTarget` still contains path validation:

```ts
const startupRuntimeCoreSource = readSource('src/render/core/StartupGroupRuntime.ts')
assert.doesNotMatch(
  startupRuntimeCoreSource,
  /for \(const project of projects\.filter[\s\S]*?if \(!\(await dependencies\.pathExists\(project\.path\)\)\) continue/
)
assert.match(
  startupRuntimeCoreSource,
  /return project && \(await dependencies\.pathExists\(project\.path\)\) \? project : undefined/
)
```

- [ ] **Step 5: Run the focused test and verify GREEN**

Run `yarn test:startup-groups`.

Expected: `startup group tests passed`.

### Task 3: Render uniform four-row scrollable member cards

**Files:**
- Modify: `src/render/components/StartupGroup/GroupCard.vue`
- Test: `scripts/startup-group-test.ts`

- [ ] **Step 1: Write failing card source contracts**

Add assertions requiring module-prefixed display text, fixed row height, service/project paths, and the Element Plus scrollbar:

```ts
assert.match(cardSource, /<el-scrollbar[^>]*height="248px"/)
assert.match(cardSource, /class="flex h-14 items-center/)
assert.match(cardSource, /StartupGroupSetup\.getMemberModuleLabel/)
assert.match(cardSource, /memberDisplayTitle/)
assert.match(cardSource, /memberPath\(item\)/)
assert.match(cardSource, /h-\[248px\]/)
```

- [ ] **Step 2: Run the test and verify RED**

Run `yarn test:startup-groups`.

Expected: FAIL because the current card has no module label and no fixed-height member scrollbar.

- [ ] **Step 3: Wrap members in the fixed-height scrollbar**

Replace the member-area root with:

```vue
<el-scrollbar v-if="group.items.length" height="248px">
  <div class="flex flex-col gap-2 pr-2">
    <div
      v-for="item in group.items"
      :key="item.id"
      class="flex h-14 items-center justify-between gap-3 rounded border border-zinc-200 px-3 py-2 dark:border-zinc-700"
    >
      <div class="min-w-0 flex-1">
        <div class="truncate text-sm font-medium">
          {{ memberDisplayTitle(item) }}
        </div>
        <div class="mt-1 truncate text-xs text-zinc-500">
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
</el-scrollbar>
<div v-else class="flex h-[248px] items-center text-sm text-zinc-400">
  {{ I18nT('common.startupGroup.emptyMembers') }}
</div>
```

The `56px` rows plus three `8px` gaps fill exactly `248px` for four members.

- [ ] **Step 4: Render consistent two-line labels**

Use this first and second line inside every row:

```vue
<div class="min-w-0 flex-1">
  <div class="truncate text-sm font-medium">
    {{ memberDisplayTitle(item) }}
  </div>
  <div class="mt-1 truncate text-xs text-zinc-500">
    {{ memberPath(item) }}
  </div>
</div>
```

Add:

```ts
const memberDisplayTitle = (item: StartupGroupItem) => {
  const moduleLabel = StartupGroupSetup.getMemberModuleLabel(item)
  const title =
    item.type === 'language-project'
      ? memberTitle(item) || I18nT('common.startupGroup.noRemark')
      : memberTitle(item)
  return `${moduleLabel} · ${title}`
}
```

Keep `memberPath` backed by `StartupGroupSetup.getMemberPath`, which now returns both version and project paths.

- [ ] **Step 5: Run the focused test and verify GREEN**

Run `yarn test:startup-groups`.

Expected: `startup group tests passed`.

### Task 4: Full verification and worktree audit

**Files:**
- Verify all touched files without adding behavior.

- [ ] **Step 1: Format touched files**

```powershell
npx prettier --write src/render/core/StartupGroupManager.ts src/render/core/StartupGroupRuntime.ts src/render/components/StartupGroup/setup.ts src/render/components/StartupGroup/GroupCard.vue scripts/startup-group-test.ts
```

Expected: exit code 0.

- [ ] **Step 2: Run focused tests**

Run `yarn test:startup-groups`.

Expected: `startup group tests passed`.

- [ ] **Step 3: Run targeted ESLint**

```powershell
npx eslint src/render/core/StartupGroupManager.ts src/render/core/StartupGroupRuntime.ts src/render/components/StartupGroup/setup.ts src/render/components/StartupGroup/GroupCard.vue scripts/startup-group-test.ts
```

Expected: exit code 0.

- [ ] **Step 4: Run full Vue/TypeScript checking**

Run `npx vue-tsc --noEmit`.

Expected: exit code 0.

- [ ] **Step 5: Check whitespace and preserved user work**

```powershell
git diff --check
git status --short
git diff -- src/render/components/StartupGroup/Index.vue src/render/components/StartupGroup/GroupEditor.vue
```

Expected: no whitespace errors; `Index.vue` and `GroupEditor.vue` retain their existing user-owned changes and receive no new follow-up edits.

- [ ] **Step 6: Audit requirements**

Confirm:

1. Every member first line starts with the module label.
2. Service versions and custom services both show paths on the second line.
3. The fixed 248px member area displays four 56px rows and scrolls beyond four.
4. NodeJS service projects appear in selector candidates even when eager path checking fails.
5. Runner-time project path validation remains unchanged.

Because `scripts/startup-group-test.ts` already contains source contracts for user-owned `Index.vue` changes, do not create an implementation commit that would separate the tests from the overlapping working-tree state. Leave the verified follow-up changes unstaged for user review.
