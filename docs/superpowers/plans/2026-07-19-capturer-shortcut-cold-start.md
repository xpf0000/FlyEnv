# Capturer Shortcut Cold-Start Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a persisted screenshot shortcut work on the first keypress after FlyEnv starts while keeping the screenshot runtime unloaded when no shortcut is configured.

**Architecture:** Add a small, testable configuration synchronization policy beside the existing lazy runtime singletons. The IPC handler caches every screenshot configuration, asks that policy to load the runtime only for a non-empty shortcut, waits for configuration application before replying, and preserves the existing dynamic-import boundary.

**Tech Stack:** TypeScript 5.8, Electron 39 `globalShortcut`, existing `LazyRuntime`, Node `assert`, TSX, esbuild bundle audits, Yarn

---

## File Structure

- `src/main/core/lazy/OptionalRuntimes.ts` — retain the optional-runtime singletons and add the generic policy that synchronizes screenshot configuration without loading for an empty shortcut.
- `src/main/core/IPCHandler.ts` — route `Capturer:Config-Update` through the synchronization policy and return success or the existing runtime error response after the asynchronous result.
- `scripts/capturer-shortcut-startup-test.ts` — focused behavior test for configured, empty, already-loaded, and retry-after-failure cases.
- `scripts/main-process-lazy-bundle-test.ts` — regression audit proving the IPC handler uses conditional synchronization while `Capturer.ts` remains outside the eager graph.
- `package.json` — expose the focused regression test and include it in the main-process lazy test group.

## Task 1: Add the Lazy Capturer Configuration Policy

**Files:**

- Create: `scripts/capturer-shortcut-startup-test.ts`
- Modify: `src/main/core/lazy/OptionalRuntimes.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the focused behavior test**

Create `scripts/capturer-shortcut-startup-test.ts` with the complete test below:

```ts
import assert from 'node:assert/strict'
import { LazyRuntime } from '../src/main/core/lazy/LazyRuntime'
import { syncCapturerConfig } from '../src/main/core/lazy/OptionalRuntimes'

type TestConfig = {
  key: string[]
  name: string
}

type TestCapturer = {
  configUpdate(config: TestConfig): void
}

const configuredShortcutLoadsRuntime = async () => {
  let loads = 0
  const updates: TestConfig[] = []
  const runtime = new LazyRuntime<TestCapturer>(async () => {
    loads += 1
    return {
      configUpdate(config) {
        updates.push(config)
      }
    }
  })
  const config = { key: ['Control', 'Shift', 'A'], name: 'capture' }

  await syncCapturerConfig(runtime, config)

  assert.equal(loads, 1, 'a configured shortcut must load the capturer runtime')
  assert.deepEqual(updates, [config], 'the loaded runtime must receive the saved config')
}

const emptyShortcutStaysLazy = async () => {
  let loads = 0
  const runtime = new LazyRuntime<TestCapturer>(async () => {
    loads += 1
    return { configUpdate() {} }
  })

  await syncCapturerConfig(runtime, { key: [], name: 'capture' })

  assert.equal(loads, 0, 'an empty shortcut must not load the capturer runtime')
  assert.equal(runtime.peek(), undefined)
}

const loadedRuntimeReceivesEmptyShortcut = async () => {
  let loads = 0
  const updates: TestConfig[] = []
  const runtime = new LazyRuntime<TestCapturer>(async () => {
    loads += 1
    return {
      configUpdate(config) {
        updates.push(config)
      }
    }
  })
  await runtime.load()
  const config = { key: [], name: 'capture' }

  await syncCapturerConfig(runtime, config)

  assert.equal(loads, 1, 'an already loaded runtime must be reused')
  assert.deepEqual(updates, [config], 'an empty update must reach the loaded runtime')
}

