# Temporal CLI Website Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show Temporal CLI's website button only while the service is running, using the shared web-UI icon.

**Architecture:** `TemporalCli/Index.vue` derives a reactive `isRunning` state from the existing `BrewStore` module record. The existing `Service` tool slot becomes conditional and uses the shared SVG, while `openURL` remains responsible only for resolving and opening the configured UI port. A source-level regression check captures the UI contract alongside the existing Temporal CLI module tests.

**Tech Stack:** Vue 3 Composition API, TypeScript, Pinia (`BrewStore`), Node `assert`, `tsx`.

---

### Task 1: Add the regression contract

**Files:**
- Modify: `scripts/temporal-cli-module-test.ts`
- Test: `scripts/temporal-cli-module-test.ts`

- [ ] **Step 1: Add a source-level expectation for the service-page contract**

  Append the following after the existing assertions so the test reads the page source and asserts the required rendering contract:

  ```ts
  const temporalCliIndexSource = readFileSync(
    new URL('../src/render/components/TemporalCli/Index.vue', import.meta.url),
    'utf8'
  )
  assert.match(temporalCliIndexSource, /<template v-if="isRunning" #tool-left>/)
  assert.match(temporalCliIndexSource, /:svg="import\('@\/svg\/http\.svg\?raw'\)"/)
  assert.match(
    temporalCliIndexSource,
    /brewStore\.module\('temporal-cli'\)\.installed\.some\(\(m\) => m\.run\)/
  )
  assert.doesNotMatch(temporalCliIndexSource, /import \{ Link \}/)
  ```

- [ ] **Step 2: Run the focused test to verify the old page fails**

  Run: `& 'E:\\Github\\FlyEnv\\node_modules\\.bin\\tsx.cmd' scripts\\temporal-cli-module-test.ts`

  Expected: an `AssertionError`, because the old component renders an unconditional `#tool-left` slot with the Element Plus `Link` icon.

### Task 2: Match the service web-UI pattern

**Files:**
- Modify: `src/render/components/TemporalCli/Index.vue`
- Reference: `src/render/components/Mailpit/Index.vue:10-17`
- Test: `scripts/temporal-cli-module-test.ts`

- [ ] **Step 1: Replace the unconditional button markup**

  Replace the current `#tool-left` block with the same conditional structure used by Mailpit:

  ```vue
  <template v-if="isRunning" #tool-left>
    <el-button style="color: #01cc74" class="button" link @click.stop="openURL">
      <yb-icon
        style="width: 20px; height: 20px; margin-left: 10px"
        :svg="import('@/svg/http.svg?raw')"
      ></yb-icon>
    </el-button>
  </template>
  ```

- [ ] **Step 2: Derive running state from the existing store**

  Immediately after `const brewStore = BrewStore()`, add:

  ```ts
  const isRunning = computed(() => {
    return brewStore.module('temporal-cli').installed.some((m) => m.run)
  })
  ```

  Remove `import { Link } from '@element-plus/icons-vue'`. Do not change `currentVersion` or `openURL`.

- [ ] **Step 3: Run the focused regression test**

  Run: `& 'E:\\Github\\FlyEnv\\node_modules\\.bin\\tsx.cmd' scripts\\temporal-cli-module-test.ts`

  Expected: `ALL CHECKS PASSED` and exit code 0.

### Task 3: Validate and commit the production change

**Files:**
- Modify: `src/render/components/TemporalCli/Index.vue`
- Modify: `scripts/temporal-cli-module-test.ts`

- [ ] **Step 1: Run static analysis and formatting checks for the changed code**

  Run:

  ```powershell
  yarn eslint src/render/components/TemporalCli/Index.vue scripts/temporal-cli-module-test.ts
  yarn prettier --check src/render/components/TemporalCli/Index.vue scripts/temporal-cli-module-test.ts
  git diff --check
  ```

  Expected: each command exits 0. Prettier may print its known `jsxBracketSameLine` deprecation warning but must report both files as formatted.

- [ ] **Step 2: Commit only the implementation and regression test**

  Run:

  ```powershell
  git add -- src/render/components/TemporalCli/Index.vue scripts/temporal-cli-module-test.ts
  git commit -m "fix: align Temporal CLI website button"
  ```

  Expected: one commit containing only the two listed files; the prior design/plan documentation commits remain separate.

- [ ] **Step 3: Re-run the focused test from the committed worktree**

  Run: `& 'E:\\Github\\FlyEnv\\node_modules\\.bin\\tsx.cmd' scripts\\temporal-cli-module-test.ts`

  Expected: `ALL CHECKS PASSED` and exit code 0.
