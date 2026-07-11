# Startup Group Class Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the scattered startup-group factories and wrapper modules with module-local classes, reactive singleton composition, and reactive `StartupGroup` entity instances.

**Architecture:** Persisted startup-group data remains plain JSON DTOs in `type.ts`, while behavior moves into six focused classes under `components/StartupGroup/class`. A single exported `StartupGroupManager` singleton composes Store, Runtime, Runner, and Candidate services; Vue consumers use that entry instead of global core files or `store.ts`/`runtime.ts`/`setup.ts` wrappers.

**Tech Stack:** TypeScript, Vue 3 class reactivity through `reactiveBind`, localForage storage wrappers, existing TSX startup-group regression script.

---

## File Structure

- Create `src/render/components/StartupGroup/type.ts`: DTOs, dependency contracts, state/result types.
- Create `src/render/components/StartupGroup/class/StartupGroup.ts`: one reactive startup-group entity and intrinsic operations.
- Create `src/render/components/StartupGroup/class/StartupGroupRunner.ts`: execution state and lifecycle.
- Create `src/render/components/StartupGroup/class/StartupGroupCandidate.ts`: editor selection rules.
- Create `src/render/components/StartupGroup/class/StartupGroupRuntime.ts`: service/project adapters and candidate loading.
- Create `src/render/components/StartupGroup/class/StartupGroupStore.ts`: hydration, collection operations, default group, persistence.
- Create `src/render/components/StartupGroup/class/StartupGroupManager.ts`: application dependency assembly and single exported singleton.
- Modify startup-group Vue files, `src/render/components/Aside/Index.vue`, `src/render/main.ts`, and `scripts/startup-group-test.ts`.
- Delete the three old global core files and three component wrapper files after all consumers migrate.

### Task 1: Define DTO Contracts and the StartupGroup Entity

**Files:**
- Create: `src/render/components/StartupGroup/type.ts`
- Create: `src/render/components/StartupGroup/class/StartupGroup.ts`
- Modify: `scripts/startup-group-test.ts`

- [ ] **Step 1: Replace the test's group factory with an entity constructor expectation**

Import the new entity and DTO types, then make `makeGroup` return an instance:

```ts
import { StartupGroup } from '../src/render/components/StartupGroup/class/StartupGroup'
import type {
  StartupGroupAdapter,
  StartupGroupData,
  StartupGroupItem,
  StartupGroupMemberState,
  StartupGroupRunnerContract
} from '../src/render/components/StartupGroup/type'

const noopRunner: StartupGroupRunnerContract = {
  executing: false,
  revision: 0,
  getItemState: async () => 'stopped',
  getGroupState: async () => 'stopped',
  run: async (_group, action) => ({ action, members: [] })
}

function makeGroup(id: string, items: StartupGroupItem[]) {
  return new StartupGroup(
    { id, name: id, items, createdAt: 1, updatedAt: 1 },
    noopRunner
  )
}
```

Add an entity behavior block:

```ts
{
  const calls: string[] = []
  const runner: StartupGroupRunnerContract = {
    ...noopRunner,
    getItemState: async (item) => (item.id === 'mysql' ? 'running' : 'stopped'),
    run: async (_group, action) => {
      calls.push(action)
      return { action, members: [] }
    }
  }
  const group = new StartupGroup(
    { id: 'dev', name: 'Dev', items: [mysql, redis], createdAt: 1, updatedAt: 1 },
    runner
  )
  assert.equal(group.empty, false)
  assert.equal(group.canBeDefault, true)
  assert.deepEqual(group.itemKeys, [
    'service-version:mysql:D:/mysql/8.4',
    'service-version:redis:D:/redis/7'
  ])
  assert.deepEqual(group.stopItems.map((item) => item.id), ['redis', 'mysql'])
  group.update({ name: 'Local', items: [api] }, 2)
  assert.equal(group.name, 'Local')
  assert.equal(group.updatedAt, 2)
  assert.deepEqual(group.toJSON(), {
    id: 'dev',
    name: 'Local',
    description: undefined,
    color: undefined,
    items: [api],
    createdAt: 1,
    updatedAt: 2
  })
  await group.start()
  await group.stop()
  await group.toggle()
  assert.deepEqual(calls, ['start', 'stop', 'start'])
}
```

