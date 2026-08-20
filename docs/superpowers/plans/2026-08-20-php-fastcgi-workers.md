# PHP FastCGI Worker Count Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Windows users set a validated `php-cgi-spawner.exe` worker count per installed PHP directory, with an effective default of 4 for every service launch route.

**Architecture:** `Php.win` owns a small JSON-backed store at `<PhpDir>/fastcgi-workers.json`, keyed by normalized PHP installation path. Every `startService` call reads the store immediately before spawning, so renderer starts, startup groups, automatic startup, and MCP all get the same count. The PHP-FPM service page injects its version action into the shared PHP version list and owns only the related view state and explicit fork read/write commands.

**Tech Stack:** TypeScript, Electron fork IPC, Vue 3 Composition API, Element Plus, Node `fs/promises`, `tsx` assertion scripts.

**Operation contract:** The persisted count and launch-time lookup belong to the Windows PHP fork module; the PHP-FPM dialog input and menu display belong to mounted Vue components. Save is a short fork write with no intermediate events and resolves or rejects once. Restart delegates to the existing `ModuleInstalledItem.restart()` lifecycle, which guards duplicate starts and owns process state. The fork serializes concurrent writes; the last valid save wins. No new Pinia state, `config.setup` field, renderer persistence, or start parameters are introduced.

---

### Task 1: Test the Fork-Owned Worker Store

**Files:**
- Create: `scripts/php-fastcgi-workers-test.ts`
- Create: `src/fork/module/Php.win/FastCgiWorkers.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the failing store test**

Create `scripts/php-fastcgi-workers-test.ts` with real temporary-file assertions for the intended API:

```ts
const store = new FastCgiWorkerStore(settingsFile)
assert.equal(await store.get('C:\\FlyEnv\\PHP\\8.4'), 4)
await store.set('C:\\FlyEnv\\PHP\\8.4', 10)
assert.equal(await store.get('c:/flyenv/php/8.4/'), 10)
assert.equal(await store.get('C:\\FlyEnv\\PHP\\8.3'), 4)
await assert.rejects(() => store.set('C:\\FlyEnv\\PHP\\8.4', 0), /between 1 and 64/)
```

Also assert normalized JSON keys, malformed-file fallback to `4`, and a distinct stored value for `8.3`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn tsx scripts/php-fastcgi-workers-test.ts`

Expected: failure because `../src/fork/module/Php.win/FastCgiWorkers` does not exist.

- [ ] **Step 3: Implement the minimal fork-local store**

Create `src/fork/module/Php.win/FastCgiWorkers.ts` with this public boundary:

```ts
export const DEFAULT_FASTCGI_WORKER_COUNT = 4
export const MIN_FASTCGI_WORKER_COUNT = 1
export const MAX_FASTCGI_WORKER_COUNT = 64

export class FastCgiWorkerStore {
  constructor(readonly filePath: string) {}
  get(versionPath: string): Promise<number>
  set(versionPath: string, count: number): Promise<number>
}
```

Normalize paths with `path.win32.normalize`, slash conversion, trailing-slash removal, and lowercasing. Parse only a plain object of in-range integer values; an absent, unreadable, malformed, or invalid entry returns `4`. Validate before queueing writes, serialize writes with a promise tail, create the parent directory, and write JSON through a same-directory temporary file followed by `rename`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn tsx scripts/php-fastcgi-workers-test.ts`

Expected: `php-fastcgi-workers-test: ok`.

- [ ] **Step 5: Register the focused test command**

Add this package script:

```json
"test:php-fastcgi-workers": "tsx scripts/php-fastcgi-workers-test.ts"
```

Run: `yarn test:php-fastcgi-workers`

Expected: `php-fastcgi-workers-test: ok`.

### Task 2: Route Every PHP Start Through the Store

**Files:**
- Modify: `scripts/php-fastcgi-workers-test.ts`
- Modify: `src/fork/module/Php.win/index.ts`

- [ ] **Step 1: Extend the test with fork integration assertions**

Append source assertions stating that the Windows PHP fork exposes `getFastCgiWorkerCount` and `setFastCgiWorkerCount`, and that `_startServer(version)` gets the effective count before constructing the third spawner argument:

```ts
assert.match(phpSource, /getFastCgiWorkerCount\(version: SoftInstalled\)/)
assert.match(phpSource, /setFastCgiWorkerCount\(version: SoftInstalled, count: number\)/)
assert.match(phpSource, /await this\.fastCgiWorkerStore\(\)\.get\(version\.path\)/)
assert.match(phpSource, /String\(workerCount\)/)
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn test:php-fastcgi-workers`

Expected: source assertion failure because the PHP module still uses literal `'4'`.

- [ ] **Step 3: Implement fork IPC methods and launch-time lookup**

In `src/fork/module/Php.win/index.ts`, retain a module-private `FastCgiWorkerStore` instance whose file path is `join(global.Server.PhpDir!, 'fastcgi-workers.json')`. Implement these `ForkPromise` methods:

```ts
getFastCgiWorkerCount(version: SoftInstalled): ForkPromise<number>
setFastCgiWorkerCount(version: SoftInstalled, count: number): ForkPromise<number>
```

Immediately before creating `execArgs` in `_startServer`, read the stored value and replace the literal third argument with `String(workerCount)`. Do not alter MCP, startup-group, auto-start, or generic lifecycle code: all already call the same fork `startService` method.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `yarn test:php-fastcgi-workers`

Expected: `php-fastcgi-workers-test: ok`.

### Task 3: Add the Windows PHP-FPM Service-Page Control

**Files:**
- Modify: `scripts/php-fastcgi-workers-test.ts`
- Create: `src/render/components/PHPFPM/FastCgiWorkersAction.vue`
- Create: `src/render/components/PHPFPM/FastCgiWorkers.vue`
- Modify: `src/render/components/PHP/List.vue`
- Modify: `src/render/components/PHPFPM/Index.vue`
- Modify: `src/lang/en/php.json`
- Modify: `src/lang/zh/php.json`

- [ ] **Step 1: Extend the test with renderer integration assertions**

Append assertions that the PHP-FPM page injects the action into its shared PHP version list, the action is Windows-gated, displays the effective count, and opens `FastCgiWorkers.vue`; assert that the dialog uses `getFastCgiWorkerCount`, `setFastCgiWorkerCount`, integer bounds `1` through `64`, and `props.version.restart()`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn test:php-fastcgi-workers`

