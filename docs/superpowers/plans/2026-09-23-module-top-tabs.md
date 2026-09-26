# Module Top Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every module entry page's top-level tabs visually match the Plugin Market segmented tabs.

**Architecture:** Style only a direct `el-radio-group` child of `.soft-index-panel`, the shared structure used by module entry pages. Keep Element Plus bindings and module state untouched, and provide light/dark visual values through existing theme token files.

**Tech Stack:** Vue 3, Element Plus, SCSS, Tailwind-aligned 8px spacing/radius tokens, TypeScript test scripts.

**Spec:** `docs/task/plugin1.png` and the user request from 2026-09-23.

## Global Constraints

- Do not change module state, lifecycle, persistence, IPC, or process ownership.
- Do not style nested radio groups used by forms, dialogs, logs, or configuration panels.
- Match Plugin Market sizing: 4px container padding, 28px tab height, 12px horizontal tab padding, 12px text, and 8px radius.
- Use the existing theme variables for primary/text colors and dedicated segmented-control variables for light/dark surfaces.
- Do not commit from the current dirty shared worktree.

## Review Focus

- Module coverage: the structural selector must cover every current module entry page with a direct top radio group.
- Scope safety: nested radio groups must remain untouched.
- Selected-state contrast: selected labels must remain white in light mode.
- Dark mode: the segmented container must use the existing dark panel surface without a light shadow.
- Responsive mode: the existing narrow-layout offset must become margin rather than expanding the segmented container's internal padding.

---

### Task 1: Shared module entry tab styling

**Files:**
- Create: `scripts/module-top-tabs-test.ts`
- Modify: `package.json`
- Modify: `src/render/style/theme/light-tokens.scss`
- Modify: `src/render/style/dark.scss`
- Modify: `src/render/style/index.scss`

**Interfaces:**
- Consumes: module entry pages using `.soft-index-panel > .el-radio-group` and Element Plus `.el-radio-button` markup.
- Produces: shared `--flyenv-segmented-*` theme variables and scoped module-top-tab rendering.

- [ ] **Step 1: Write the failing structural test**

```ts
const moduleFiles = await findVueFiles('src/render/components')
const moduleEntries = moduleFiles.filter((file) =>
  /<div class="soft-index-panel main-right-panel">\s*<el-radio-group/.test(readFileSync(file, 'utf8'))
)
assert.ok(moduleEntries.length >= 60)
assert.match(sharedStyle, />\s*\.el-radio-group\s*\{/)
assert.match(sharedStyle, /\.el-radio-button\.is-active/)
assert.match(lightTokens, /--flyenv-segmented-background:/)
assert.match(darkStyle, /--flyenv-segmented-shadow:\s*none/)
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `yarn test:module-top-tabs`

Expected: FAIL because the shared segmented tokens and scoped selector do not exist.

- [ ] **Step 3: Add theme tokens and scoped Element Plus styling**

```scss
.soft-index-panel {
  > .el-radio-group {
    align-self: flex-start;
    gap: 2px;
    padding: 4px;
    border: 1px solid var(--flyenv-segmented-border);
    border-radius: 8px;
    background: var(--flyenv-segmented-background);
    box-shadow: var(--flyenv-segmented-shadow);
  }
}
```

Style `.el-radio-button__inner`, hover, active, focus-visible, disabled, and pressed states inside that scoped selector. Set light variables from the existing FlyEnv light palette and dark variables from `--base-bg-color-1` plus `rgba(255, 255, 255, 0.1)`.

- [ ] **Step 4: Preserve narrow-layout spacing**

Change the existing direct top radio-group rule under `@media (max-width: 960px)` from `padding-left: 20px` to `margin-left: 20px` so the 4px segmented-control padding remains uniform.

- [ ] **Step 5: Verify the implementation**

Run:

```bash
yarn test:module-top-tabs
yarn test:plugin-market-ui
yarn test:light-theme
npx sass src/render/style/index.scss /tmp/flyenv-base.css --no-source-map
npx sass src/render/style/light.scss /tmp/flyenv-light.css --no-source-map
npx sass src/render/style/dark.scss /tmp/flyenv-dark.css --no-source-map
npx eslint scripts/module-top-tabs-test.ts
npx prettier --check scripts/module-top-tabs-test.ts src/render/style/theme/light-tokens.scss
git diff --check
```

Expected: all commands pass.