- [ ] **Step 2: Run the focused test and verify RED**

Run `yarn test:startup-groups`.

Expected: FAIL because `type.ts` and `class/StartupGroup.ts` do not exist.

- [ ] **Step 3: Create the DTO and dependency contracts**

Move all current startup-group types into `type.ts`, renaming the persisted group interface to `StartupGroupData`. Include these contracts:

```ts
export interface StartupGroupRunnerContract {
  executing: boolean
  revision: number
  getItemState(item: StartupGroupItem): Promise<StartupGroupMemberState>
  getGroupState(group: StartupGroupData): Promise<StartupGroupCardState>
  run(group: StartupGroupData, action: StartupGroupRunAction): Promise<StartupGroupRunResult>
}

export interface StartupGroupConfigData {
  groups: StartupGroupData[]
  defaultStartupGroupId?: string
}

export interface StartupGroupStoreDependencies {
  createId(): string
  now(): number
  get(): Promise<StartupGroupConfigData | undefined>
  set(value: StartupGroupConfigData): Promise<unknown>
}
```

Retain the current adapter, installed target, project target, runtime module, warning, hide-stop result, and manager dependency shapes without changing their fields. Rename the current `StartupGroupCandidate` data type to `StartupGroupCandidateData` so it does not collide with the Candidate class.

- [ ] **Step 4: Implement the StartupGroup entity**

Create `class/StartupGroup.ts` with this public API:

```ts
export class StartupGroup implements StartupGroupData {
  id: string
  name: string
  description?: string
  color?: string
  items: StartupGroupItem[]
  createdAt: number
  updatedAt: number

  constructor(data: StartupGroupData, private readonly runner: StartupGroupRunnerContract) {
    this.id = data.id
    this.name = data.name
    this.description = data.description
    this.color = data.color
    this.items = data.items.map((item) => ({ ...item }))
    this.createdAt = data.createdAt
    this.updatedAt = data.updatedAt
  }

  static itemKey(item: StartupGroupItem) {
    return item.type === 'service-version'
      ? `service-version:${item.module}:${item.versionPath}`
      : `language-project:${item.module}:${item.projectId}`
  }

  get empty() {
    return this.items.length === 0
  }

  get canBeDefault() {
    return !this.empty
  }

  get itemKeys() {
    return this.items.map(StartupGroup.itemKey)
  }

  get stopItems() {
    return [...this.items].reverse()
  }

  update(draft: StartupGroupDraft, now = Date.now()) {
    this.name = draft.name
    this.description = draft.description
    this.color = draft.color
    this.replaceItems(draft.items)
    this.updatedAt = now
    return this
  }

  replaceItems(items: StartupGroupItem[]) {
    this.items = items.map((item) => ({ ...item }))
    return this
  }

  start() {
    return this.runner.run(this, 'start')
  }

  stop() {
    return this.runner.run(this, 'stop')
  }

  async toggle() {
    const states = await Promise.all(this.items.map((item) => this.runner.getItemState(item)))
    return states.some((state) => state === 'running') ? this.stop() : this.start()
  }

  setMemberEnabled(item: StartupGroupItem, enabled: boolean) {
    return this.runner.run({ ...this.toJSON(), items: [item] }, enabled ? 'start' : 'stop')
  }

  toJSON(): StartupGroupData {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      color: this.color,
      items: this.items.map((item) => ({ ...item })),
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    }
  }
}
```

- [ ] **Step 5: Run the entity tests and verify GREEN for the new block**

Run `yarn test:startup-groups`.

Expected: the new entity assertions pass; remaining failures may still reference old factory imports until later tasks migrate them.

- [ ] **Step 6: Commit the entity foundation**

