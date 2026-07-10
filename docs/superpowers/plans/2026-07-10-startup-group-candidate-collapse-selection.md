# Startup Group Candidate Collapse Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat Startup Group candidate checklist with categorized nested collapses and path-aware cards that enforce ordinary-module single selection while allowing PHP-FPM and language-service multi-selection.

**Architecture:** Extend `StartupGroupCandidate` with category and display metadata, and keep selection/validity rules as pure functions in `StartupGroupRuntime.ts`. `GroupEditor.vue` builds category and module sections from those candidates, renders radio or checkbox cards, and removes invalid saved members from the local draft after candidate loading.

**Tech Stack:** Vue 3 Composition API, TypeScript 5.8, Element Plus `el-collapse`/`el-radio`/`el-checkbox`, Vue I18n, Node `assert`, `tsx`, ESLint, Prettier, `vue-tsc`

---

## File Structure

- Modify `src/render/core/StartupGroupRuntime.ts`: add candidate display metadata and pure selection/validity helpers.
- Modify `scripts/startup-group-test.ts`: cover candidate metadata, single/multi selection, invalid-member cleanup, and the new UI source contract.
- Modify `src/render/components/StartupGroup/GroupEditor.vue`: render nested category/module collapses with selectable version/service cards.
- Modify `src/lang/en/common.json`: add the English “No remark” fallback.
- Modify `src/lang/zh/common.json`: add the Chinese “无备注” fallback.

### Task 1: Add Candidate Metadata and Selection Rules

**Files:**
- Modify: `src/render/core/StartupGroupRuntime.ts:52-149,245-294`
- Test: `scripts/startup-group-test.ts:20-29,450-525`

- [ ] **Step 1: Write failing tests for candidate metadata**

Add `type StartupGroupCandidate` and the new helper imports to the existing `StartupGroupRuntime` import in `scripts/startup-group-test.ts`:

```typescript
import {
  filterValidStartupGroupItems,
  getStartupGroupCandidateWarnings,
  createStartupGroupRuntime,
  startupGroupCandidateAllowsMultiple,
  updateStartupGroupCandidateSelection,
  type StartupGroupCandidate,
  type StartupGroupInstalledTarget,
  type StartupGroupProjectTarget,
  type StartupGroupRuntimeModule
} from '../src/render/core/StartupGroupRuntime'
```

After the existing `const candidates = await runtime.listCandidates()` assertion block, verify the new presentation fields:

```typescript
  assert.deepEqual(
    candidates.map((candidate) => [
      candidate.item.module,
      candidate.moduleType,
      candidate.displayName,
      candidate.displayPath
    ]),
    [
      ['mysql', 'dataBaseServer', '8.0', 'D:/mysql/8.0'],
      ['mysql', 'dataBaseServer', '8.4', 'D:/mysql/8.4'],
      ['php-fpm', 'language', '8.4.8', 'D:/php/8.4.8'],
      ['node', 'language', 'API Server', 'D:/projects/api']
    ]
  )
```

- [ ] **Step 2: Write failing tests for single-selection and multi-selection**

Add this focused block after the runtime candidate test:

```typescript
{
  const makeCandidate = (
    key: string,
    item: StartupGroupItem,
    moduleType: StartupGroupCandidate['moduleType'],
    displayName: string,
    displayPath: string
  ): StartupGroupCandidate => ({
    key,
    label: displayName,
    moduleLabel: item.module,
    moduleType,
    displayName,
    displayPath,
    item
  })

  const mysql80 = makeCandidate(
    'mysql-80',
    { ...mysql, id: 'mysql-80', versionPath: 'D:/mysql/8.0' },
    'dataBaseServer',
    '8.0',
    'D:/mysql/8.0'
  )
  const mysql84 = makeCandidate(
    'mysql-84',
    { ...mysql, id: 'mysql-84' },
    'dataBaseServer',
    '8.4',
    'D:/mysql/8.4'
  )
  const php82 = makeCandidate(
    'php-fpm-82',
    { ...mysql, id: 'php-fpm-82', module: 'php-fpm', versionPath: 'D:/php/8.2' },
    'language',
    '8.2',
    'D:/php/8.2'
  )
  const php84 = makeCandidate(
    'php-fpm-84',
    { ...mysql, id: 'php-fpm-84', module: 'php-fpm', versionPath: 'D:/php/8.4' },
    'language',
    '8.4',
    'D:/php/8.4'
  )
  const nodeApi = makeCandidate(
    'node-api',
    api,
    'language',
    'API Server',
    api.projectPath
  )
  const nodeAdmin = makeCandidate(
    'node-admin',
    { ...api, id: 'admin', projectId: 'project-admin', projectPath: 'D:/projects/admin' },
    'language',
    'Admin Server',
    'D:/projects/admin'
  )
  const all = [mysql80, mysql84, php82, php84, nodeApi, nodeAdmin]

  assert.equal(startupGroupCandidateAllowsMultiple(mysql80), false)
  assert.equal(startupGroupCandidateAllowsMultiple(php82), true)
  assert.equal(startupGroupCandidateAllowsMultiple(nodeApi), true)

  let selected = updateStartupGroupCandidateSelection([], mysql80, all, true)
  selected = updateStartupGroupCandidateSelection(selected, mysql84, all, true)
  assert.deepEqual(selected, ['mysql-84'])

  selected = updateStartupGroupCandidateSelection(selected, php82, all, true)
  selected = updateStartupGroupCandidateSelection(selected, php84, all, true)
  assert.deepEqual(selected, ['mysql-84', 'php-fpm-82', 'php-fpm-84'])

  selected = updateStartupGroupCandidateSelection(selected, nodeApi, all, true)
  selected = updateStartupGroupCandidateSelection(selected, nodeAdmin, all, true)
  assert.deepEqual(selected, [
    'mysql-84',
    'php-fpm-82',
    'php-fpm-84',
    'node-api',
    'node-admin'
  ])

  selected = updateStartupGroupCandidateSelection(selected, php82, all, false)
  assert.deepEqual(selected, ['mysql-84', 'php-fpm-84', 'node-api', 'node-admin'])
}
```

- [ ] **Step 3: Write the failing invalid-member cleanup test**

Add this block after the selection-rule test:

```typescript
{
  const validMysql: StartupGroupCandidate = {
    key: getStartupGroupItemKey(mysql),
    label: 'MySQL 8.4',
    moduleLabel: 'MySQL',
    moduleType: 'dataBaseServer',
    displayName: '8.4',
    displayPath: mysql.versionPath,
    item: mysql
  }
  assert.deepEqual(
    filterValidStartupGroupItems(
      [mysql, { ...redis, versionPath: 'D:/redis/missing' }],
      [validMysql]
    ),
    [mysql]
  )
}
```

- [ ] **Step 4: Update existing manual candidate fixtures for the new required fields**

For every existing candidate literal in `scripts/startup-group-test.ts`, add exact presentation metadata:

```typescript
// mysql-80
moduleType: 'dataBaseServer',
displayName: '8.0',
displayPath: 'D:/mysql/8.0',

// mysql-84
moduleType: 'dataBaseServer',
displayName: '8.4',
displayPath: 'D:/mysql/8.4',

// redis-7
moduleType: 'cacheAndQueue',
displayName: '7',
displayPath: 'D:/redis/7',

// node project candidate
moduleType: 'language',
displayName: 'API Server',
displayPath: api.projectPath,

// sync helper MySQL candidate
moduleType: 'dataBaseServer',
displayName: 'MySQL',
displayPath: mysql.versionPath,

// sync helper Redis candidate
moduleType: 'cacheAndQueue',
displayName: 'Redis',
displayPath: redis.versionPath,
```

- [ ] **Step 5: Run the Startup Group test and verify RED**

Run:

```bash
yarn test:startup-groups
```

Expected: FAIL because the candidate metadata and the three pure helper functions do not exist yet.

- [ ] **Step 6: Extend `StartupGroupCandidate` and add the pure helpers**

In `src/render/core/StartupGroupRuntime.ts`, replace the candidate type and add these functions immediately after `startupGroupCandidateMatchesItem()`:

