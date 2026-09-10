# First-launch module presets implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a one-time, multi-select technology-stack picker only on genuinely fresh FlyEnv installations, persist the resulting module-visibility union, and then initialize only the visible modules.

**Architecture:** The main process classifies a fresh install before `electron-store` merges defaults and exposes a versioned root configuration marker. A renderer-local onboarding component owns selection and save state, uses pure helpers to build a platform-filtered visibility map, and emits completion to `App.vue`; `App.vue` remains the sole owner of the existing startup sequence and releases it once after onboarding succeeds.

**Tech Stack:** Electron 39, Vue 3 Composition API, TypeScript, Pinia, Element Plus, Tailwind CSS, Vue I18n, plain `node:assert/strict` regression scripts run through `tsx`.

**Spec:** `docs/superpowers/specs/2026-09-10-first-launch-module-presets-design.md`

## Global constraints

- Only a missing persisted `user.json` is a fresh installation; existing installations upgrading without the marker must migrate directly to completed version `1`.
- PHP is selected initially, and users may select any number of stack cards; preset results are deduplicated unions.
- Foundation flags are exactly `startup-group`, `hosts`, and `tools`.
- Applying a preset changes visibility only; it must not install, start, stop, remove, or configure software.
- The three terminal actions are Apply and start, Customize modules, and Show all modules; the modal has no backdrop, close-icon, or Escape dismissal.
- One acknowledged onboarding IPC request must contain both the final `showItem` map and `moduleOnboardingVersion: 1`; failure keeps the modal open and leaves renderer state unchanged.
- Existing users' visibility settings and unsupported-platform/custom-module entries must remain unchanged.
- Reuse the existing `AppStore`, `BrewStore`, router, and `SetupStore`; add no Pinia store, service lifecycle, fork process, or long-running renderer controller.
- Keep preset-only types and helpers under `src/render/components/ModuleOnboarding/`; only the cross-process version constant/classifier belongs in `src/shared/`.
- Preserve all unrelated working-tree changes, especially the existing StartupGroup edits.

## File structure

- Create `src/shared/ModuleOnboarding.ts`: current onboarding version and pure first-install default classifier.
- Create `src/render/components/ModuleOnboarding/presets.ts`: preset catalog, foundation flags, union/count logic, and visibility-map builders.
- Create `src/render/components/ModuleOnboarding/persistence.ts`: one acknowledged save followed by renderer commit.
- Create `src/render/components/ModuleOnboarding/index.vue`: modal UI, view state, icon mapping, and terminal action handling.
- Create `scripts/module-onboarding-test.ts`: behavior tests plus focused source-contract assertions.
- Modify `src/main/core/ConfigManager.ts`: pre-default persisted-file detection and root marker default.
- Modify `src/main/core/AppNodeFn.ts`: validate and persist the onboarding payload in one main-process configuration patch.
- Modify `src/render/util/NodeFn.ts`: expose the typed, rejecting onboarding IPC client.
- Modify `src/render/store/app.ts`: root marker type/load/save support.
- Modify `src/render/App.vue`: render the modal and gate the existing startup path.
- Modify `src/lang/*/setup.json`: onboarding copy for every built-in locale.
- Modify `package.json`: add `test:module-onboarding`.

---

### Task 1: Classify fresh and existing installations

**Files:**

- Create: `src/shared/ModuleOnboarding.ts`
- Create: `scripts/module-onboarding-test.ts`
- Modify: `src/main/core/ConfigManager.ts:1-220`
- Modify: `package.json:10-120`

**Interfaces:**

- Produces: `MODULE_ONBOARDING_VERSION: 1`.
- Produces: `initialModuleOnboardingVersion(persistedUserConfigExists: boolean): number` returning `0` for a new profile and `1` for an existing profile.
- Produces: root config field `moduleOnboardingVersion: number`.
- Consumes: Electron `app.getPath('userData')` and the known `electron-store` filename `user.json`.

- [ ] **Step 1: Add the first failing classifier tests**

Create `scripts/module-onboarding-test.ts` with direct behavior assertions:

```ts
import assert from 'node:assert/strict'
import {
  MODULE_ONBOARDING_VERSION,
  initialModuleOnboardingVersion
} from '../src/shared/ModuleOnboarding'

assert.equal(MODULE_ONBOARDING_VERSION, 1)
assert.equal(initialModuleOnboardingVersion(false), 0)
assert.equal(initialModuleOnboardingVersion(true), 1)
```