```bash
git add scripts/startup-group-test.ts src/render/components/StartupGroup/type.ts src/render/components/StartupGroup/class/StartupGroup.ts
git commit -m "refactor: add startup group entity class" -- scripts/startup-group-test.ts src/render/components/StartupGroup/type.ts src/render/components/StartupGroup/class/StartupGroup.ts
```

### Task 2: Convert Runner Lifecycle Functions into StartupGroupRunner

**Files:**
- Create: `src/render/components/StartupGroup/class/StartupGroupRunner.ts`
- Modify: `scripts/startup-group-test.ts`

- [ ] **Step 1: Change runner tests to instantiate the class**

Replace `createStartupGroupRunner(getAdapter)` with:

```ts
reactiveBind(new StartupGroupRunner(getAdapter))
```

Replace readonly-ref assertions:

```ts
assert.equal(runner.executing, true)
assert.ok(runner.revision > initialRevision)
```

Test queue/state helpers through class methods:

```ts
assert.deepEqual(
  runner.buildStopQueue([makeGroup('first', [mysql, redis]), makeGroup('second', [redis, api])])
    .map((item) => item.id),
  ['redis', 'mysql', 'api']
)
assert.equal(runner.cardState(['running', 'stopped']), 'partial-running')
```

- [ ] **Step 2: Run the focused test and verify RED**

Run `yarn test:startup-groups`.

Expected: FAIL because `StartupGroupRunner` does not exist.

- [ ] **Step 3: Implement StartupGroupRunner**

Create a class with normal reactive fields:

```ts
export class StartupGroupRunner implements StartupGroupRunnerContract {
  executing = false
  revision = 0
  private activeItems = new Set<string>()

  constructor(
    private readonly getAdapter: (item: StartupGroupItem) => StartupGroupAdapter | undefined
  ) {}

  get isExecuting() {
    return this.executing
  }

  private changed() {
    this.revision += 1
  }
}
```

Move the existing factory behavior into bound methods named `resolveItem`, `getItemState`, `getGroupState`, `run`, `cardState`, `buildStopQueue`, and `stopForHide`. Preserve sequential start, reverse stop, skipped/invalid/failed/not-run outcomes, deduplication, and hide-stop failure reasons exactly.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run `yarn test:startup-groups`.

Expected: runner ordering, state, failure, and hide-stop tests pass with normal boolean/number fields.

- [ ] **Step 5: Commit the runner class**

```bash
git add scripts/startup-group-test.ts src/render/components/StartupGroup/class/StartupGroupRunner.ts
git commit -m "refactor: convert startup group runner to class" -- scripts/startup-group-test.ts src/render/components/StartupGroup/class/StartupGroupRunner.ts
```

### Task 3: Convert Candidate Rules and Runtime Adapters into Classes

**Files:**
- Create: `src/render/components/StartupGroup/class/StartupGroupCandidate.ts`
- Create: `src/render/components/StartupGroup/class/StartupGroupRuntime.ts`
- Modify: `scripts/startup-group-test.ts`

- [ ] **Step 1: Rewrite candidate tests around one class instance**

Construct with an injectable id generator:

```ts
const candidateManager = reactiveBind(new StartupGroupCandidate(() => 'new-id'))
```

Map the current functions to methods:

```ts
candidateManager.matchesItem(candidate, item)
candidateManager.allowsMultiple(candidate)
candidateManager.updateSelection(keys, candidate, candidates, selected)
candidateManager.toggleSelection(keys, candidate, candidates)
candidateManager.normalizeSelection(keys, candidates)
candidateManager.filterValidItems(items, candidates)
candidateManager.syncSelectedItems(items, candidates, keys)
candidateManager.warnings(candidates, keys)
```

Change runtime construction to:

```ts
const runtime = reactiveBind(new StartupGroupRuntime(dependencies))
```

- [ ] **Step 2: Run the focused test and verify RED**

Run `yarn test:startup-groups`.

Expected: FAIL because the Candidate and Runtime classes do not exist.

- [ ] **Step 3: Implement StartupGroupCandidate**

Create a stateless class whose methods contain the current candidate-function bodies. Use `StartupGroup.itemKey` for identity and the constructor's `createId` dependency in `syncSelectedItems`.

