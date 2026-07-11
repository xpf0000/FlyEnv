# Startup Group Tooltips Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the top-left group control tooltip describe its actual default-group or legacy action and explain the default startup group checkbox behavior.

**Architecture:** Keep tooltip selection local to the existing components because both already own the relevant display context. Add three focused `common.startupGroup` translation keys in Chinese and English, relying on the configured English fallback for other locales.

**Tech Stack:** Vue 3, Element Plus popover/tooltip components, Vue I18n JSON resources, existing assertion-based Startup Group test script.

---

### Task 1: Add Failing Tooltip Contracts

**Files:**
- Modify: `scripts/startup-group-test.ts`
- Test: `scripts/startup-group-test.ts`

- [ ] **Step 1: Assert the top-left control uses dynamic startup-group copy**

In the source-contract block, add assertions for `src/render/components/Aside/Index.vue`:

```ts
assert.match(asideSource, /const groupTooltip = computed/)
assert.match(asideSource, /common\.startupGroup\.controlDefaultTooltip/)
assert.match(asideSource, /common\.startupGroup\.controlLegacyTooltip/)
assert.match(asideSource, /name: defaultStartupGroup\.value\.name/)
assert.match(asideSource, /\{\{ groupTooltip \}\}/)
assert.doesNotMatch(asideSource, /I18nT\('aside\.groupStart'\)/)
```

- [ ] **Step 2: Assert the default checkbox is wrapped by its dedicated tooltip**

Add assertions for `GroupCard.vue`:

```ts
assert.match(
  cardSource,
  /<el-tooltip[^>]*:content="I18nT\('common\.startupGroup\.defaultTooltip'\)"/
)
assert.match(cardSource, /<el-checkbox[^>]*:model-value="isDefault"/)
```

- [ ] **Step 3: Assert approved Chinese and English translations**

Add:

```ts
assert.match(zhCommonSource, /"controlDefaultTooltip": "启动或停止默认启动组：\{name\}"/)
assert.match(zhCommonSource, /"controlLegacyTooltip": "启动或停止所有已显示的服务"/)
assert.match(
  zhCommonSource,
  /"defaultTooltip": "左上角一键启停和应用自动启动服务时，将使用此启动组。"/
)
assert.match(
  enCommonSource,
  /"controlDefaultTooltip": "Start or stop the default startup group: \{name\}"/
)
assert.match(enCommonSource, /"controlLegacyTooltip": "Start or stop all displayed services"/)
assert.match(
  enCommonSource,
  /"defaultTooltip": "The top-left one-click control and automatic service startup will use this startup group\."/
)
```

- [ ] **Step 4: Run the regression script and verify RED**

Run:

```bash
yarn test:startup-groups
```

Expected: FAIL because the dynamic computed tooltip, default checkbox tooltip, and translation keys do not exist.

### Task 2: Add Chinese and English Tooltip Copy

**Files:**
- Modify: `src/lang/zh/common.json`
- Modify: `src/lang/en/common.json`
- Test: `scripts/startup-group-test.ts`

- [ ] **Step 1: Add Chinese keys under `startupGroup`**

Add:

```json
"controlDefaultTooltip": "启动或停止默认启动组：{name}",
"controlLegacyTooltip": "启动或停止所有已显示的服务",
"defaultTooltip": "左上角一键启停和应用自动启动服务时，将使用此启动组。"
```

- [ ] **Step 2: Add English keys under `startupGroup`**

Add:

```json
"controlDefaultTooltip": "Start or stop the default startup group: {name}",
"controlLegacyTooltip": "Start or stop all displayed services",
"defaultTooltip": "The top-left one-click control and automatic service startup will use this startup group."
```

- [ ] **Step 3: Run the regression script**

Run:

```bash
yarn test:startup-groups
```

Expected: translation assertions pass; component assertions still fail.

### Task 3: Update the Top-Left Group Control Tooltip

**Files:**
- Modify: `src/render/components/Aside/Index.vue`
- Test: `scripts/startup-group-test.ts`

- [ ] **Step 1: Replace the fixed popover content**

Change:

```vue
<span>{{ I18nT('aside.groupStart') }}</span>
```

to:

```vue
<span>{{ groupTooltip }}</span>
```

- [ ] **Step 2: Add the computed dynamic tooltip after `defaultStartupGroup`**

Add:

```ts
const groupTooltip = computed(() =>
  defaultStartupGroup.value
    ? I18nT('common.startupGroup.controlDefaultTooltip', {
        name: defaultStartupGroup.value.name
      })
    : I18nT('common.startupGroup.controlLegacyTooltip')
)
```

- [ ] **Step 3: Run the regression script**

Run:

```bash
yarn test:startup-groups
```

Expected: top-left control assertions pass; the default checkbox tooltip assertion still fails.

### Task 4: Add the Default Startup Group Tooltip

**Files:**
- Modify: `src/render/components/StartupGroup/GroupCard.vue`
- Test: `scripts/startup-group-test.ts`

- [ ] **Step 1: Wrap the checkbox with an Element Plus tooltip**

Use:

```vue
<el-tooltip
  :content="I18nT('common.startupGroup.defaultTooltip')"
  placement="top"
  :show-after="600"
>
  <el-checkbox :model-value="isDefault" :disabled="defaultDisabled" @change="defaultChange">
    {{ I18nT('common.startupGroup.default') }}
  </el-checkbox>
</el-tooltip>
```

- [ ] **Step 2: Run the regression script and verify GREEN**

Run:

```bash
yarn test:startup-groups
```

Expected: `startup group tests passed`.

### Task 5: Verify the Focused Change

**Files:**
- Verify: `scripts/startup-group-test.ts`
- Verify: `src/render/components/Aside/Index.vue`
- Verify: `src/render/components/StartupGroup/GroupCard.vue`
- Verify: `src/lang/zh/common.json`
- Verify: `src/lang/en/common.json`

- [ ] **Step 1: Run targeted ESLint**

Run:

```bash
npx eslint scripts/startup-group-test.ts src/render/components/Aside/Index.vue src/render/components/StartupGroup/GroupCard.vue
```

Expected: exit code 0 with no ESLint errors.

- [ ] **Step 2: Run Vue TypeScript checking**

Run:

```bash
npx vue-tsc --noEmit
```

Expected: exit code 0 with no TypeScript errors.

- [ ] **Step 3: Validate JSON and whitespace through the regression and diff checks**

Run:

```bash
yarn test:startup-groups
git diff --check
```

Expected: tests pass and no whitespace errors are reported.

- [ ] **Step 4: Leave implementation changes uncommitted**

The current `master` checkout contains existing user-owned and Startup Group changes. Do not stage or commit implementation files unless the user explicitly requests it.