Expected: source assertion failure because the PHP-FPM action and dialog do not exist.

- [ ] **Step 3: Implement the PHP-FPM menu state and action**

In `PHPFPM/Index.vue`, inject `FastCgiWorkersAction.vue` into an `action` slot exposed by the shared `PHP/List.vue`. The action is Windows-only, labels itself through `php.fastcgiWorkers`, and shows a reactive effective count initialized to `4`. Fetch it through `app-fork:php/getFastCgiWorkerCount` on mount, use `FastCgiWorkers.vue` via `AsyncComponentShow`, and refresh the displayed value from the saved result. Keep this state component-local.

- [ ] **Step 4: Implement the compact worker-count dialog**

In `PHPFPM/FastCgiWorkers.vue`, create an Element Plus dialog with an integer `el-input-number` constrained to 1-64. Save through `app-fork:php/setFastCgiWorkerCount`; display fork failures using `MessageError`. On success, when this exact version is running, offer a localized restart confirmation and call the existing `props.version.restart()` only when confirmed. Resolve the async component only after save and optional restart have completed.

- [ ] **Step 5: Add localized labels**

Add `fastcgiWorkers`, `fastcgiWorkerCount`, `fastcgiWorkerInvalid`, and `fastcgiWorkerRestart` under the `php` namespace in `src/lang/en/php.json` and `src/lang/zh/php.json`. English is the fallback for other locales under the existing language runtime.

- [ ] **Step 6: Run the focused test to verify it passes**

Run: `yarn test:php-fastcgi-workers`

Expected: `php-fastcgi-workers-test: ok`.

### Task 4: Verify the Changed Surface

**Files:**
- Verify: `scripts/php-fastcgi-workers-test.ts`
- Verify: `src/fork/module/Php.win/FastCgiWorkers.ts`
- Verify: `src/fork/module/Php.win/index.ts`
- Verify: `src/render/components/PHPFPM/FastCgiWorkersAction.vue`
- Verify: `src/render/components/PHPFPM/FastCgiWorkers.vue`
- Verify: `src/render/components/PHP/List.vue`
- Verify: `src/render/components/PHPFPM/Index.vue`

- [ ] **Step 1: Run focused feature verification**

Run: `yarn test:php-fastcgi-workers`

Expected: a passing helper test, persistence edge cases, fork start-path assertions, and renderer control assertions.

- [ ] **Step 2: Type-check and lint the project**

Run: `yarn vue-tsc --noEmit && yarn eslint src/fork/module/Php.win/FastCgiWorkers.ts src/fork/module/Php.win/index.ts src/render/components/PHP/List.vue src/render/components/PHPFPM/Index.vue src/render/components/PHPFPM/FastCgiWorkersAction.vue src/render/components/PHPFPM/FastCgiWorkers.vue scripts/php-fastcgi-workers-test.ts`

Expected: zero type and lint errors.

- [ ] **Step 3: Review the diff**

Run: `git diff --check && git diff -- src/fork/module/Php.win/FastCgiWorkers.ts src/fork/module/Php.win/index.ts src/render/components/PHP/List.vue src/render/components/PHPFPM/Index.vue src/render/components/PHPFPM/FastCgiWorkersAction.vue src/render/components/PHPFPM/FastCgiWorkers.vue scripts/php-fastcgi-workers-test.ts package.json`

Expected: no whitespace errors, no changes to user-staged `docs/img.png`, and no renderer persistence or lifecycle-route modifications.