```ts
export class StartupGroupCandidate {
  constructor(private readonly createId: () => string) {}

  matchesItem(candidate: StartupGroupCandidateData, item: StartupGroupItem) {
    if (StartupGroup.itemKey(candidate.item) !== StartupGroup.itemKey(item)) return false
    return item.type !== 'language-project' || candidate.item.type !== 'language-project'
      ? item.type === candidate.item.type
      : candidate.item.projectPath === item.projectPath
  }

  allowsMultiple(candidate: StartupGroupCandidateData) {
    return candidate.item.type === 'language-project' || candidate.item.module === 'php-fpm'
  }

  updateSelection(
    selectedKeys: string[],
    candidate: StartupGroupCandidateData,
    candidates: StartupGroupCandidateData[],
    selected: boolean
  ) {
    const next = selectedKeys.filter((key) => key !== candidate.key)
    if (!selected) return next
    if (this.allowsMultiple(candidate)) return [...next, candidate.key]
    const sameModuleKeys = new Set(
      candidates
        .filter(
          (item) =>
            item.item.type === 'service-version' && item.item.module === candidate.item.module
        )
        .map((item) => item.key)
    )
    return [...next.filter((key) => !sameModuleKeys.has(key)), candidate.key]
  }

  toggleSelection(
    selectedKeys: string[],
    candidate: StartupGroupCandidateData,
    candidates: StartupGroupCandidateData[]
  ) {
    return this.updateSelection(
      selectedKeys,
      candidate,
      candidates,
      !selectedKeys.includes(candidate.key)
    )
  }

  normalizeSelection(selectedKeys: string[], candidates: StartupGroupCandidateData[]) {
    const candidateByKey = new Map(candidates.map((candidate) => [candidate.key, candidate]))
    return selectedKeys.reduce<string[]>((next, key) => {
      const candidate = candidateByKey.get(key)
      return candidate ? this.updateSelection(next, candidate, candidates, true) : next
    }, [])
  }

  filterValidItems(items: StartupGroupItem[], candidates: StartupGroupCandidateData[]) {
    const candidateByKey = new Map(candidates.map((candidate) => [candidate.key, candidate]))
    return items.filter((item) => {
      const candidate = candidateByKey.get(StartupGroup.itemKey(item))
      return candidate ? this.matchesItem(candidate, item) : false
    })
  }

  syncSelectedItems(
    items: StartupGroupItem[],
    candidates: StartupGroupCandidateData[],
    selectedKeys: string[]
  ) {
    const candidateByKey = new Map(candidates.map((candidate) => [candidate.key, candidate]))
    const selected = new Set(selectedKeys)
    const used = new Set<string>()
    const next: StartupGroupItem[] = []
    for (const item of items) {
      const key = StartupGroup.itemKey(item)
      const candidate = candidateByKey.get(key)
      if (!candidate) {
        next.push(item)
        continue
      }
      if (this.matchesItem(candidate, item)) {
        if (selected.has(key)) {
          next.push(item)
          used.add(key)
        }
        continue
      }
      if (selected.has(key)) {
        next.push({ ...candidate.item, id: this.createId() })
        used.add(key)
      } else {
        next.push(item)
      }
    }
    for (const key of selectedKeys) {
      if (used.has(key)) continue
      const candidate = candidateByKey.get(key)
      if (candidate) {
        next.push({ ...candidate.item, id: this.createId() })
        used.add(key)
      }
    }
    return next
  }

  warnings(candidates: StartupGroupCandidateData[], selectedKeys: string[]) {
    const selected = candidates.filter((candidate) => selectedKeys.includes(candidate.key))
    const moduleCount = new Map<string, number>()
    const portCount = new Map<number, number>()
    for (const candidate of selected) {
      if (candidate.item.type === 'service-version') {
        moduleCount.set(candidate.item.module, (moduleCount.get(candidate.item.module) ?? 0) + 1)
      }
      if (candidate.port) portCount.set(candidate.port, (portCount.get(candidate.port) ?? 0) + 1)
    }
    const warnings = new Map<string, StartupGroupCandidateWarning[]>()
    for (const candidate of selected) {
      const itemWarnings: StartupGroupCandidateWarning[] = []
      if (
        candidate.item.type === 'service-version' &&
        (moduleCount.get(candidate.item.module) ?? 0) > 1
      ) {
        itemWarnings.push('same-module')
      }
      if (candidate.port && (portCount.get(candidate.port) ?? 0) > 1) {
        itemWarnings.push('same-port')
      }
      if (itemWarnings.length > 0) warnings.set(candidate.key, itemWarnings)
    }
    return warnings
  }
}
```