```typescript
export type StartupGroupCandidate = {
  key: string
  label: string
  moduleLabel: string
  moduleType: AllAppModuleType
  displayName: string
  displayPath: string
  item: StartupGroupItem
  port?: number
}

export function startupGroupCandidateAllowsMultiple(candidate: StartupGroupCandidate) {
  return candidate.item.type === 'language-project' || candidate.item.module === 'php-fpm'
}

export function updateStartupGroupCandidateSelection(
  selectedKeys: string[],
  candidate: StartupGroupCandidate,
  candidates: StartupGroupCandidate[],
  selected: boolean
) {
  const next = selectedKeys.filter((key) => key !== candidate.key)
  if (!selected) return next

  if (startupGroupCandidateAllowsMultiple(candidate)) {
    return [...next, candidate.key]
  }

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

export function filterValidStartupGroupItems(
  items: StartupGroupItem[],
  candidates: StartupGroupCandidate[]
) {
  const candidateByKey = new Map(candidates.map((candidate) => [candidate.key, candidate]))
  return items.filter((item) => {
    const candidate = candidateByKey.get(getStartupGroupItemKey(item))
    return candidate ? startupGroupCandidateMatchesItem(candidate, item) : false
  })
}
```

- [ ] **Step 7: Populate metadata when building candidates**

In the service-version candidate object in `listCandidates()`, add:

```typescript
moduleType: module.moduleType ?? 'other',
displayName: target.version || target.bin,
displayPath: target.path,
```

The complete service candidate object becomes:

```typescript
candidates.push({
  key: getStartupGroupItemKey(item),
  label: `${label} ${target.version || target.bin}`,
  moduleLabel: label,
  moduleType: module.moduleType ?? 'other',
  displayName: target.version || target.bin,
  displayPath: target.path,
  item,
  port: target.port
})
```

The complete language-project candidate object becomes:

```typescript
const label = moduleLabel(module)
candidates.push({
  key: getStartupGroupItemKey(item),
  label: project.comment || project.path,
  moduleLabel: label,
  moduleType: module.moduleType ?? 'other',
  displayName: project.comment?.trim() || '',
  displayPath: project.path,
  item,
  port: project.projectPort
})
```

- [ ] **Step 8: Run the focused test and verify GREEN**

Run:

```bash
yarn test:startup-groups
```

Expected: PASS with `startup group tests passed`.

- [ ] **Step 9: Run targeted static verification**

Run:

```bash
npx prettier --check scripts/startup-group-test.ts src/render/core/StartupGroupRuntime.ts
npx eslint scripts/startup-group-test.ts src/render/core/StartupGroupRuntime.ts
npx vue-tsc --noEmit -p tsconfig.json
git diff --check
```

Expected: all commands exit with status 0.

- [ ] **Step 10: Commit the core candidate changes**

```bash
git add scripts/startup-group-test.ts src/render/core/StartupGroupRuntime.ts
git commit -m "feat: add startup group candidate selection rules"
```

### Task 2: Replace the Flat Checklist with Nested Collapse Cards

**Files:**
- Modify: `src/render/components/StartupGroup/GroupEditor.vue:33-74,129-250`
- Modify: `src/lang/en/common.json:136-180`
- Modify: `src/lang/zh/common.json:136-180`
- Test: `scripts/startup-group-test.ts:530-615`

- [ ] **Step 1: Write failing UI source-contract tests**

In the existing source-contract block in `scripts/startup-group-test.ts`, add these assertions after the current `editorSource` assertions:

```typescript
  assert.match(editorSource, /<el-collapse/)
  assert.match(editorSource, /startup-group-candidate-card/)
  assert.match(editorSource, /<el-radio/)
  assert.match(editorSource, /<el-checkbox/)
  assert.match(editorSource, /candidate\.displayPath/)
  assert.match(editorSource, /common\.startupGroup\.noRemark/)
  assert.doesNotMatch(editorSource, /<el-checkbox-group/)
  assert.doesNotMatch(editorSource, /invalidItems\.length/)
```

Read both translation sources and assert the new key exists:

```typescript
  const enCommonSource = readSource('src/lang/en/common.json')
  const zhCommonSource = readSource('src/lang/zh/common.json')
  assert.match(enCommonSource, /"noRemark": "No remark"/)
  assert.match(zhCommonSource, /"noRemark": "无备注"/)
```

- [ ] **Step 2: Run the Startup Group test and verify RED**

Run:

```bash
yarn test:startup-groups
```

Expected: FAIL because `GroupEditor.vue` still contains the flat checkbox group and the translations do not contain `noRemark`.

