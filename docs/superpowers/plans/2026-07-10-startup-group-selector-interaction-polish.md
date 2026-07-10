# Startup Group Selector Interaction Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the Startup Group selector hierarchy, make ordinary radio selections clearable, replace native scrolling with `el-scrollbar`, and initialize collapse expansion from selected candidates only.

**Architecture:** Keep the existing candidate model and nested collapse structure. Add one pure toggle helper beside the existing selection update helper, then make `GroupEditor.vue` use it for card and radio clicks while adjusting only presentation and reset-time expansion state.

**Tech Stack:** Vue 3 Composition API, TypeScript 5.8, Element Plus 2.11, Tailwind CSS, SCSS, Node `assert`, `tsx`, ESLint, Prettier, `vue-tsc`

---

## File Structure

- Modify `src/render/core/StartupGroupRuntime.ts`: add a pure candidate-toggle helper that supports clearing ordinary radio selections.
- Modify `src/render/components/StartupGroup/GroupEditor.vue`: use `el-scrollbar`, indent module panels, wire clearable radio interaction, and expand only selected branches.
- Modify `scripts/startup-group-test.ts`: cover toggle behavior and the updated UI source contract.

### Task 1: Add Clearable Selection and Selector Layout Behavior

**Files:**
- Modify: `src/render/core/StartupGroupRuntime.ts:79-124`
- Modify: `src/render/components/StartupGroup/GroupEditor.vue:10-153,175-365,400-405`
- Test: `scripts/startup-group-test.ts:20-31,445-535,695-725`

- [ ] **Step 1: Write the failing pure toggle and UI source-contract tests**

Add `toggleStartupGroupCandidateSelection` to the existing runtime import in `scripts/startup-group-test.ts`:

```typescript
import {
  filterValidStartupGroupItems,
  getStartupGroupCandidateWarnings,
  createStartupGroupRuntime,
  normalizeStartupGroupCandidateSelection,
  startupGroupCandidateAllowsMultiple,
  toggleStartupGroupCandidateSelection,
  updateStartupGroupCandidateSelection,
  type StartupGroupCandidate,
  type StartupGroupInstalledTarget,
  type StartupGroupProjectTarget,
  type StartupGroupRuntimeModule
} from '../src/render/core/StartupGroupRuntime'
```

After the existing selection assertions, add:

```typescript
  assert.deepEqual(toggleStartupGroupCandidateSelection([], mysql84, all), ['mysql-84'])
  assert.deepEqual(toggleStartupGroupCandidateSelection(['mysql-84'], mysql84, all), [])
  assert.deepEqual(
    toggleStartupGroupCandidateSelection(['php-fpm-82'], php84, all),
    ['php-fpm-82', 'php-fpm-84']
  )
```

In the existing source-contract block, add:

```typescript
  assert.match(editorSource, /<el-scrollbar/)
  assert.match(editorSource, /max-height="58vh"/)
  assert.match(editorSource, /startup-group-module-collapse ml-4/)
  assert.match(editorSource, /toggleStartupGroupCandidateSelection/)
  assert.match(editorSource, /@click\.capture\.prevent\.stop="toggleCandidate\(candidate\)"/)
  assert.match(editorSource, /expandedCategories\.value = candidateSections\.value/)
  assert.match(editorSource, /\.filter\(\(category\) =>/)
  assert.doesNotMatch(editorSource, /overflow:\s*auto/)
```

- [ ] **Step 2: Run the Startup Group test and verify RED**

Run:

```bash
yarn test:startup-groups
```

Expected: FAIL because `toggleStartupGroupCandidateSelection` is not exported and `GroupEditor.vue` does not yet contain the new scrollbar, indentation, radio click wiring, or selected-only category expansion.

- [ ] **Step 3: Add the pure toggle helper**

Add this immediately after `updateStartupGroupCandidateSelection()` in `src/render/core/StartupGroupRuntime.ts`:

```typescript
export function toggleStartupGroupCandidateSelection(
  selectedKeys: string[],
  candidate: StartupGroupCandidate,
  candidates: StartupGroupCandidate[]
) {
  return updateStartupGroupCandidateSelection(
    selectedKeys,
    candidate,
    candidates,
    !selectedKeys.includes(candidate.key)
  )
}
```

- [ ] **Step 4: Replace native editor scrolling with `el-scrollbar`**

In `src/render/components/StartupGroup/GroupEditor.vue`, replace the current editor-body opening tag:

```vue
<el-scrollbar max-height="58vh">
  <div class="startup-group-editor-body">
```

After the existing third-step body, replace the single editor-body closing `</div>` with:

```vue
  </div>
</el-scrollbar>
```

Replace the editor body style:

```scss
.startup-group-editor-body {
  min-height: 390px;
  padding: 0 4px;
}
```

Add `ml-4` to the nested module collapse:

```vue
<el-collapse
  :model-value="expandedModules[category.key] ?? []"
  class="startup-group-module-collapse ml-4"
  @update:model-value="setExpandedModules(category.key, $event)"
>
```

- [ ] **Step 5: Make ordinary radio cards clearable without double toggling**

Import the toggle helper in `GroupEditor.vue`:

```typescript
import {
  filterValidStartupGroupItems,
  getStartupGroupCandidateWarnings,
  normalizeStartupGroupCandidateSelection,
  startupGroupCandidateAllowsMultiple,
  startupGroupCandidateMatchesItem,
  syncStartupGroupSelectedItems,
  toggleStartupGroupCandidateSelection,
  updateStartupGroupCandidateSelection,
  type StartupGroupCandidate
} from '@/core/StartupGroupRuntime'
```

Replace `toggleCandidate()` with:

```typescript
const toggleCandidate = (candidate: StartupGroupCandidate) => {
  selectedKeys.value = toggleStartupGroupCandidateSelection(
    selectedKeys.value,
    candidate,
    candidates.value
  )
}
```

Replace the ordinary `el-radio` event handlers with a captured, prevented click so the editor controls the clearable value and the outer card does not also toggle:

```vue
<el-radio
  v-else
  :model-value="selectedSingleKey(candidate)"
  :value="candidate.key"
  @click.capture.prevent.stop="toggleCandidate(candidate)"
/>
```

Keep the existing checkbox `@click.stop` and `@change` handlers unchanged.

- [ ] **Step 6: Expand only categories and modules containing selections**

In `reset()`, replace the current `expandedCategories` assignment with:

```typescript
expandedCategories.value = candidateSections.value
  .filter((category) =>
    category.modules.some((module) =>
      module.items.some((candidate) => selected.has(candidate.key))
    )
  )
  .map((category) => category.key)
```

Keep the existing `expandedModules` cleanup and selected-module mapping. When `selected` is empty, the category filter and every module filter both produce empty arrays.

- [ ] **Step 7: Run the focused test and verify GREEN**

Run:

```bash
yarn test:startup-groups
```

Expected: PASS with `startup group tests passed`.

- [ ] **Step 8: Run targeted static verification**

Run:

```bash
npx prettier --check scripts/startup-group-test.ts src/render/core/StartupGroupRuntime.ts src/render/components/StartupGroup/GroupEditor.vue
npx eslint scripts/startup-group-test.ts src/render/core/StartupGroupRuntime.ts src/render/components/StartupGroup/GroupEditor.vue
npx vue-tsc --noEmit -p tsconfig.json
git diff --check
```

Expected: every command exits with status 0.

- [ ] **Step 9: Commit the interaction polish**

```bash
git add scripts/startup-group-test.ts src/render/core/StartupGroupRuntime.ts src/render/components/StartupGroup/GroupEditor.vue
git commit -m "fix: polish startup group selector interactions"
```