- [ ] **Step 4: Implement StartupGroupRuntime**

Create a class with:

```ts
export class StartupGroupRuntime {
  readonly runner: StartupGroupRunner
  private projectSources = new Map<AllAppModule, Promise<StartupGroupProjectTarget[]>>()

  constructor(private readonly dependencies: StartupGroupRuntimeDependencies) {
    this.runner = reactiveBind(new StartupGroupRunner((item) => this.getAdapter(item)))
  }
}
```

Move project caching, installed/project target lookup, module labeling, result validation, adapters, and `listCandidates()` into methods. Keep service and project adapter implementations as private classes in the same file so adapter behavior is also class-based without adding more public entry files.

- [ ] **Step 5: Run the focused test and verify GREEN**

Run `yarn test:startup-groups`.

Expected: all candidate and runtime tests pass through class instances.

- [ ] **Step 6: Commit candidate and runtime classes**

```bash
git add scripts/startup-group-test.ts src/render/components/StartupGroup/class/StartupGroupCandidate.ts src/render/components/StartupGroup/class/StartupGroupRuntime.ts
git commit -m "refactor: class startup group runtime services" -- scripts/startup-group-test.ts src/render/components/StartupGroup/class/StartupGroupCandidate.ts src/render/components/StartupGroup/class/StartupGroupRuntime.ts
```

### Task 4: Convert Persistence into StartupGroupStore

**Files:**
- Create: `src/render/components/StartupGroup/class/StartupGroupStore.ts`
- Modify: `scripts/startup-group-test.ts`

- [ ] **Step 1: Add store behavior tests with injected storage**

Use an in-memory dependency object:

```ts
let saved: StartupGroupConfigData | undefined = {
  groups: [{ id: 'saved', name: 'Saved', items: [mysql], createdAt: 1, updatedAt: 1 }],
  defaultStartupGroupId: 'saved'
}
const writes: StartupGroupConfigData[] = []
const store = reactiveBind(
  new StartupGroupStore(noopRunner, {
    createId: () => 'created',
    now: () => 10,
    get: async () => saved,
    set: async (value) => writes.push(value)
  })
)
await store.init()
assert.ok(store.groups[0] instanceof StartupGroup)
assert.equal(store.defaultGroup?.id, 'saved')
const created = await store.add({ name: 'Created', items: [redis] })
assert.ok(created instanceof StartupGroup)
assert.equal(store.groups.length, 2)
assert.deepEqual(writes.at(-1)?.groups.at(-1), created.toJSON())
await store.setDefault('created')
assert.equal(store.defaultGroup?.id, 'created')
await store.update('created', { name: 'Updated', items: [api] })
assert.equal(store.find('created')?.name, 'Updated')
await store.remove('created')
assert.equal(store.find('created'), undefined)
```

- [ ] **Step 2: Run the focused test and verify RED**

Run `yarn test:startup-groups`.

Expected: FAIL because `StartupGroupStore` does not exist.

- [ ] **Step 3: Implement StartupGroupStore**

Use class fields rather than computed refs:

```ts
export class StartupGroupStore {
  groups: StartupGroup[] = []
  defaultStartupGroupId?: string
  loaded = false
  private loading?: Promise<StartupGroupConfigData>

  constructor(
    private readonly runner: StartupGroupRunnerContract,
    private readonly dependencies: StartupGroupStoreDependencies
  ) {}

  get config(): StartupGroupConfigData {
    return this.serialize(this.groups, this.defaultStartupGroupId)
  }

  get defaultGroup() {
    const group = this.groups.find((item) => item.id === this.defaultStartupGroupId)
    return group?.canBeDefault ? group : undefined
  }
}
```