const failedLoadCanRetry = async () => {
  let attempts = 0
  const updates: TestConfig[] = []
  const runtime = new LazyRuntime<TestCapturer>(async () => {
    attempts += 1
    if (attempts === 1) throw new Error('capturer load failed')
    return {
      configUpdate(config) {
        updates.push(config)
      }
    }
  })
  const config = { key: ['Control', 'Shift', 'A'], name: 'capture' }

  await assert.rejects(syncCapturerConfig(runtime, config), /capturer load failed/)
  await syncCapturerConfig(runtime, config)

  assert.equal(attempts, 2, 'a rejected lazy load must be retried')
  assert.deepEqual(updates, [config])
}

await configuredShortcutLoadsRuntime()
await emptyShortcutStaysLazy()
await loadedRuntimeReceivesEmptyShortcut()
await failedLoadCanRetry()

console.log('capturer shortcut startup tests passed')
```

- [ ] **Step 2: Add the focused test command**

Add the focused script after `test:main-lazy-runtime` and include it in `test:main-lazy` in `package.json`:

```json
"test:main-lazy-runtime": "tsx scripts/main-process-lazy-runtime-test.ts",
"test:capturer-shortcut": "tsx scripts/capturer-shortcut-startup-test.ts",
"test:main-lazy-bundle": "tsx scripts/main-process-lazy-bundle-test.ts",
```

Replace the aggregate command with:

```json
"test:main-lazy": "yarn test:main-lazy-runtime && yarn test:capturer-shortcut && yarn test:main-lazy-utilities && yarn test:main-resource-path && yarn test:github-account && yarn test:mcp-lazy-runtime && yarn test:main-lazy-bundle",
```

- [ ] **Step 3: Run the focused test and verify RED**

Run:

```bash
yarn test:capturer-shortcut
```

Expected: FAIL because `OptionalRuntimes.ts` does not export `syncCapturerConfig`. This confirms the test is exercising the new policy API rather than existing behavior.

- [ ] **Step 4: Implement the minimum synchronization policy**

Add these declarations after the `LazyRuntime` import and before the runtime singleton exports in `src/main/core/lazy/OptionalRuntimes.ts`:

```ts
type CapturerConfigLike = {
  key: string[]
}

type ConfigurableCapturer<TConfig extends CapturerConfigLike> = {
  configUpdate(config: TConfig): void
}