- [ ] **Step 3: Replace the selection-step template**

In `GroupEditor.vue`, replace the current `el-checkbox-group` and invalid-member panel with this nested collapse block:

```vue
<el-collapse v-else v-model="expandedCategories" class="startup-group-category-collapse">
  <el-collapse-item
    v-for="category in candidateSections"
    :key="category.key"
    :name="category.key"
  >
    <template #title>
      <span class="font-semibold">{{ I18nT(`aside.${category.key}`) }}</span>
    </template>

    <el-collapse
      :model-value="expandedModules[category.key] ?? []"
      class="startup-group-module-collapse"
      @update:model-value="setExpandedModules(category.key, $event)"
    >
      <el-collapse-item
        v-for="module in category.modules"
        :key="module.key"
        :name="module.key"
      >
        <template #title>
          <span class="font-medium">{{ module.label }}</span>
        </template>

        <div class="grid grid-cols-1 gap-2 md:grid-cols-2">
          <div
            v-for="candidate in module.items"
            :key="candidate.key"
            class="startup-group-candidate-card cursor-pointer rounded border p-3"
            :class="
              isCandidateSelected(candidate)
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30'
                : 'border-zinc-200 dark:border-zinc-700'
            "
            role="button"
            tabindex="0"
            @click="toggleCandidate(candidate)"
            @keydown.enter.prevent="toggleCandidate(candidate)"
          >
            <div class="flex items-start gap-2">
              <el-checkbox
                v-if="startupGroupCandidateAllowsMultiple(candidate)"
                :model-value="isCandidateSelected(candidate)"
                @click.stop
                @change="updateCandidateSelection(candidate, Boolean($event))"
              />
              <el-radio
                v-else
                :model-value="selectedSingleKey(candidate)"
                :value="candidate.key"
                @click.stop
                @change="updateCandidateSelection(candidate, true)"
              />
              <div class="min-w-0 flex-1">
                <div class="font-medium break-all">
                  {{ candidate.displayName || I18nT('common.startupGroup.noRemark') }}
                </div>
                <div class="mt-1 break-all text-xs text-zinc-500">
                  {{ candidate.displayPath }}
                </div>
                <div
                  v-if="candidateWarnings.get(candidate.key)?.length"
                  class="mt-1 text-xs text-amber-500"
                >
                  {{ warningLabel(candidate.key) }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </el-collapse-item>
    </el-collapse>
  </el-collapse-item>
</el-collapse>
```

- [ ] **Step 4: Add category grouping and expansion state**

Update the Vue import and add module type imports:

```typescript
import { computed, reactive, ref, watch } from 'vue'
import { AppModuleTypeList, type AllAppModule, type AllAppModuleType } from '@/core/type'
```

Add the new helper imports:

```typescript
import {
  filterValidStartupGroupItems,
  getStartupGroupCandidateWarnings,
  startupGroupCandidateAllowsMultiple,
  startupGroupCandidateMatchesItem,
  syncStartupGroupSelectedItems,
  updateStartupGroupCandidateSelection,
  type StartupGroupCandidate
} from '@/core/StartupGroupRuntime'
```

Replace `groupedCandidates` and `invalidItems` with:

```typescript
type CandidateModuleSection = {
  key: AllAppModule
  label: string
  items: StartupGroupCandidate[]
}

type CandidateCategorySection = {
  key: AllAppModuleType
  modules: CandidateModuleSection[]
}

const expandedCategories = ref<AllAppModuleType[]>([])
const expandedModules = reactive<Partial<Record<AllAppModuleType, AllAppModule[]>>>({})

const candidateSections = computed<CandidateCategorySection[]>(() => {
  const categories = new Map<
    AllAppModuleType,
    Map<AllAppModule, CandidateModuleSection>
  >()

  for (const candidate of candidates.value) {
    let modules = categories.get(candidate.moduleType)
    if (!modules) {
      modules = new Map()
      categories.set(candidate.moduleType, modules)
    }
    const moduleKey = candidate.item.module
    let module = modules.get(moduleKey)
    if (!module) {
      module = { key: moduleKey, label: candidate.moduleLabel, items: [] }
      modules.set(moduleKey, module)
    }
    module.items.push(candidate)
  }

  return AppModuleTypeList.flatMap((key) => {
    const modules = categories.get(key)
    return modules ? [{ key, modules: [...modules.values()] }] : []
  })
})
```