Implement `normalize`, `hydrate`, `serialize`, `init`, `persist`, `isCreationLocked`, `add`, `update`, `remove`, `setDefault`, and `find`. Hydrate every entity through `reactiveBind(new StartupGroup(data, runner))`. Persist only DTOs returned by `toJSON()` through the injected storage methods.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run `yarn test:startup-groups`.

Expected: store class tests pass, including unchanged persisted JSON shape.

- [ ] **Step 5: Commit the store class**

```bash
git add scripts/startup-group-test.ts src/render/components/StartupGroup/class/StartupGroupStore.ts
git commit -m "refactor: convert startup group store to class" -- scripts/startup-group-test.ts src/render/components/StartupGroup/class/StartupGroupStore.ts
```

### Task 5: Assemble the StartupGroupManager Singleton

**Files:**
- Create: `src/render/components/StartupGroup/class/StartupGroupManager.ts`
- Modify: `scripts/startup-group-test.ts`

- [ ] **Step 1: Rewrite manager tests to use composed class dependencies**

Instantiate `StartupGroupManagerService` with explicit Store, Runtime, Candidate, and source dependencies. Preserve current assertions for member resolution, titles, paths, running state, source loading, and busy guards.

Add singleton source-contract assertions:

```ts
assert.match(startupGroupManagerSource, /reactiveBind\(new StartupGroupRuntime/)
assert.match(startupGroupManagerSource, /reactiveBind\(new StartupGroupStore/)
assert.match(startupGroupManagerSource, /reactiveBind\(new StartupGroupCandidate/)
assert.match(startupGroupManagerSource, /export const StartupGroupManager = reactiveBind/)
```

- [ ] **Step 2: Run the focused test and verify RED**

Run `yarn test:startup-groups`.

Expected: FAIL because the Manager class and singleton assembly do not exist.

- [ ] **Step 3: Implement StartupGroupManagerService**

```ts
export class StartupGroupManagerService {
  private loadingCount = 0

  constructor(
    readonly store: StartupGroupStore,
    readonly runtime: StartupGroupRuntime,
    readonly candidate: StartupGroupCandidate,
    private readonly dependencies: StartupGroupManagerDependencies
  ) {}

  get runner() {
    return this.runtime.runner
  }

  get busy() {
    return this.loadingCount > 0 || this.runner.executing
  }
}
```

Move the current member resolution/display/source methods into this class. Make `setGroupEnabled` call `group.start()` or `group.stop()`, and `setMemberEnabled` call `group.setMemberEnabled(item, enabled)`.

- [ ] **Step 4: Assemble and export the application singleton**

In the same file, create application dependencies using `AppModules`, `BrewStore`, `ProjectSetup`, `fs`, `uuid`, `StorageGetAsync`, and `StorageSetAsync`. Bind each stateful class once:

```ts
const runtime = reactiveBind(new StartupGroupRuntime(runtimeDependencies))
const store = reactiveBind(new StartupGroupStore(runtime.runner, storeDependencies))
const candidate = reactiveBind(new StartupGroupCandidate(uuid))

export const StartupGroupManager = reactiveBind(
  new StartupGroupManagerService(store, runtime, candidate, managerDependencies)
)
```

- [ ] **Step 5: Run manager tests and verify GREEN**

Run `yarn test:startup-groups`.

Expected: manager behavior and singleton source-contract assertions pass.

- [ ] **Step 6: Commit the manager composition**

```bash
git add scripts/startup-group-test.ts src/render/components/StartupGroup/class/StartupGroupManager.ts
git commit -m "refactor: add startup group manager singleton" -- scripts/startup-group-test.ts src/render/components/StartupGroup/class/StartupGroupManager.ts
```

### Task 6: Migrate Vue Consumers to the Single Manager Entry