Add the package script:

```json
"test:module-onboarding": "tsx scripts/module-onboarding-test.ts"
```

- [ ] **Step 2: Run the test and confirm the red state**

Run: `yarn test:module-onboarding`

Expected: FAIL because `src/shared/ModuleOnboarding.ts` does not exist.

- [ ] **Step 3: Implement the shared classifier**

Create the shared file with no Electron dependency:

```ts
export const MODULE_ONBOARDING_VERSION = 1 as const

export const initialModuleOnboardingVersion = (persistedUserConfigExists: boolean) =>
  persistedUserConfigExists ? MODULE_ONBOARDING_VERSION : 0
```

- [ ] **Step 4: Apply the classifier before store defaults are created**

In `ConfigManager.ts`, import `app` from Electron, `existsSync` from `node:fs`, `join` from `node:path`, and the shared exports. At the beginning of `initConfig()`, before `new Store`, resolve and inspect the persisted file:

```ts
const userConfigPath = join(app.getPath('userData'), 'user.json')
const persistedUserConfigExists = existsSync(userConfigPath)
```

Add `moduleOnboardingVersion: number` to `ConfigOptions` and add this exact default beside `showTour`:

```ts
moduleOnboardingVersion: initialModuleOnboardingVersion(persistedUserConfigExists),
```

Do not overwrite a stored value: `electron-store` must be allowed to let an existing `0` or `1` override the calculated default. Leave `showTour` untouched.

- [ ] **Step 5: Add source-contract assertions and run the focused test**

Append checks that prevent detection from drifting into renderer storage:

```ts
const configSource = readFileSync('src/main/core/ConfigManager.ts', 'utf8')
assert.match(configSource, /app\.getPath\('userData'\)/)
assert.match(configSource, /existsSync\(userConfigPath\)/)
assert.match(configSource, /moduleOnboardingVersion:/)
```

Add `readFileSync` to the test imports, then run: `yarn test:module-onboarding`.

Expected: PASS with no files created outside normal test execution.

- [ ] **Step 6: Type-check through the production bundle boundary**

Run: `npx prettier --check src/shared/ModuleOnboarding.ts src/main/core/ConfigManager.ts scripts/module-onboarding-test.ts package.json`

Expected: all four files pass formatting.

- [ ] **Step 7: Commit the classifier slice**

```bash
git add package.json scripts/module-onboarding-test.ts src/shared/ModuleOnboarding.ts src/main/core/ConfigManager.ts
git commit -m "feat: classify module onboarding installs"
```

### Task 2: Build deterministic stack-preset unions

**Files:**

- Create: `src/render/components/ModuleOnboarding/presets.ts`
- Modify: `scripts/module-onboarding-test.ts`

**Interfaces:**

- Produces: `ModuleStackPresetId`, the eight-value union `php | node | java | python | go | dotnet | ruby | rust`.
- Produces: `MODULE_STACK_PRESETS: readonly ModuleStackPreset[]` with `id`, `label`, `icon`, and `modules`.
- Produces: `MODULE_ONBOARDING_FOUNDATION_FLAGS` containing the three exact foundation flags.
- Produces: `collectPresetFlags(selected: readonly ModuleStackPresetId[]): Set<AllAppModule>`.
- Produces: `buildPresetVisibility(current, supported, selected): ModuleVisibilityMap`.
- Produces: `buildAllVisible(current, supported): ModuleVisibilityMap`.

- [ ] **Step 1: Add failing tests for the catalog and PHP/Python union**

Extend `scripts/module-onboarding-test.ts` to import the new exports and assert the approved catalog:

```ts
assert.deepEqual(MODULE_ONBOARDING_FOUNDATION_FLAGS, [
  'startup-group',
  'hosts',
  'tools'
])
assert.equal(MODULE_STACK_PRESETS[0]?.id, 'php')
assert.equal(MODULE_STACK_PRESETS.length, 8)
```

Use `collectPresetFlags(['php', 'python'])` and assert that it contains `php`, `php-fpm`, `python`, `node`, `mysql`, `mariadb`, `postgresql`, `nginx`, and `redis`, and that the set contains exactly 13 flags including the three foundation flags.