Add the expansion setter:

```typescript
const setExpandedModules = (
  category: AllAppModuleType,
  value: string | number | Array<string | number>
) => {
  const values = Array.isArray(value) ? value : [value]
  expandedModules[category] = values.map((item) => `${item}` as AllAppModule)
}
```

- [ ] **Step 5: Add card selection behavior**

Add these functions after `candidateFor()`:

```typescript
const isCandidateSelected = (candidate: StartupGroupCandidate) =>
  selectedKeys.value.includes(candidate.key)

const selectedSingleKey = (candidate: StartupGroupCandidate) =>
  selectedKeys.value.find((key) => {
    const selected = candidateByKey.value.get(key)
    return (
      selected?.item.type === 'service-version' &&
      selected.item.module === candidate.item.module
    )
  })

const updateCandidateSelection = (candidate: StartupGroupCandidate, selected: boolean) => {
  selectedKeys.value = updateStartupGroupCandidateSelection(
    selectedKeys.value,
    candidate,
    candidates.value,
    selected
  )
}

const toggleCandidate = (candidate: StartupGroupCandidate) => {
  updateCandidateSelection(
    candidate,
    startupGroupCandidateAllowsMultiple(candidate) ? !isCandidateSelected(candidate) : true
  )
}
```

- [ ] **Step 6: Remove invalid members and initialize collapse expansion in `reset()`**

Replace the candidate-loading portion of `reset()` with:

```typescript
    try {
      candidates.value = await startupGroupRuntime.listCandidates()
      draft.items = filterValidStartupGroupItems(draft.items, candidates.value)
      selectedKeys.value = draft.items.map(itemKey)

      const selected = new Set(selectedKeys.value)
      expandedCategories.value = candidateSections.value.map((category) => category.key)
      for (const key of Object.keys(expandedModules) as AllAppModuleType[]) {
        delete expandedModules[key]
      }
      for (const category of candidateSections.value) {
        expandedModules[category.key] = category.modules
          .filter((module) => module.items.some((candidate) => selected.has(candidate.key)))
          .map((module) => module.key)
      }
    } finally {
      loading.value = false
    }
```

Delete the `invalidItems` computed value. Keep `candidateFor`, `itemLabel`, `syncSelectedItems`, and the startup-order step for valid member labeling and persistence.

- [ ] **Step 7: Add the localized no-remark label**

In `src/lang/en/common.json`, add inside `startupGroup`:

```json
"noRemark": "No remark",
```

In `src/lang/zh/common.json`, add inside `startupGroup`:

```json
"noRemark": "无备注",
```

- [ ] **Step 8: Run the focused test and verify GREEN**

Run:

```bash
yarn test:startup-groups
```

Expected: PASS with `startup group tests passed`.

- [ ] **Step 9: Run formatting and static verification**

Run:

```bash
npx prettier --check scripts/startup-group-test.ts src/render/core/StartupGroupRuntime.ts src/render/components/StartupGroup/GroupEditor.vue src/lang/en/common.json src/lang/zh/common.json
npx eslint scripts/startup-group-test.ts src/render/core/StartupGroupRuntime.ts src/render/components/StartupGroup/GroupEditor.vue
npx vue-tsc --noEmit -p tsconfig.json
git diff --check
```

Expected: all commands exit with status 0. npm mirror/deprecation warnings do not count as failures when the commands exit successfully.

- [ ] **Step 10: Review the final UI diff**

Run:

```bash
git diff -- src/render/components/StartupGroup/GroupEditor.vue src/lang/en/common.json src/lang/zh/common.json scripts/startup-group-test.ts src/render/core/StartupGroupRuntime.ts
```

Expected: the selection step uses nested collapses and custom cards; ordinary service versions are radio-selected, PHP-FPM/language projects are checkbox-selected, invalid-item UI is removed, and the startup-order step remains structurally unchanged.

- [ ] **Step 11: Commit the selector UI**

```bash
git add scripts/startup-group-test.ts src/render/core/StartupGroupRuntime.ts src/render/components/StartupGroup/GroupEditor.vue src/lang/en/common.json src/lang/zh/common.json
git commit -m "feat: add startup group candidate collapse selector"
```