**Files:**
- Modify: `src/render/main.ts`
- Modify: `src/render/components/Aside/Index.vue`
- Modify: `src/render/components/StartupGroup/Index.vue`
- Modify: `src/render/components/StartupGroup/GroupCard.vue`
- Modify: `src/render/components/StartupGroup/GroupEditor.vue`
- Modify: `src/render/components/StartupGroup/aside.vue`
- Modify: `src/render/components/StartupGroup/Module.ts`
- Modify: `scripts/startup-group-test.ts`

- [ ] **Step 1: Add failing source-contract assertions for the single entry**

Require each consumer to import `StartupGroupManager` and reject old wrapper/core imports:

```ts
for (const source of [mainSource, asideSource, indexSource, editorSource, cardSource, startupGroupAsideSource, moduleSource]) {
  assert.doesNotMatch(source, /core\/StartupGroup/)
  assert.doesNotMatch(source, /\.\/store['"]/)
  assert.doesNotMatch(source, /\.\/runtime['"]/)
  assert.doesNotMatch(source, /\.\/setup['"]/)
}
assert.match(mainSource, /StartupGroupManager\.store\.init\(\)/)
assert.match(editorSource, /StartupGroupManager\.candidate/)
assert.match(editorSource, /StartupGroupManager\.runtime\.listCandidates/)
assert.match(cardSource, /StartupGroupManager\.getMemberDisplayTitle/)
```

- [ ] **Step 2: Run the focused test and verify RED**

Run `yarn test:startup-groups`.

Expected: FAIL because Vue consumers still use the old global and wrapper APIs.

- [ ] **Step 3: Migrate renderer bootstrap and store access**

Change `main.ts` to:

```ts
import { StartupGroupManager } from '@/components/StartupGroup/class/StartupGroupManager'
// ...
await StartupGroupManager.store.init()
```

In pages and sidebars, replace `useStartupGroupStore()` with `StartupGroupManager.store`. Use computed wrappers only where template ref unwrapping is required.

- [ ] **Step 4: Migrate runtime and execution access**

Replace `startupGroupRuntime.runner` with `StartupGroupManager.runner`, `.listCandidates()` with `StartupGroupManager.runtime.listCandidates()`, and `StartupGroupSetup` methods with `StartupGroupManager` methods.

Replace runner ref access:

```ts
StartupGroupManager.runner.executing
StartupGroupManager.runner.revision
```

Replace group execution with entity methods where the whole group is involved:

```ts
enabled ? group.start() : group.stop()
group.setMemberEnabled(item, enabled)
group.toggle()
```

- [ ] **Step 5: Migrate candidate editor methods**

Use:

```ts
StartupGroupManager.candidate.matchesItem(...)
StartupGroupManager.candidate.allowsMultiple(...)
StartupGroupManager.candidate.toggleSelection(...)
StartupGroupManager.candidate.normalizeSelection(...)
StartupGroupManager.candidate.filterValidItems(...)
StartupGroupManager.candidate.syncSelectedItems(...)
StartupGroupManager.candidate.warnings(...)
```

- [ ] **Step 6: Run the focused test and verify GREEN**

Run `yarn test:startup-groups`.

Expected: all behavioral and consumer source-contract assertions pass.

- [ ] **Step 7: Commit consumer migration**

```bash
git add scripts/startup-group-test.ts src/render/main.ts src/render/components/Aside/Index.vue src/render/components/StartupGroup/Index.vue src/render/components/StartupGroup/GroupCard.vue src/render/components/StartupGroup/GroupEditor.vue src/render/components/StartupGroup/aside.vue src/render/components/StartupGroup/Module.ts
git commit -m "refactor: use startup group manager singleton" -- scripts/startup-group-test.ts src/render/main.ts src/render/components/Aside/Index.vue src/render/components/StartupGroup/Index.vue src/render/components/StartupGroup/GroupCard.vue src/render/components/StartupGroup/GroupEditor.vue src/render/components/StartupGroup/aside.vue src/render/components/StartupGroup/Module.ts
```