- [ ] **Step 2: Run the test and confirm the red state**

Run: `yarn test:module-onboarding`

Expected: FAIL because `ModuleOnboarding/presets.ts` does not exist.

- [ ] **Step 3: Implement the exact catalog**

Define the local types, foundation list, and all eight entries exactly as follows:

```ts
export type ModuleVisibilityMap = Partial<Record<string, boolean>>
export const MODULE_ONBOARDING_FOUNDATION_FLAGS = [
  'startup-group', 'hosts', 'tools'
] as const satisfies readonly AllAppModule[]
export const MODULE_STACK_PRESETS = [
  { id: 'php', label: 'PHP', icon: 'php', modules: ['php', 'php-fpm', 'apache', 'nginx', 'node', 'mysql', 'mariadb', 'redis'] },
  { id: 'node', label: 'Node.js', icon: 'node', modules: ['node', 'nginx', 'mysql', 'postgresql', 'mongodb', 'redis'] },
  { id: 'java', label: 'Java', icon: 'java', modules: ['java', 'gradle', 'tomcat', 'nginx', 'mysql', 'postgresql', 'redis'] },
  { id: 'python', label: 'Python', icon: 'python', modules: ['python', 'nginx', 'mysql', 'postgresql', 'redis'] },
  { id: 'go', label: 'Go', icon: 'go', modules: ['golang', 'nginx', 'mysql', 'postgresql', 'redis'] },
  { id: 'dotnet', label: '.NET', icon: 'dotnet', modules: ['dotnet', 'nginx', 'mysql', 'postgresql', 'redis'] },
  { id: 'ruby', label: 'Ruby', icon: 'ruby', modules: ['ruby', 'node', 'nginx', 'mysql', 'postgresql', 'redis'] },
  { id: 'rust', label: 'Rust', icon: 'rust', modules: ['rust', 'nginx', 'mysql', 'postgresql', 'redis'] }
] as const satisfies readonly ModuleStackPreset[]
```

Define `ModuleStackPreset` with `id`, `label`, `icon`, and `readonly AllAppModule[] modules`, then derive `ModuleStackPresetId` from `(typeof MODULE_STACK_PRESETS)[number]['id']`.

Keep this file free of Vue, Pinia, router, IPC, and platform-global imports.

- [ ] **Step 4: Implement union and visibility builders**

Use a copied map so unsupported and custom entries survive:

```ts
export const buildPresetVisibility = (current, supported, selected) => {
  const next = { ...current }
  const enabled = collectPresetFlags(selected)
  for (const flag of supported) next[flag] = enabled.has(flag)
  return next
}
```

`collectPresetFlags` starts with the foundation list and adds every module in each selected preset. `buildAllVisible` copies `current` and sets every `supported` flag to `true`.

- [ ] **Step 5: Add preservation and empty-selection tests**

Cover these exact cases:

```ts
const current = { linuxOnly: false, customerX: false }
const supported = ['php', 'python', 'redis'] as AllAppModule[]
assert.deepEqual(buildPresetVisibility(current, supported, []), {
  linuxOnly: false, customerX: false, php: false, python: false, redis: false
})
```

Add a second case whose supported list includes the three foundation flags and assert they become `true`. Add a Show all case and verify every supported flag is `true` while `customerX` remains unchanged.

- [ ] **Step 6: Run and format the preset slice**

Run: `yarn test:module-onboarding`

Expected: PASS.

Run: `npx prettier --check src/render/components/ModuleOnboarding/presets.ts scripts/module-onboarding-test.ts`

Expected: both files pass formatting.

- [ ] **Step 7: Commit the preset slice**

```bash
git add scripts/module-onboarding-test.ts src/render/components/ModuleOnboarding/presets.ts
git commit -m "feat: add module stack presets"
```

### Task 3: Persist onboarding choices through one acknowledged IPC

**Files:**

- Create: `src/render/components/ModuleOnboarding/persistence.ts`
- Modify: `src/shared/ModuleOnboarding.ts`
- Modify: `src/main/core/ConfigManager.ts:1-270`
- Modify: `src/main/core/AppNodeFn.ts:70-340`
- Modify: `src/render/util/NodeFn.ts:1-190`
- Modify: `src/render/store/app.ts:80-310`
- Modify: `scripts/module-onboarding-test.ts`