export const syncCapturerConfig = async <TConfig extends CapturerConfigLike>(
  runtime: Pick<LazyRuntime<ConfigurableCapturer<TConfig>>, 'load' | 'peek'>,
  config: TConfig
): Promise<void> => {
  const capturer = runtime.peek()
  if (capturer) {
    capturer.configUpdate(config)
    return
  }
  if (config.key.length === 0) return

  const loadedCapturer = await runtime.load()
  loadedCapturer.configUpdate(config)
}
```

Do not change any singleton factory in this file.

- [ ] **Step 5: Run the focused test and verify GREEN**

Run:

```bash
yarn test:capturer-shortcut
```

Expected: PASS with `capturer shortcut startup tests passed`.

- [ ] **Step 6: Commit the policy and its behavior test**

```bash
git add package.json scripts/capturer-shortcut-startup-test.ts src/main/core/lazy/OptionalRuntimes.ts
git commit -m "feat: add capturer config sync policy"
```

## Task 2: Apply the Policy at the Screenshot Configuration IPC Boundary

**Files:**

- Modify: `scripts/main-process-lazy-bundle-test.ts`
- Modify: `src/main/core/IPCHandler.ts`

- [ ] **Step 1: Replace the obsolete bundle-audit assertion**

In `scripts/main-process-lazy-bundle-test.ts`, replace the assertion that requires `capturerRuntime.peek()?.configUpdate` with:

```ts
assert.match(
  ipcHandlerSource,
  /handleCapturerConfigUpdate[\s\S]*?syncCapturerConfig\(capturerRuntime, this\.capturerConfig\)[\s\S]*?sendRuntimeError\(command, key, error\)/,
  'capture config updates must conditionally load and configure the capturer runtime'
)
```

Keep the existing metafile assertions that require `src/main/core/Capturer.ts` and `@xpf0000/node-window-manager` to remain absent from the eager graph.

- [ ] **Step 2: Run the bundle audit and verify RED**

Run:

```bash
yarn test:main-lazy-bundle
```

Expected: FAIL with `capture config updates must conditionally load and configure the capturer runtime` because the IPC handler still uses only `peek()`.

- [ ] **Step 3: Import the synchronization policy**

In the existing import from `./lazy/OptionalRuntimes`, add `syncCapturerConfig` while retaining every existing runtime import:

```ts
import {
  capturerRuntime,
  httpServerRuntime,
  mcpAuditRuntime,
  nodePtyRuntime,
  oauthRuntime,
  siteSuckerRuntime,
  syncCapturerConfig
} from './lazy/OptionalRuntimes'
```

- [ ] **Step 4: Make configuration application asynchronous and conditional**

Replace `handleCapturerConfigUpdate` in `src/main/core/IPCHandler.ts` with:

```ts
private handleCapturerConfigUpdate(command: string, key: string, args: any[]) {
  this.capturerConfig = args[0]
  syncCapturerConfig(capturerRuntime, this.capturerConfig)
    .then(() => this.sendToMainWindow(command, key, true))
    .catch((error) => this.sendRuntimeError(command, key, error))
}
```

This keeps the latest configuration available to `loadCapturer()`, loads only when the shortcut is non-empty, applies empty updates to an already loaded runtime, and delays IPC success until required loading and registration finish.

- [ ] **Step 5: Run focused and bundle tests and verify GREEN**

Run:

```bash
yarn test:capturer-shortcut
yarn test:main-lazy-bundle
```

Expected: both commands PASS. The bundle audit must print `main process lazy bundle tests passed`.

- [ ] **Step 6: Commit the IPC fix**

```bash
git add scripts/main-process-lazy-bundle-test.ts src/main/core/IPCHandler.ts
git commit -m "fix: initialize capturer shortcut on startup"
```

## Task 3: Verify the Regression and Lazy-Loading Boundary

**Files:**

- Verify: `package.json`
- Verify: `scripts/capturer-shortcut-startup-test.ts`
- Verify: `scripts/main-process-lazy-bundle-test.ts`
- Verify: `src/main/core/IPCHandler.ts`
- Verify: `src/main/core/lazy/OptionalRuntimes.ts`

- [ ] **Step 1: Run the complete main-process lazy test group**

```bash
yarn test:main-lazy
```

Expected: PASS for lazy runtime, capturer shortcut, eager utilities, resource paths, GitHub account service, MCP lazy runtime, and the bundle audit.

- [ ] **Step 2: Lint every changed TypeScript file**

```bash
npx eslint src/main/core/IPCHandler.ts src/main/core/lazy/OptionalRuntimes.ts scripts/capturer-shortcut-startup-test.ts scripts/main-process-lazy-bundle-test.ts
```

Expected: exit code 0 with no lint or Prettier errors.

- [ ] **Step 3: Check patch integrity and repository state**

```bash
git diff --check
git status --short
```

Expected: `git diff --check` exits 0 and `git status --short` produces no output.

- [ ] **Step 4: Perform the supported-platform cold-start smoke check**

Run FlyEnv in the normal development or packaged environment, then:

1. Save a screenshot shortcut such as `Control+Shift+A`.
2. Quit FlyEnv completely and relaunch it.
3. Before opening the Screenshot tool, press the saved shortcut.
4. Confirm the capture overlay opens on the first press.
5. Exit capture, clear the shortcut in the Screenshot tool, and confirm the old shortcut no longer opens capture.
6. Relaunch with the empty shortcut and confirm normal startup remains functional.

Expected: the first shortcut press works after the configured restart; clearing the shortcut unregisters it; a restart without a shortcut does not introduce any visible screenshot initialization or startup error.

- [ ] **Step 5: Commit verification-only formatting changes if any were required**

If lint required a formatting-only correction, commit only those corrected files:

```bash
git add src/main/core/IPCHandler.ts src/main/core/lazy/OptionalRuntimes.ts scripts/capturer-shortcut-startup-test.ts scripts/main-process-lazy-bundle-test.ts
git commit -m "style: format capturer shortcut fix"
```

If no files changed during verification, do not create an empty commit.