### Task 7: Remove Old Global and Wrapper Files

**Files:**
- Delete: `src/render/core/StartupGroup.ts`
- Delete: `src/render/core/StartupGroupManager.ts`
- Delete: `src/render/core/StartupGroupRuntime.ts`
- Delete: `src/render/components/StartupGroup/store.ts`
- Delete: `src/render/components/StartupGroup/runtime.ts`
- Delete: `src/render/components/StartupGroup/setup.ts`
- Modify: `scripts/startup-group-test.ts`

- [ ] **Step 1: Add source-contract checks for deleted files**

Use `existsSync` assertions:

```ts
for (const relativePath of [
  'src/render/core/StartupGroup.ts',
  'src/render/core/StartupGroupManager.ts',
  'src/render/core/StartupGroupRuntime.ts',
  'src/render/components/StartupGroup/store.ts',
  'src/render/components/StartupGroup/runtime.ts',
  'src/render/components/StartupGroup/setup.ts'
]) {
  assert.equal(existsSync(new URL('../' + relativePath, import.meta.url)), false)
}
```

- [ ] **Step 2: Delete the obsolete files with apply_patch**

Delete all six files only after `rg` confirms no production imports remain.

- [ ] **Step 3: Run the focused test and verify GREEN**

Run `yarn test:startup-groups`.

Expected: PASS with no imports from the deleted files.

- [ ] **Step 4: Commit obsolete-file removal**

```bash
git add scripts/startup-group-test.ts src/render/core/StartupGroup.ts src/render/core/StartupGroupManager.ts src/render/core/StartupGroupRuntime.ts src/render/components/StartupGroup/store.ts src/render/components/StartupGroup/runtime.ts src/render/components/StartupGroup/setup.ts
git commit -m "refactor: remove legacy startup group modules" -- scripts/startup-group-test.ts src/render/core/StartupGroup.ts src/render/core/StartupGroupManager.ts src/render/core/StartupGroupRuntime.ts src/render/components/StartupGroup/store.ts src/render/components/StartupGroup/runtime.ts src/render/components/StartupGroup/setup.ts
```

### Task 8: Final Verification

**Files:**
- Verify all files changed in Tasks 1-7.

- [ ] **Step 1: Confirm the final architecture**

Run:

```bash
find src/render/components/StartupGroup -maxdepth 2 -type f | sort
rg -n "core/StartupGroup|components/StartupGroup/(store|runtime|setup)" src/render scripts/startup-group-test.ts
rg -n "reactiveBind\(new StartupGroup" src/render/components/StartupGroup/class
```

Expected: only module-local type/class files remain; no old imports; entity, services, and singleton assembly use `reactiveBind`.

- [ ] **Step 2: Run focused ESLint**

```bash
npx eslint scripts/startup-group-test.ts src/render/components/StartupGroup/type.ts src/render/components/StartupGroup/class/*.ts src/render/main.ts src/render/components/Aside/Index.vue src/render/components/StartupGroup/*.vue src/render/components/StartupGroup/Module.ts
```

Expected: exit code 0.

- [ ] **Step 3: Run Vue/TypeScript checking**

```bash
npx vue-tsc --noEmit
```

Expected: exit code 0.

- [ ] **Step 4: Run the startup-group regression suite**

```bash
yarn test:startup-groups
```

Expected: `startup group tests passed` with exit code 0.

- [ ] **Step 5: Review the scoped diff and status**

```bash
git diff --check HEAD~7..HEAD -- src/render/components/StartupGroup src/render/components/Aside/Index.vue src/render/main.ts src/render/core/StartupGroup.ts src/render/core/StartupGroupManager.ts src/render/core/StartupGroupRuntime.ts scripts/startup-group-test.ts
git status --short -- src/render/components/StartupGroup src/render/components/Aside/Index.vue src/render/main.ts src/render/core/StartupGroup.ts src/render/core/StartupGroupManager.ts src/render/core/StartupGroupRuntime.ts scripts/startup-group-test.ts
```

Expected: no whitespace errors and no uncommitted changes in the scoped files.