**Interfaces:**

- Produces: `ModuleOnboardingConfigTarget`, containing the root marker and nested `showItem` map.
- Produces: shared `CompleteModuleOnboardingRequest` and `ModuleOnboardingIPCResult` types.
- Produces: `ConfigManager.completeModuleOnboarding(showItem?): void`, which writes one configuration patch.
- Produces: `app.completeModuleOnboarding(payload): Promise<true>`, rejecting a non-zero main-process response.
- Produces: `persistModuleOnboarding(config, nextVisibility, save): Promise<void>`; renderer state changes only after `save` succeeds.
- Updates: `AppStore.config.moduleOnboardingVersion` is loaded from main configuration and included in every later `saveConfig()` payload.

- [ ] **Step 1: Write failing acknowledged-persistence tests**

Test a successful call by recording the immutable request received by `save`. Assert that it contains both version `1` and the new visibility map, while renderer state changes only after the callback resolves:

```ts
const config = makeConfig(0, { php: true })
await persistModuleOnboarding(config, { php: false, python: true }, async (request) => {
  assert.deepEqual(request.showItem, { php: false, python: true })
  assert.equal(config.moduleOnboardingVersion, 0)
})
assert.equal(config.moduleOnboardingVersion, 1)
```

Add a rejected-save case and assert the original marker and visibility map never change. Add a case with `nextVisibility` omitted and assert Customize sends no `showItem` property and changes only the version after success.

- [ ] **Step 2: Run the focused test and confirm the red state**

Run: `yarn test:module-onboarding`

Expected: FAIL because `persistence.ts` does not exist.

- [ ] **Step 3: Define the shared IPC payload and result**

Extend `src/shared/ModuleOnboarding.ts` with JSON-safe types:

```ts
export type ModuleOnboardingVisibility = Partial<Record<string, boolean>>
export type CompleteModuleOnboardingRequest = {
  moduleOnboardingVersion: number
  showItem?: ModuleOnboardingVisibility
}
export type ModuleOnboardingIPCResult = { code: 0; data: true } | { code: 1; msg: string }
```

- [ ] **Step 4: Implement main-process validation and atomic persistence**

Add `ConfigManager.completeModuleOnboarding(showItem?)`. It copies the current setup and replaces only `setup.common.showItem` when the request includes it, then calls the underlying store's `set` once:

```ts
const patch: Partial<ConfigOptions> = {
  moduleOnboardingVersion: MODULE_ONBOARDING_VERSION
}
if (showItem) {
  const setup = this.getConfig('setup')!
  patch.setup = { ...setup, common: { ...setup.common, showItem: { ...showItem } } }
}
this.config?.set(patch)
```

Add `app_completeModuleOnboarding` to `AppNodeFn`. Reject a missing `configManager`, a version other than `MODULE_ONBOARDING_VERSION`, `null`/array/non-object `showItem`, or any present visibility value that is not boolean. Call `configManager.completeModuleOnboarding(request.showItem)`, then send `{ code: 0, data: true }`. Catch every error locally and send `{ code: 1, msg }`; do not rely on `IPCHandler.handleNodeFn`, which currently swallows thrown exceptions.

- [ ] **Step 5: Expose a typed renderer client that rejects failures**

In `NodeFn.ts`, create a raw call with `createIPCCall` and wrap it:

```ts
const completeModuleOnboarding = createIPCCall<
  [CompleteModuleOnboardingRequest], ModuleOnboardingIPCResult
>('app', 'completeModuleOnboarding')
```

Add `app.completeModuleOnboarding`, await the raw response, return `true` for `code === 0`, and throw `new Error(response.msg)` otherwise.

- [ ] **Step 6: Implement renderer commit-after-acknowledgement**

Create the helper with this contract:

```ts
export async function persistModuleOnboarding(
  config: ModuleOnboardingConfigTarget,
  nextVisibility: ModuleVisibilityMap | undefined,
  save: (request: CompleteModuleOnboardingRequest) => Promise<unknown>
): Promise<void>
```

