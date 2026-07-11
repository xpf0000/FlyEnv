# Startup Group Switch Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make startup-group header and member switches reflect only global service state, eliminating the stopped-running-stopped visual bounce when an operation begins.

**Architecture:** Use Element Plus `before-change` as an action hook and always return `false` so the component never mutates its own checked state. Existing parent events start the operation, while global version/project state remains the only source for `model-value`.

**Tech Stack:** Vue 3 Composition API, Element Plus Switch, TypeScript, Node `assert` regression script, ESLint, vue-tsc.

---

## File Map

- `scripts/startup-group-test.ts`: source-level regression assertions for controlled switch behavior.
- `src/render/components/StartupGroup/GroupCard.vue`: header and member switch hooks.

Implementation changes remain uncommitted because the current `master` worktree contains existing user-owned changes.

### Task 1: Write the failing switch-control regression

**Files:**
- Modify: `scripts/startup-group-test.ts`

- [ ] **Step 1: Replace change-event assertions with before-change assertions**

Replace the existing switch assertions with:

```ts
assert.match(cardSource, /:before-change="groupBeforeChange"/)
assert.match(cardSource, /:before-change="\(\) => memberBeforeChange\(item\)"/)
assert.doesNotMatch(cardSource, /@change="groupChange"/)
assert.doesNotMatch(cardSource, /@change="memberChange\(item, \$event\)"/)
```

- [ ] **Step 2: Assert that requested values come from the inverse global state**

Add:

```ts
assert.match(
  cardSource,
  /emit\('group-change', props\.group, !groupRunning\.value\)[\s\S]*?return false/
)
assert.match(
  cardSource,
  /emit\('member-change', props\.group, item, !memberRunning\(item\)\)[\s\S]*?return false/
)
```

These assertions require both hooks to start the inverse action while preventing Element Plus from toggling itself.

- [ ] **Step 3: Run the regression and verify RED**

Run:

```powershell
yarn test:startup-groups
```

Expected: FAIL because `GroupCard.vue` still uses `change` handlers.

- [ ] **Step 4: Review the scoped test diff**

Run:

```powershell
git diff -- scripts/startup-group-test.ts
```

Expected: only switch-control assertions are changed in this task.

### Task 2: Prevent Element Plus internal switch mutation

**Files:**
- Modify: `src/render/components/StartupGroup/GroupCard.vue`
- Test: `scripts/startup-group-test.ts`

- [ ] **Step 1: Change the group header switch hook**

Use:

```vue
<el-switch
  class="flex-shrink-0"
  :model-value="groupRunning"
  :disabled="groupDisabled"
  :before-change="groupBeforeChange"
/>
```

- [ ] **Step 2: Change each member switch hook**

Use:

```vue
<el-switch
  :model-value="memberRunning(item)"
  :disabled="StartupGroupSetup.isMemberDisabled(group, item)"
  :before-change="() => memberBeforeChange(item)"
/>
```

- [ ] **Step 3: Replace change handlers with action-only before-change hooks**

Remove `booleanValue`, `groupChange`, and `memberChange`. Add:

```ts
const groupBeforeChange = () => {
  emit('group-change', props.group, !groupRunning.value)
  return false
}
const memberBeforeChange = (item: StartupGroupItem) => {
  emit('member-change', props.group, item, !memberRunning(item))
  return false
}
```

Keep `defaultChange` unchanged except that it may directly use `value === true` after `booleanValue` is removed:

```ts
const defaultChange = (value: string | number | boolean) =>
  emit('default-change', props.group, value === true)
```

- [ ] **Step 4: Run the regression and verify GREEN**

Run:

```powershell
yarn test:startup-groups
```

Expected: PASS.

- [ ] **Step 5: Run targeted lint and type checks**

Run:

```powershell
npx eslint scripts/startup-group-test.ts src/render/components/StartupGroup/GroupCard.vue
npx vue-tsc --noEmit
```

Expected: both commands exit with code 0.

- [ ] **Step 6: Verify formatting and worktree scope**

Run:

```powershell
git diff --check
git diff -- scripts/startup-group-test.ts src/render/components/StartupGroup/GroupCard.vue
git status --short
```

Expected: no whitespace errors; the new diff is limited to switch regression assertions and `GroupCard.vue`, while pre-existing worktree changes remain untouched.