Build one request containing `moduleOnboardingVersion: MODULE_ONBOARDING_VERSION` and a copied `showItem` only when provided. Await `save(request)` once before mutating `config`. After success, assign the new visibility map when provided and set the renderer marker to `MODULE_ONBOARDING_VERSION`. On rejection, rethrow without touching renderer state. Do not catch or display errors in this pure helper.

- [ ] **Step 7: Carry the root marker through AppStore**

Export `AppShowItem`, add `moduleOnboardingVersion: number` to `State.config`, initialize it to `MODULE_ONBOARDING_VERSION` in the local pre-bootstrap state, load `config?.moduleOnboardingVersion ?? MODULE_ONBOARDING_VERSION`, and add it to the existing `saveConfig()` payload:

```ts
const args = JSON.parse(JSON.stringify({
  moduleOnboardingVersion: this.config.moduleOnboardingVersion,
  server,
  password: this.config.password,
  setup,
  httpServe: this.httpServe
}))
```

The pre-bootstrap value is `1` so the UI cannot flash onboarding before `initConfig()` finishes; a genuine `0` from main replaces it before the app mounts.

- [ ] **Step 8: Add source assertions for IPC and root-marker flow**

Read `ConfigManager.ts`, `AppNodeFn.ts`, `NodeFn.ts`, and `src/render/store/app.ts` in the focused script. Assert that `completeModuleOnboarding` calls the store's `set` once with one patch; assert that the main handler validates the version and sends both structured terminal responses; assert that the renderer wrapper rejects `code: 1`; assert that `moduleOnboardingVersion` appears in the `INIT_CONFIG` input and ordinary serialized save payload. Also assert that `showTour` is not used by any file under `src/render/components/ModuleOnboarding/`.

- [ ] **Step 9: Run and format the persistence slice**

Run: `yarn test:module-onboarding`

Expected: PASS, including success, Customize, validation failure, and unchanged renderer state on rejection.

Run: `npx prettier --check src/shared/ModuleOnboarding.ts src/main/core/AppNodeFn.ts src/render/util/NodeFn.ts src/render/components/ModuleOnboarding/persistence.ts src/render/store/app.ts scripts/module-onboarding-test.ts`

Expected: all files pass formatting.

- [ ] **Step 10: Commit the persistence slice**

```bash
git add scripts/module-onboarding-test.ts src/shared/ModuleOnboarding.ts src/main/core/AppNodeFn.ts src/render/util/NodeFn.ts src/render/components/ModuleOnboarding/persistence.ts src/render/store/app.ts
git commit -m "feat: persist module onboarding choices"
```

### Task 4: Add the non-dismissible multi-select modal

**Files:**

- Create: `src/render/components/ModuleOnboarding/index.vue`
- Modify: `scripts/module-onboarding-test.ts`

**Interfaces:**

- Consumes: `supportedFlags: readonly AllAppModule[]` from `App.vue`.
- Consumes: `MODULE_STACK_PRESETS`, `buildPresetVisibility`, `buildAllVisible`, and `persistModuleOnboarding`.
- Produces: `resolved(destination: 'main' | 'module-settings')` only after persistence succeeds.

- [ ] **Step 1: Add failing modal contract assertions**

Read the future Vue file from the regression script and assert all of these literal contracts:

```ts
assert.match(dialogSource, /:show-close="false"/)
assert.match(dialogSource, /:close-on-click-modal="false"/)
assert.match(dialogSource, /:close-on-press-escape="false"/)
assert.match(dialogSource, /aria-pressed/)
assert.match(dialogSource, /\['php'\]/)
```

Also assert that it imports both visibility builders and `persistModuleOnboarding`, declares a `saving` guard, and emits `module-settings` only from the Customize action.

- [ ] **Step 2: Run the focused test and confirm the red state**

Run: `yarn test:module-onboarding`

Expected: FAIL because `ModuleOnboarding/index.vue` does not exist.

- [ ] **Step 3: Build the dialog shell and accessible cards**

Use an always-open Element Plus dialog:

```vue
<el-dialog
  :model-value="true"
  width="780px"
  :show-close="false"
  :close-on-click-modal="false"
  :close-on-press-escape="false"
>
```

Render the eight presets as native `<button type="button">` cards in a responsive two-column grid. Bind `:aria-pressed="selected.includes(preset.id)"`; toggle by replacing the selected array; apply a yellow accent border/background only to selected cards. Show each preset's comma-separated module labels and `selectedModuleCount` from the deduplicated, platform-filtered union.

- [ ] **Step 4: Reuse the eight existing technology SVGs**

Import `php.svg`, `nodejs.svg`, `java.svg`, `python.svg`, `Golang.svg`, `dotnet.svg`, `Ruby.svg`, and `rust.svg` with `?raw`, map them by preset icon key, and render them through `yb-icon`. Do not add image files or duplicate SVG content.

- [ ] **Step 5: Implement the three guarded actions**

Initialize selection with PHP and define one `run` helper:

```ts
const selected = ref<ModuleStackPresetId[]>(['php'])
const saving = ref(false)
const emit = defineEmits<{ resolved: [destination: 'main' | 'module-settings'] }>()
```

For Apply, pass `buildPresetVisibility(current, supportedFlags, selected)`; for Show all, pass `buildAllVisible(current, supportedFlags)`; for Customize, pass `undefined`. Each action returns immediately while `saving` is true, calls `persistModuleOnboarding` with `app.completeModuleOnboarding`, and emits only after the one main-process request succeeds. On failure, call `MessageError(I18nT('setup.moduleOnboarding.saveFailed'))`; always clear `saving` in `finally`.

- [ ] **Step 6: Add the live count and terminal controls**

Compute the count from the resulting supported map rather than summing preset lengths:

```ts
const selectedModuleCount = computed(() =>
  props.supportedFlags.filter((flag) => previewVisibility.value[flag] !== false).length
)
```

Disable all three terminal actions while saving. Make Apply the primary button, Customize a plain secondary button, and Show all a link-style button. Do not add a Skip action.

- [ ] **Step 7: Run the focused test and formatting**

Run: `yarn test:module-onboarding`

Expected: PASS for non-dismissible behavior, PHP default, union usage, and terminal-action wiring.

Run: `npx prettier --check src/render/components/ModuleOnboarding/index.vue scripts/module-onboarding-test.ts`

Expected: both files pass formatting.

- [ ] **Step 8: Commit the modal slice**

```bash
git add scripts/module-onboarding-test.ts src/render/components/ModuleOnboarding/index.vue
git commit -m "feat: add module onboarding dialog"
```

### Task 5: Gate startup and route Customize to Settings → Modules

**Files:**

- Modify: `src/render/App.vue:1-230`
- Modify: `scripts/module-onboarding-test.ts`

**Interfaces:**

- Consumes: `MODULE_ONBOARDING_VERSION` and `ModuleOnboarding`.
- Passes: current-platform `supportedFlags` to the modal.
- Handles: `resolved('main' | 'module-settings')`.
- Preserves: the existing `startupInitialized` and `modulesInitialized` idempotence guards.

- [ ] **Step 1: Add failing bootstrap source-contract assertions**

Extend the test to assert that `App.vue` renders `ModuleOnboarding`, compares the stored version with `MODULE_ONBOARDING_VERSION`, and routes every call site that currently invokes `init()` through one onboarding-aware gate. Assert that no initialization call is made directly from the modal component.

- [ ] **Step 2: Run the focused test and confirm the red state**

Run: `yarn test:module-onboarding`

Expected: FAIL because `App.vue` does not yet integrate the modal.

- [ ] **Step 3: Add the bootstrap gate**

In `App.vue`, derive:

```ts
const onboardingRequired = computed(
  () => appStore.config.moduleOnboardingVersion < MODULE_ONBOARDING_VERSION
)
const onboardingResolved = ref(!onboardingRequired.value)
const initializeWhenAllowed = () => onboardingResolved.value ? init() : Promise.resolve()
```

Replace the `init()` calls in `onMounted` and the `APP-Data-Directory-Ready` listener with `initializeWhenAllowed()`. Do not move `initializeModules`, host synchronization, proxy checking, or installed-version fetching into the onboarding component.

- [ ] **Step 4: Render the modal with current-platform flags**

Add the component after `VueSvg` and before `router-view` so symbols are available while the dialog overlays the application:

```vue
<ModuleOnboarding
  v-if="onboardingRequired && !onboardingResolved"
  :supported-flags="platformModule.map((item) => item.typeFlag)"
  @resolved="handleOnboardingResolved"
/>
```

Do not hide the title bar or replace the router. The overlay prevents interaction until one terminal action succeeds.

- [ ] **Step 5: Resolve initialization and Customize navigation exactly once**

Implement the handler so it first sets `onboardingResolved = true`; for `module-settings`, set `SetupStore().tab = 'module'`, set `appStore.currentPage = '/setup'`, and await `Router.push('/setup')`; then call `initializeWhenAllowed()`. Rely on the existing two idempotence guards if the data-directory-ready event races with the completion handler.

- [ ] **Step 6: Add race and routing assertions**

The source test must verify:

- `APP-Data-Directory-Ready` calls `initializeWhenAllowed`, not `init`.
- `onMounted` calls `initializeWhenAllowed`, not `init`.
- The completion handler sets `onboardingResolved` before initialization.
- Customize assigns `SetupStore().tab = 'module'` and navigates to `/setup`.
- `startupInitialized` and `modulesInitialized` remain present.

- [ ] **Step 7: Run focused and module-boundary checks**

Run: `yarn test:module-onboarding`

Expected: PASS.

Run: `yarn test:renderer-operation-boundaries`

Expected: PASS; no new page-owned long-running operation or controller violation is reported.

Run: `npx prettier --check src/render/App.vue scripts/module-onboarding-test.ts`

Expected: both files pass formatting.

- [ ] **Step 8: Commit the bootstrap slice**

```bash
git add scripts/module-onboarding-test.ts src/render/App.vue
git commit -m "feat: gate startup on module onboarding"
```

### Task 6: Localize the first-launch experience

**Files:**

- Modify: every `src/lang/*/setup.json`
- Modify: `scripts/module-onboarding-test.ts`

**Interfaces:**

- Produces the `setup.moduleOnboarding` object with keys `title`, `description`, `selectedCount`, `apply`, `customize`, `showAll`, and `saveFailed` in all 33 built-in locale directories.
- Consumes `{count}` as the only interpolation variable.

- [ ] **Step 1: Add a failing locale-parity test**

In the focused script, enumerate the source directories in `BuiltInLocaleCatalog`, parse each `setup.json`, and assert that all seven onboarding keys are non-empty strings. Assert that `selectedCount` contains `{count}`.

```ts
const keys = ['title', 'description', 'selectedCount', 'apply', 'customize', 'showAll', 'saveFailed']
for (const locale of Object.values(BuiltInLocaleCatalog)) {
  const setup = JSON.parse(readFileSync(`src/lang/${locale.sourceDir}/setup.json`, 'utf8'))
  for (const key of keys) assert.equal(typeof setup.moduleOnboarding[key], 'string')
}
```

- [ ] **Step 2: Run the focused test and confirm the red state**

Run: `yarn test:module-onboarding`

Expected: FAIL on the first locale missing `setup.moduleOnboarding`.

- [ ] **Step 3: Add the approved English source copy**

Add this object to `src/lang/en/setup.json`:

```json
"moduleOnboarding": {
  "title": "Choose your technology stacks",
  "description": "FlyEnv will show only the related modules. You can change this later in Settings → Modules.",
  "selectedCount": "{count} modules will be shown",
  "apply": "Apply and start",
  "customize": "Customize modules",
  "showAll": "Show all modules",
  "saveFailed": "Could not save your module selection. Please try again."
}
```

- [ ] **Step 4: Add the approved Simplified and Traditional Chinese copy**

Use these exact Simplified Chinese values in `src/lang/zh/setup.json`: `选择你常用的技术栈`, `FlyEnv 将只显示相关模块，之后可随时在“设置 → 模块”中调整。`, `将显示 {count} 个模块`, `应用并开始使用`, `自定义模块`, `显示全部模块`, and `无法保存模块选择，请重试。`

Use these exact Traditional Chinese values in `src/lang/zh-hant/setup.json`: `選擇你常用的技術棧`, `FlyEnv 將只顯示相關模組，之後可隨時在「設定 → 模組」中調整。`, `將顯示 {count} 個模組`, `套用並開始使用`, `自訂模組`, `顯示全部模組`, and `無法儲存模組選擇，請重試。`

- [ ] **Step 5: Translate the same seven messages for every remaining built-in locale**

Update `ar`, `az`, `bg`, `bn`, `cs`, `da`, `de`, `el`, `es`, `fa`, `fi`, `fr`, `hi`, `hr`, `hu`, `id`, `it`, `ja`, `ko`, `nl`, `no`, `pl`, `pt`, `pt-br`, `ro`, `ru`, `sv`, `tr`, `uk`, and `vi`. Each locale must express the same action semantics as the English source, preserve the product name `FlyEnv`, preserve `{count}` verbatim, and use that locale's existing terminology for Settings and Modules. Do not call a translation API or external model.

- [ ] **Step 6: Run locale parity and asset-build tests**

Run: `yarn test:module-onboarding`

Expected: PASS across all 33 locale directories.

Run: `yarn test:language-assets`

Expected: PASS.

Run: `yarn build:language-assets`

Expected: generated language assets complete without invalid JSON or duplicate namespaces; do not commit `dist/` output.

- [ ] **Step 7: Format and commit localization**

Run: `npx prettier --check "src/lang/*/setup.json" scripts/module-onboarding-test.ts`

Expected: all locale files and the test pass formatting.

```bash
git add scripts/module-onboarding-test.ts src/lang/*/setup.json
git commit -m "feat: localize module onboarding"
```

### Task 7: Verify the complete feature and protect existing behavior

**Files:**

- Modify only if a verification command reveals a defect in files already listed above.

**Interfaces:**

- Verifies the integrated main-process classifier, renderer persistence, modal, bootstrap gate, settings route, language assets, and existing visibility/lifecycle boundaries.

- [ ] **Step 1: Run the focused regression test from a clean process**

Run: `yarn test:module-onboarding`

Expected: PASS and print `module onboarding tests passed`.

- [ ] **Step 2: Run neighboring regression suites**

Run: `yarn test:startup-groups`

Expected: PASS without changing the user's pre-existing StartupGroup work.

Run: `yarn test:renderer-operation-boundaries`

Expected: PASS.

Run: `yarn test:language-assets`

Expected: PASS.

- [ ] **Step 3: Run formatting checks on every touched source file**

Run:

```bash
npx prettier --check package.json scripts/module-onboarding-test.ts src/shared/ModuleOnboarding.ts src/main/core/ConfigManager.ts src/main/core/AppNodeFn.ts src/render/util/NodeFn.ts src/render/store/app.ts src/render/App.vue src/render/components/ModuleOnboarding src/lang/*/setup.json
```

Expected: PASS. If formatting is required, run Prettier only on this explicit file set and inspect the diff before continuing.

- [ ] **Step 4: Build the production application**

Run: `yarn build`

Expected: renderer, main, and fork bundles compile successfully and Electron Builder completes for the current platform.

- [ ] **Step 5: Perform fresh/upgrade/manual UI checks**

Use temporary copies of the application user-data directory; do not delete or edit the developer's real FlyEnv profile. Verify:

- No `user.json`: PHP is selected, the count is deduplicated, no installed-version scan starts before resolution, and Apply produces the approved filtered sidebar.
- Existing `user.json` without the marker: no dialog appears and the original `showItem` map is byte-for-byte equivalent after migration except for the new root marker.
- Fresh profile plus PHP and Python: visible flags equal the approved union and foundation set.
- Customize: Settings opens directly on Modules and all default modules remain available for manual changes.
- Show all: every current-platform built-in module appears.
- Simulated rejected save: the dialog remains open, selection is retained, renderer configuration remains unchanged, and retry succeeds.
- Light/dark themes, keyboard Tab/Space/Enter navigation, narrow window size, and long labels remain usable without overflow.

- [ ] **Step 6: Inspect the final diff and commit any verification-only fixes**

Run: `git status --short` and `git diff --check`.

Expected: only intentional onboarding changes plus the user's unrelated pre-existing StartupGroup edits are present; no generated `dist/` output is staged.

If verification required fixes, stage only onboarding files and commit:

```bash
git add package.json scripts/module-onboarding-test.ts src/shared/ModuleOnboarding.ts src/main/core/ConfigManager.ts src/main/core/AppNodeFn.ts src/render/util/NodeFn.ts src/render/store/app.ts src/render/App.vue src/render/components/ModuleOnboarding src/lang/*/setup.json
git commit -m "fix: harden module onboarding flow"
```
