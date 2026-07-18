# Main-Process Lazy Loading and Idle Memory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce FlyEnv's stable idle Electron main-process RSS by keeping optional feature implementations and their heavy dependencies outside the eager startup graph while preserving all existing commands and behavior.

**Architecture:** Enable esbuild ESM code splitting for the main process, introduce a retryable typed lazy-runtime primitive, and route optional IPC handlers through cached dynamic imports. Move non-interactive GitHub account/license requests to the existing fork, keep interactive OAuth lazy in main, and conditionally load MCP only for auto-start or first use.

**Tech Stack:** TypeScript 5.8, Electron 39, esbuild 0.25, Electron utility processes, Vue 3/Pinia renderer IPC, Node `assert`, TSX, Yarn

---

## File Structure

### New production files

- `src/main/core/lazy/LazyRuntime.ts` — generic cached loader with retry-on-failure and non-loading `peek()`.
- `src/main/core/lazy/OptionalRuntimes.ts` — typed singleton loaders for OAuth, PTY, capture, SiteSucker, HTTP server, and MCP audit.
- `src/main/core/MCPRuntime.ts` — conditional MCP server owner; status/stop do not load the SDK.
- `src/shared/debounce.ts` — small debounce used by the eager main shell instead of `lodash-es`.
- `src/shared/process-options.ts` — process-option merge preserving nested environment values.
- `src/fork/module/App/GitHubAccount.ts` — testable non-interactive GitHub account/license HTTP service.

### New focused tests

- `scripts/main-process-lazy-runtime-test.ts`
- `scripts/main-process-lazy-bundle-test.ts`
- `scripts/main-process-eager-utilities-test.ts`
- `scripts/github-account-service-test.ts`
- `scripts/mcp-lazy-runtime-test.ts`

### Existing integration files

- `package.json`
- `configs/esbuild.config.ts`
- `configs/esbuild.config.win.ts`
- `src/main/Application.ts`
- `src/main/core/AppHelper.ts`
- `src/main/core/AppNodeFn.ts`
- `src/main/core/HttpServer.ts`
- `src/main/core/IPCHandler.ts`
- `src/main/ui/WindowManager.ts`
- `src/main/utils/NginxConf.ts`
- `src/shared/child-process.ts`
- `src/fork/Helper.ts`
- `src/fork/module/App/index.ts`
- `src/render/components/Setup/store.ts`
- `src/render/util/GlobalIPCOn.ts`

## Implementation Rules

- Preserve existing renderer IPC command names and response shapes.
- A stop/cancel/shutdown path must use `peek()` and must not import an unused runtime.
- A rejected dynamic import must clear its cache so the next command can retry.
- `Capturer:Config-Update` remains startup-safe: retain the latest configuration without importing `Capturer`.
- MCP configuration remains eager because base `ConfigManager` already loads `electron-store`; the MCP SDK/server remains lazy.
- Keep the fork bundle strategy unchanged in this plan.
- Expand the bundle audit as each boundary is implemented; never disable an assertion to make it pass.
- Commit after every green task and preserve unrelated user changes.

### Task 1: Add the Retryable Lazy-Runtime Primitive

**Files:**

- Create: `src/main/core/lazy/LazyRuntime.ts`
- Create: `scripts/main-process-lazy-runtime-test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the failing loader test**

Create `scripts/main-process-lazy-runtime-test.ts`:

```ts
import assert from 'node:assert/strict'
import { LazyRuntime } from '../src/main/core/lazy/LazyRuntime'

let calls = 0
let release: ((value: { id: number }) => void) | undefined
const pending = new LazyRuntime(
  () =>
    new Promise<{ id: number }>((resolve) => {
      calls += 1
      release = resolve
    })
)

const first = pending.load()
const second = pending.load()
assert.equal(first, second, 'concurrent calls must share one promise')
assert.equal(calls, 1)
assert.equal(pending.peek(), undefined, 'peek must not expose an unresolved value')
release?.({ id: 7 })
assert.deepEqual(await first, { id: 7 })
assert.deepEqual(pending.peek(), { id: 7 })
assert.deepEqual(await pending.load(), { id: 7 })
assert.equal(calls, 1, 'resolved runtime must remain cached')

let attempts = 0
const retrying = new LazyRuntime(async () => {
  attempts += 1
  if (attempts === 1) throw new Error('first load failed')
  return { ready: true }
})

await assert.rejects(retrying.load(), /first load failed/)
assert.equal(retrying.peek(), undefined)
assert.deepEqual(await retrying.load(), { ready: true })
assert.equal(attempts, 2, 'a rejected import must be retryable')

let unloadedCalls = 0
const unloaded = new LazyRuntime(async () => {
  unloadedCalls += 1
  return true
})
assert.equal(unloaded.peek(), undefined)
assert.equal(unloadedCalls, 0, 'peek must never invoke the loader')

console.log('main process lazy runtime tests passed')
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
npx tsx scripts/main-process-lazy-runtime-test.ts
```

Expected: FAIL with `Cannot find module '../src/main/core/lazy/LazyRuntime'`.

- [ ] **Step 3: Implement the minimal loader**

Create `src/main/core/lazy/LazyRuntime.ts`:

```ts
export class LazyRuntime<T> {
  private promise?: Promise<T>
  private value?: T

  constructor(private readonly factory: () => Promise<T>) {}

  load(): Promise<T> {
    if (!this.promise) {
      this.promise = this.factory().then(
        (value) => {
          this.value = value
          return value
        },
        (error) => {
          this.promise = undefined
          throw error
        }
      )
    }
    return this.promise
  }

  peek(): T | undefined {
    return this.value
  }
}
```

- [ ] **Step 4: Add the focused package script**

Add to `package.json`:

```json
"test:main-lazy-runtime": "tsx scripts/main-process-lazy-runtime-test.ts"
```

- [ ] **Step 5: Run the test and verify GREEN**

Run:

```bash
yarn test:main-lazy-runtime
npx prettier --check src/main/core/lazy/LazyRuntime.ts scripts/main-process-lazy-runtime-test.ts package.json
```

Expected: both commands exit 0 and the test prints `main process lazy runtime tests passed`.

- [ ] **Step 6: Commit**

```bash
git add src/main/core/lazy/LazyRuntime.ts scripts/main-process-lazy-runtime-test.ts package.json
git commit -m "test: add main process lazy runtime contract"
```

### Task 2: Enable Main-Process ESM Code Splitting

**Files:**

- Create: `scripts/main-process-lazy-bundle-test.ts`
- Modify: `configs/esbuild.config.ts`
- Modify: `configs/esbuild.config.win.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the failing split-build test**

Create `scripts/main-process-lazy-bundle-test.ts`:

```ts
import assert from 'node:assert/strict'
import { build, type BuildOptions, type Metafile } from 'esbuild'
import { readFileSync } from 'node:fs'

export const buildMainFixture = async () => {
  return build({
    entryPoints: { main: 'src/main/index.ts' },
    outdir: 'dist/main-lazy-audit',
    entryNames: '[name]',
    chunkNames: 'chunks/[name]-[hash]',
    outExtension: { '.js': '.mjs' },
    bundle: true,
    splitting: true,
    write: false,
    metafile: true,
    platform: 'node',
    format: 'esm',
    target: 'esnext',
    packages: 'external',
    logLevel: 'silent'
  })
}

export const eagerOutputs = (metafile: Metafile) => {
  const outputs = metafile.outputs
  const entry = Object.entries(outputs).find(([, output]) => output.entryPoint === 'src/main/index.ts')
  assert.ok(entry, 'main entry output must exist')
  assert.match(entry[0], /main\.mjs$/)

  const visited = new Set<string>()
  const visit = (path: string) => {
    if (visited.has(path)) return
    visited.add(path)
    for (const item of outputs[path]?.imports ?? []) {
      if (!item.external && item.kind !== 'dynamic-import') visit(item.path)
    }
  }
  visit(entry[0])
  return visited
}

const result = await buildMainFixture()
const configSource = readFileSync('configs/esbuild.config.ts', 'utf8')
const windowsConfigSource = readFileSync('configs/esbuild.config.win.ts', 'utf8')
const packageMain = JSON.parse(readFileSync('package.json', 'utf8')).main

assert.equal(packageMain, './dist/electron/main.mjs')
for (const source of [configSource, windowsConfigSource]) {
  assert.match(source, /splitting:\s*true/)
  assert.match(source, /outdir:\s*['"]dist\/electron['"]/)
  assert.match(source, /outExtension:\s*\{\s*['"]\.js['"]:\s*['"]\.mjs['"]\s*\}/)
  assert.doesNotMatch(source, /outfile:\s*['"]dist\/electron\/main\.mjs['"]/)
}

const eager = eagerOutputs(result.metafile!)
assert.ok(eager.size >= 1)
assert.ok(
  Object.values(result.metafile!.outputs).some((output) =>
    output.imports.some((item) => item.kind === 'dynamic-import')
  ),
  'fixture must retain at least one dynamic chunk'
)

for (const builder of [
  'configs/electron-builder.ts',
  'configs/electron-builder.win.ts',
  'configs/electron-builder.linux.ts'
]) {
  assert.match(readFileSync(builder, 'utf8'), /dist\/electron\/\*\*\/\*/)
}

console.log('main process lazy bundle tests passed')
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
npx tsx scripts/main-process-lazy-bundle-test.ts
```

Expected: FAIL because the checked configs still use `outfile` and do not set `splitting: true`.

- [ ] **Step 3: Convert both main build targets to split output**

In both `configs/esbuild.config.ts` and `configs/esbuild.config.win.ts`, use this shape for `dev` and `dist`, retaining each file's current plugins, loaders, minification, and `drop` settings:

```ts
const mainOutput: Pick<BuildOptions, 'outdir' | 'entryNames' | 'chunkNames' | 'outExtension' | 'splitting'> = {
  outdir: 'dist/electron',
  entryNames: '[name]',
  chunkNames: 'chunks/[name]-[hash]',
  outExtension: { '.js': '.mjs' },
  splitting: true
}

const dev: BuildOptions = {
  ...mainOutput,
  platform: 'node',
  entryPoints: { main: 'src/main/index.dev.ts' },
  minify: false,
  bundle: true,
  packages: 'external',
  format: 'esm',
  target: 'esnext',
  plugins: [BuildPlugin()]
}
```

The production entry uses `{ main: 'src/main/index.ts' }`. Do not change `devFork` or `distFork`.

- [ ] **Step 4: Add and run the focused script**

Add to `package.json`:

```json
"test:main-lazy-bundle": "tsx scripts/main-process-lazy-bundle-test.ts"
```

Run:

```bash
yarn test:main-lazy-bundle
npx esbuild --platform=node --bundle --packages=external --inject:scripts/shim-dynamic-require.mjs --format=esm scripts/dev-runner.ts --outfile=/tmp/flyenv-dev-runner-check.mjs
```

Expected: the test prints `main process lazy bundle tests passed`; the development runner configuration compiles successfully.

- [ ] **Step 5: Commit**

```bash
git add configs/esbuild.config.ts configs/esbuild.config.win.ts scripts/main-process-lazy-bundle-test.ts package.json
git commit -m "build: split optional main process chunks"
```

### Task 3: Remove Avoidable Eager Utility and Platform Dependencies

**Files:**

- Create: `src/shared/debounce.ts`
- Create: `src/shared/process-options.ts`
- Create: `scripts/main-process-eager-utilities-test.ts`
- Modify: `src/main/Application.ts`
- Modify: `src/main/ui/WindowManager.ts`
- Modify: `src/main/core/AppNodeFn.ts`
- Modify: `src/shared/child-process.ts`
- Modify: `src/main/core/AppHelper.ts`
- Modify: `src/fork/Helper.ts`
- Modify: `src/main/utils/NginxConf.ts`
- Modify: `scripts/main-process-lazy-bundle-test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write utility behavior and eager-graph assertions**

Create `scripts/main-process-eager-utilities-test.ts`:

```ts
import assert from 'node:assert/strict'
import { debounce } from '../src/shared/debounce'
import { mergeProcessOptions } from '../src/shared/process-options'

const merged = mergeProcessOptions(
  { shell: '/bin/zsh', env: { PATH: '/usr/bin', HOME: '/tmp/home' } },
  { cwd: '/tmp/work', env: { PATH: '/custom/bin' } }
)
assert.deepEqual(merged, {
  shell: '/bin/zsh',
  cwd: '/tmp/work',
  env: { PATH: '/custom/bin', HOME: '/tmp/home' }
})

let calls = 0
let value = 0
const update = debounce((next: number) => {
  calls += 1
  value = next
}, 10)
update(1)
update(2)
await new Promise((resolve) => setTimeout(resolve, 25))
assert.equal(calls, 1)
assert.equal(value, 2)

console.log('main process eager utility tests passed')
```

Append these assertions to `scripts/main-process-lazy-bundle-test.ts` after calculating `eager`:

```ts
const eagerInputs = new Set(
  [...eager].flatMap((output) => Object.keys(result.metafile!.outputs[output]?.inputs ?? {}))
)
const eagerExternalImports = [...eager].flatMap((output) =>
  (result.metafile!.outputs[output]?.imports ?? [])
    .filter((item) => item.external && item.kind !== 'dynamic-import')
    .map((item) => item.path)
)

assert.equal(eagerExternalImports.includes('lodash-es'), false)
assert.equal(eagerExternalImports.includes('compressing'), false)
assert.equal(eagerInputs.has('src/shared/Sudo.ts'), false)
assert.equal(eagerInputs.has('src/shared/WindowsHelperFallback.ts'), false)
```

- [ ] **Step 2: Run both tests and verify RED**

Run:

```bash
npx tsx scripts/main-process-eager-utilities-test.ts
yarn test:main-lazy-bundle
```

Expected: the first command fails because the two utilities do not exist; the bundle test fails on eager `lodash-es`, `compressing`, `Sudo.ts`, or `WindowsHelperFallback.ts`.

- [ ] **Step 3: Implement focused debounce and option merging**

Create `src/shared/debounce.ts`:

```ts
export function debounce<T extends (...args: any[]) => void>(fn: T, wait: number) {
  let timer: NodeJS.Timeout | undefined
  return function (this: ThisParameterType<T>, ...args: Parameters<T>) {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => fn.apply(this, args), wait)
  }
}
```

Create `src/shared/process-options.ts`:

```ts
export function mergeProcessOptions<T extends { env?: NodeJS.ProcessEnv }>(
  defaults: T,
  overrides?: Partial<T>
): T {
  const result = { ...defaults, ...(overrides ?? {}) } as T
  if (defaults.env || overrides?.env) {
    result.env = { ...(defaults.env ?? {}), ...(overrides?.env ?? {}) }
  }
  return result
}
```

Replace the `lodash-es` debounce imports in `Application.ts` and `WindowManager.ts` with `@shared/debounce`. Replace each `merge(defaults, overrides)` in `src/shared/child-process.ts` and `AppNodeFn.exec_exec()` with `mergeProcessOptions(defaults, overrides)`, imported from `@shared/process-options`.

- [ ] **Step 4: Lazy-load privilege fallbacks and archive extraction**

In `src/main/core/AppHelper.ts`, replace the value import of `@shared/Sudo` with a type-only function signature and this default dependency:

```ts
type SudoExec = typeof import('@shared/Sudo').exec

const lazySudo: SudoExec = async (...args) => {
  const { exec } = await import('@shared/Sudo')
  return exec(...args)
}

type AppHelperDeps = {
  appHelperCheck: typeof AppHelperCheck
  sudo: SudoExec
}

const defaultAppHelperDeps: AppHelperDeps = {
  appHelperCheck: AppHelperCheck,
  sudo: lazySudo
}
```

In `src/fork/Helper.ts`, remove the value import of `runWindowsHelperFallback` and define the default dependency as:

```ts
type WindowsHelperFallback = typeof import('@shared/WindowsHelperFallback').runWindowsHelperFallback

const lazyWindowsHelperFallback: WindowsHelperFallback = async (...args) => {
  const { runWindowsHelperFallback } = await import('@shared/WindowsHelperFallback')
  return runWindowsHelperFallback(...args)
}
```

Keep injected test dependencies working by typing `HelperDeps.runWindowsHelperFallback` as `WindowsHelperFallback`.

In `src/main/utils/NginxConf.ts`, remove the static `compressing` import and make extraction load it only inside the missing-config branch:

```ts
const extractNginxConfig = async () => {
  const { default: compressing } = await import('compressing')
  await compressing.zip.uncompress(
    join(__static, 'zip/nginx-common.zip'),
    global.Server.NginxDir!
  )
  await configureNginxFile()
}
```

Call it as `void extractNginxConfig().catch(() => {})` when `nginx.conf` is absent.

- [ ] **Step 5: Register and run focused tests**

Add to `package.json`:

```json
"test:main-lazy-utilities": "tsx scripts/main-process-eager-utilities-test.ts"
```

Run:

```bash
yarn test:main-lazy-utilities
yarn test:main-lazy-bundle
yarn test:helper
npx prettier --check src/shared/debounce.ts src/shared/process-options.ts src/main/Application.ts src/main/ui/WindowManager.ts src/main/core/AppNodeFn.ts src/shared/child-process.ts src/main/core/AppHelper.ts src/fork/Helper.ts src/main/utils/NginxConf.ts scripts/main-process-eager-utilities-test.ts scripts/main-process-lazy-bundle-test.ts
```

Expected: all commands exit 0. Existing helper fallback and transport tests must remain green.

- [ ] **Step 6: Commit**

```bash
git add src/shared/debounce.ts src/shared/process-options.ts src/main/Application.ts src/main/ui/WindowManager.ts src/main/core/AppNodeFn.ts src/shared/child-process.ts src/main/core/AppHelper.ts src/fork/Helper.ts src/main/utils/NginxConf.ts scripts/main-process-eager-utilities-test.ts scripts/main-process-lazy-bundle-test.ts package.json
git commit -m "perf: defer main process utility dependencies"
```

### Task 4: Lazy-Load AppNodeFn Optional Parsers and Markdown

**Files:**

- Modify: `src/main/core/AppNodeFn.ts`
- Modify: `scripts/main-process-lazy-bundle-test.ts`

- [ ] **Step 1: Add failing AppNodeFn bundle assertions**

Append to `scripts/main-process-lazy-bundle-test.ts`:

```ts
for (const dependency of [
  'node-forge',
  'mime-types',
  'markdown-it-async',
  'shiki',
  '@mdit-vue/plugin-frontmatter'
]) {
  assert.equal(
    eagerExternalImports.some((item) => item === dependency || item.startsWith(`${dependency}/`)),
    false,
    `${dependency} must not be eager`
  )
}
assert.equal(eagerInputs.has('src/render/util/markdown/markdown.ts'), false)
```

- [ ] **Step 2: Run the audit and verify RED**

Run:

```bash
yarn test:main-lazy-bundle
```

Expected: FAIL because `AppNodeFn.ts` statically reaches Markdown, `node-forge`, and `mime-types`.

- [ ] **Step 3: Replace optional value imports with cached loaders**

In `src/main/core/AppNodeFn.ts`, remove `createRequire`, the Markdown value import, TOML value imports, and the top-level `node-forge`/`mime-types` requires. Add:

```ts
import { LazyRuntime } from './lazy/LazyRuntime'

const markdownRuntime = new LazyRuntime(async () => {
  const { createMarkdownRenderer } = await import('@/util/markdown/markdown')
  return createMarkdownRenderer
})
const forgeRuntime = new LazyRuntime(async () => {
  const module = await import('node-forge')
  return ((module as any).default ?? module) as any
})
const mimeRuntime = new LazyRuntime(async () => {
  const module = await import('mime-types')
  return ((module as any).default ?? module) as any
})
const tomlRuntime = new LazyRuntime(() => import('@shared/toml'))
```

Use the cached loaders in the affected methods. The complete Markdown method becomes:

```ts
md_render(command: string, key: string, content: string) {
  markdownRuntime
    .load()
    .then((createMarkdownRenderer) => createMarkdownRenderer())
    .then((renderer) => renderer.render(content))
    .then((html) => this.mainWindow?.webContents.send('command', command, key, html))
    .catch(() => this.mainWindow?.webContents.send('command', command, key, ''))
}
```

`mime_types()` loads `mimeRuntime` and sends `{ types, extensions }`; each `node_forge_*` method loads `forgeRuntime` before using `pki`; `toml_parse()` and `toml_stringify()` load `tomlRuntime` and preserve the current `null` fallback. Every branch must send exactly one response.

- [ ] **Step 4: Run focused and source-wide checks**

Run:

```bash
yarn test:main-lazy-runtime
yarn test:main-lazy-bundle
npx vue-tsc --noEmit
npx eslint src/main/core/AppNodeFn.ts scripts/main-process-lazy-bundle-test.ts
```

Expected: all commands exit 0; the main entry has no eager Markdown, Forge, MIME, or TOML implementation.

- [ ] **Step 5: Commit**

```bash
git add src/main/core/AppNodeFn.ts scripts/main-process-lazy-bundle-test.ts
git commit -m "perf: lazy load main process parsers"
```

### Task 5: Route Optional Native and Tool Managers Through Lazy Runtimes

**Files:**

- Create: `src/main/core/lazy/OptionalRuntimes.ts`
- Modify: `src/main/Application.ts`
- Modify: `src/main/core/IPCHandler.ts`
- Modify: `src/main/core/HttpServer.ts`
- Modify: `scripts/main-process-lazy-bundle-test.ts`

- [ ] **Step 1: Add failing manager-boundary assertions**

Append to `scripts/main-process-lazy-bundle-test.ts`:

```ts
for (const input of [
  'src/main/core/NodePTY.ts',
  'src/main/core/Capturer.ts',
  'src/main/core/HttpServer.ts',
  'src/main/ui/SiteSucker/index.ts'
]) {
  assert.equal(eagerInputs.has(input), false, `${input} must not be eager`)
}
for (const dependency of [
  'node-pty',
  '@xpf0000/node-window-manager',
  'serve-handler',
  'hpagent'
]) {
  assert.equal(
    eagerExternalImports.some((item) => item === dependency || item.startsWith(`${dependency}/`)),
    false,
    `${dependency} must not be eager`
  )
}
```

- [ ] **Step 2: Run the audit and verify RED**

Run:

```bash
yarn test:main-lazy-bundle
```

Expected: FAIL on the current static imports in `Application.ts` and `IPCHandler.ts`.

- [ ] **Step 3: Create typed runtime singletons**

Create `src/main/core/lazy/OptionalRuntimes.ts`:

```ts
import { LazyRuntime } from './LazyRuntime'

export const oauthRuntime = new LazyRuntime(async () => (await import('../OAuth')).default)
export const nodePtyRuntime = new LazyRuntime(async () => (await import('../NodePTY')).default)
export const capturerRuntime = new LazyRuntime(async () => (await import('../Capturer')).default)
export const httpServerRuntime = new LazyRuntime(
  async () => (await import('../HttpServer')).default
)
export const siteSuckerRuntime = new LazyRuntime(
  async () => (await import('../../ui/SiteSucker')).default
)
export const mcpAuditRuntime = new LazyRuntime(
  async () => (await import('../MCPAudit')).default
)
```

- [ ] **Step 4: Make IPC handlers load only on real first use**

Remove the value imports for `NodePTY`, `HttpServer`, `Capturer`, OAuth, MCPAudit, and SiteSucker from `IPCHandler.ts`. Add the runtime imports and a pending capture config:

```ts
private capturerConfig?: any

private loadCapturer() {
  return capturerRuntime.load().then((capturer) => {
    if (this.capturerConfig) capturer.configUpdate(this.capturerConfig)
    return capturer
  })
}

private loadNodePty() {
  return nodePtyRuntime.load().then((nodePty) => {
    nodePty.onSendCommand((command: string, ...args: any[]) => {
      if (this.deps.mainWindow) {
        this.deps.windowManager.sendCommandTo(this.deps.mainWindow, command, ...args)
      }
    })
    return nodePty
  })
}

private loadSiteSucker() {
  return siteSuckerRuntime.load().then((siteSucker) => {
    siteSucker.setCallback((link: any) => this.handleSiteSuckerLink(link))
    return siteSucker
  })
}
```

Move the existing SiteSucker callback body from `Application.setupSiteSuckerCallback()` into `IPCHandler.handleSiteSuckerLink()`.

Use these loading rules:

- `app-http-serve-run` calls `httpServerRuntime.load()`; stop calls `peek()` and immediately returns `{ path }` if absent.
- `Capturer:doCapturer` and `Capturer:getWindowCapturer` call `loadCapturer()`; stop/check/save use `peek()`.
- `Capturer:Config-Update` stores `capturerConfig`, applies it to `peek()` if loaded, and responds without loading.
- `NodePty:init` and `NodePty:exec` call `loadNodePty()`; write/clear/resize/stop use `peek()`.
- `app-sitesucker-run` calls `loadSiteSucker()`; setup reads config without loading; setup-save persists config and calls `peek()?.updateConfig()`.
- Every failed load for a request/response command returns `{ code: 1, msg: String(error) }` through its existing command key.

- [ ] **Step 5: Make application setup and shutdown non-loading**

Remove the static manager imports, `siteSuckerManager` IPC dependency, `setupSiteSuckerCallback()`, and `setupNodePTYCallback()` from `Application.ts`. In `doStop()`, use:

```ts
siteSuckerRuntime.peek()?.destroy()
oauthRuntime.peek()?.cancel()
nodePtyRuntime.peek()?.exitAllPty()
capturerRuntime.peek()?.stopCapturer()
await httpServerRuntime.peek()?.stopAll()
```

Add this method to `HttpServer`:

```ts
async stopAll() {
  const paths = Object.keys(this.httpServes)
  await Promise.all(paths.map((path) => this.stop(path)))
}
```

- [ ] **Step 6: Run deterministic verification**

Run:

```bash
yarn test:main-lazy-runtime
yarn test:main-lazy-bundle
npx vue-tsc --noEmit
npx eslint src/main/Application.ts src/main/core/IPCHandler.ts src/main/core/HttpServer.ts src/main/core/lazy/OptionalRuntimes.ts
```

Expected: all commands exit 0; capture configuration is accepted without making `Capturer.ts` eager.

- [ ] **Step 7: Commit**

```bash
git add src/main/core/lazy/OptionalRuntimes.ts src/main/Application.ts src/main/core/IPCHandler.ts src/main/core/HttpServer.ts scripts/main-process-lazy-bundle-test.ts
git commit -m "perf: lazy load optional main process tools"
```

### Task 6: Move Non-Interactive GitHub Account Work to the Fork

**Files:**

- Create: `src/fork/module/App/GitHubAccount.ts`
- Create: `scripts/github-account-service-test.ts`
- Modify: `src/fork/module/App/index.ts`
- Modify: `src/main/core/OAuth.ts`
- Modify: `src/main/core/IPCHandler.ts`
- Modify: `src/main/Application.ts`
- Modify: `src/render/components/Setup/store.ts`
- Modify: `src/render/util/GlobalIPCOn.ts`
- Modify: `scripts/main-process-lazy-bundle-test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the failing account-service test**

Create `scripts/github-account-service-test.ts` with injected machine ID, request, and proxy functions. Cover these exact cases:

```ts
import assert from 'node:assert/strict'
import { GitHubAccountService } from '../src/fork/module/App/GitHubAccount'

const requests: any[] = []
let machineCalls = 0
const service = new GitHubAccountService({
  machineId: async () => {
    machineCalls += 1
    return 'machine-1'
  },
  request: async (config: any) => {
    requests.push(config)
    if (config.url.endsWith('/user_github_auth')) {
      return { data: { data: { user: { uuid: 'user-1' }, license: [] } } }
    }
    if (config.url.endsWith('/user_github_license')) {
      return { data: { data: [{ uuid: 'machine-1', license: 'code' }] } }
    }
    return { data: { data: [] } }
  },
  getProxy: () => false,
  failureMessage: () => 'failed'
})

assert.deepEqual(await service.fetchUser(''), {})
assert.equal(requests.length, 0)
assert.deepEqual(await service.fetchUser('user-1'), { user: { uuid: 'user-1' }, license: [] })
assert.deepEqual(await service.fetchLicenses('user-1'), [
  { uuid: 'machine-1', license: 'code' }
])
assert.equal(machineCalls, 1, 'machine ID must be cached')
assert.equal(requests[0].data.uuid, 'machine-1')
assert.equal(requests[0].proxy, false)

console.log('GitHub account service tests passed')
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
npx tsx scripts/github-account-service-test.ts
```

Expected: FAIL because `GitHubAccount.ts` does not exist.

- [ ] **Step 3: Implement the fork-side service and App actions**

Create `src/fork/module/App/GitHubAccount.ts` with the complete service:

```ts
import axios from 'axios'
import { machineId } from '../../Fn'
import { getAxiosProxy } from '../../util/Axios'
import { I18nT } from '@lang/runtime'

type RequestFn = (config: Record<string, any>) => Promise<{ data?: any }>

type GitHubAccountDeps = {
  machineId: () => Promise<string>
  request: RequestFn
  getProxy: () => any
  failureMessage: () => string
}

const defaults: GitHubAccountDeps = {
  machineId,
  request: (config) => axios(config),
  getProxy: getAxiosProxy,
  failureMessage: () => I18nT('base.fail')
}

export class GitHubAccountService {
  private uuidPromise?: Promise<string>
  private readonly deps: GitHubAccountDeps

  constructor(deps: Partial<GitHubAccountDeps> = {}) {
    this.deps = { ...defaults, ...deps }
  }

  private getMachineId() {
    if (!this.uuidPromise) {
      this.uuidPromise = this.deps.machineId().catch((error) => {
        this.uuidPromise = undefined
        throw error
      })
    }
    return this.uuidPromise
  }

  private async post(url: string, data: Record<string, any>) {
    return this.deps.request({
      url,
      method: 'post',
      data,
      proxy: this.deps.getProxy(),
      timeout: 30000
    })
  }

  async fetchUser(userUuid: string): Promise<Record<string, any>> {
    if (!userUuid) return {}
    const uuid = await this.getMachineId()
    const response = await this.post('https://api.one-env.com/api/app/user_github_auth', {
      user_uuid: userUuid,
      uuid
    })
    return response.data?.data?.user ? response.data.data : {}
  }

  async fetchLicenses(userUuid: string): Promise<any[]> {
    if (!userUuid) return []
    const uuid = await this.getMachineId()
    const response = await this.post('https://api.one-env.com/api/app/user_github_license', {
      user_uuid: userUuid,
      uuid
    })
    return Array.isArray(response.data?.data) ? response.data.data : []
  }

  private async updateBinding(
    endpoint: 'user_github_license_del' | 'user_github_license_add',
    userUuid: string,
    uuid: string,
    license: string
  ): Promise<any[]> {
    if (!userUuid) throw new Error(this.deps.failureMessage())
    const response = await this.post(`https://api.one-env.com/api/app/${endpoint}`, {
      user_uuid: userUuid,
      uuid,
      license
    })
    if (!Array.isArray(response.data?.data)) {
      throw new Error(response.data?.message || this.deps.failureMessage())
    }
    return response.data.data
  }

  deleteBinding(userUuid: string, uuid: string, license: string) {
    return this.updateBinding('user_github_license_del', userUuid, uuid, license)
  }

  addBinding(userUuid: string, uuid: string, license: string) {
    return this.updateBinding('user_github_license_add', userUuid, uuid, license)
  }
}
```

This preserves the existing endpoints, 30-second timeout, proxy behavior, and localized fallback. `fetchUser('')` and `fetchLicenses('')` return before computing a machine ID.

In `src/fork/module/App/index.ts`, construct one service and expose four `ForkPromise` actions:

```ts
githubUserFetch()
githubLicenseFetch()
githubLicenseDelete(uuid: string, license: string)
githubLicenseAdd(uuid: string, license: string)
```

Each action reads `global.Server.UserUUID`, resolves the plain user/list payload on success, and rejects on request failure so `BaseManager` preserves the existing `{ code, data, msg }` wrapper.

- [ ] **Step 4: Keep interactive OAuth lazy in main**

Delete `fetchUser`, `fetchUserLicense`, `delBind`, and `addBind` from `src/main/core/OAuth.ts`. Keep callback server creation, browser launch, code exchange, cancellation, and localized HTML unchanged.

Remove the startup `OAuth.fetchUser()` block and its static import from `Application.showPage()`. Shutdown already uses `oauthRuntime.peek()` from Task 5.

- [ ] **Step 5: Preserve existing IPC command names while forwarding to fork**

Refactor the existing fork routing in `IPCHandler` into:

```ts
private handleForkCommand(command: string, key: string, ...args: any[]) {
  const module = command.replace('app-fork:', '')
  this.dispatchForkCommand(command, key, module, args)
}

private dispatchForkCommand(command: string, key: string, module: string, args: any[]) {
  this.deps.serverManager.setProxy()
  this.deps.serverManager.updateGlobalConfig()
  const forkManager = this.deps.forkManager
  if (!forkManager) {
    this.sendToMainWindow(command, key, { code: 1, msg: 'Fork manager not initialized' })
    return
  }
  forkManager
    .send(module, ...args)
    .on((info: any) => this.handleForkCallback(command, key, module, info, args))
    .then((info: any) => this.handleForkCallback(command, key, module, info, args))
}
```

Retain the existing debug-action bookkeeping around the dispatch. Route the existing commands as follows:

```ts
GitHub-OAuth-License-Fetch     -> app / githubLicenseFetch
GitHub-OAuth-License-Del-Bind -> app / githubLicenseDelete
GitHub-OAuth-License-Add-Bind -> app / githubLicenseAdd
```

`GitHub-OAuth-Start` calls `oauthRuntime.load().then(oauth => oauth.startOAuth())`. Cancel calls `oauthRuntime.peek()?.cancel()` and returns the current success response without loading.

- [ ] **Step 6: Refresh the cached GitHub user from SetupStore**

Add a `githubUserRefresh()` action to `SetupStore`:

```ts
githubUserRefresh() {
  IPC.send('app-fork:app', 'githubUserFetch').then((key: string, res?: any) => {
    IPC.off(key)
    if (res?.code !== 0 || !res?.data?.user) return
    this.githubUser = reactive(res.data.user)
    this.githubLicense = reactive(res.data.license ?? [])
    this.githubInfoSave()
  })
}
```

Call it during `SetupStore.init()` without awaiting it. Remove the now-unused `APP-User-UUID-Need-Update` listener from `GlobalIPCOn.ts`.

- [ ] **Step 7: Expand and run regression tests**

Append to the bundle audit:

```ts
assert.equal(eagerInputs.has('src/main/core/OAuth.ts'), false)
for (const dependency of ['axios', 'node-machine-id']) {
  assert.equal(
    eagerExternalImports.some((item) => item === dependency || item.startsWith(`${dependency}/`)),
    false,
    `${dependency} must not be eager in main`
  )
}
```

Add to `package.json`:

```json
"test:github-account": "tsx scripts/github-account-service-test.ts"
```

Run:

```bash
yarn test:github-account
yarn test:main-lazy-bundle
npx vue-tsc --noEmit
npx eslint src/fork/module/App/GitHubAccount.ts src/fork/module/App/index.ts src/main/core/OAuth.ts src/main/core/IPCHandler.ts src/main/Application.ts src/render/components/Setup/store.ts src/render/util/GlobalIPCOn.ts scripts/github-account-service-test.ts
```

Expected: all commands exit 0 and the renderer-visible GitHub command names remain present.

- [ ] **Step 8: Commit**

```bash
git add src/fork/module/App/GitHubAccount.ts scripts/github-account-service-test.ts src/fork/module/App/index.ts src/main/core/OAuth.ts src/main/core/IPCHandler.ts src/main/Application.ts src/render/components/Setup/store.ts src/render/util/GlobalIPCOn.ts scripts/main-process-lazy-bundle-test.ts package.json
git commit -m "perf: move account refresh to fork process"
```

### Task 7: Lazy-Load the MCP SDK Runtime

**Files:**

- Create: `src/main/core/MCPRuntime.ts`
- Create: `scripts/mcp-lazy-runtime-test.ts`
- Modify: `src/main/Application.ts`
- Modify: `src/main/core/IPCHandler.ts`
- Modify: `scripts/main-process-lazy-bundle-test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the failing conditional-runtime test**

Create `scripts/mcp-lazy-runtime-test.ts`:

```ts
import assert from 'node:assert/strict'
import { MCPRuntime } from '../src/main/core/MCPRuntime'

class FakeServer {
  starts = 0
  stops = 0
  async start() {
    this.starts += 1
    return { running: true }
  }
  async stop() {
    this.stops += 1
    return { running: false }
  }
  status() {
    return { running: this.starts > this.stops, host: '127.0.0.1', port: 7682 }
  }
}

let autoStart = false
let loads = 0
const server = new FakeServer()
const config = {
  getConfig(key?: string, fallback?: any) {
    if (key === 'autoStart') return autoStart
    if (key) return fallback
    return { host: '127.0.0.1', port: 7682, transport: { http: true }, enabledTools: [] }
  }
}
const runtime = new MCPRuntime(config as any, async () => {
  loads += 1
  return server as any
})

assert.equal(await runtime.startOnLaunch(), false)
assert.equal(loads, 0, 'disabled auto-start must not load MCP')
assert.equal(runtime.status().running, false)
assert.deepEqual(await runtime.stopLoaded(), { running: false })
assert.equal(loads, 0, 'status and shutdown must not load MCP')

autoStart = true
assert.equal(await runtime.startOnLaunch(), true)
assert.equal(loads, 1)
assert.equal(server.starts, 1)
assert.equal(runtime.status().running, true)
await runtime.stopLoaded()
assert.equal(server.stops, 1)

console.log('MCP lazy runtime tests passed')
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
npx tsx scripts/mcp-lazy-runtime-test.ts
```

Expected: FAIL because `MCPRuntime.ts` does not exist.

- [ ] **Step 3: Implement the conditional MCP owner**

Create `src/main/core/MCPRuntime.ts`:

```ts
import { LazyRuntime } from './lazy/LazyRuntime'

type MCPConfigReader = {
  getConfig: (key?: string, defaultValue?: any) => any
}

type MCPServerController = {
  start: () => Promise<any>
  stop: () => Promise<any>
  status: () => Record<string, any>
}

export class MCPRuntime {
  private readonly runtime: LazyRuntime<MCPServerController>

  constructor(
    private readonly config: MCPConfigReader,
    factory: () => Promise<MCPServerController>
  ) {
    this.runtime = new LazyRuntime(factory)
  }

  load() {
    return this.runtime.load()
  }

  peek() {
    return this.runtime.peek()
  }

  async start() {
    return (await this.load()).start()
  }

  async startOnLaunch() {
    if (!this.config.getConfig('autoStart', false)) return false
    try {
      await this.start()
      return true
    } catch (error) {
      console.log('mcp auto-start error: ', error)
      return false
    }
  }

  async stopLoaded() {
    const server = this.peek()
    if (!server) return { running: false }
    return server.stop()
  }

  status() {
    const server = this.peek()
    if (server) return server.status()
    return { ...(this.config.getConfig() ?? {}), running: false }
  }
}
```

`startOnLaunch()` reads `autoStart` before `load()`. `stopLoaded()` preserves the renderer response shape without loading, and `status()` synthesizes the stopped state from configuration when the server is absent.

- [ ] **Step 4: Integrate MCPRuntime into Application and IPC**

Keep `MCPConfigManager` and `MCPBridgeManager` eager. Remove the value import and direct construction of `MCPServer` from `Application.ts`. After `ForkManager` is ready, construct:

```ts
this.mcpRuntime = new MCPRuntime(this.mcpConfigManager, async () => {
  const { default: MCPServer } = await import('./core/MCPServer')
  return new MCPServer(this.forkManager!, this.mcpConfigManager, this.configManager)
})
this.ipcHandler.updateDependencies({
  forkManager: this.forkManager,
  mcpRuntime: this.mcpRuntime
})
void this.mcpRuntime.startOnLaunch()
```

Replace `mcpServer` in `IPCHandlerDependencies` with a type-only `mcpRuntime`. `mcp:start` calls `runtime.start()`, `mcp:stop` calls `runtime.stopLoaded()`, and `mcp:status` calls `runtime.status()`. Configuration and bridge commands remain unchanged. Application shutdown calls `await this.mcpRuntime?.stopLoaded()`.

Change audit-log handlers to `mcpAuditRuntime.load()` and return the same `{ code, data }` responses. Loading the audit chunk must not load `MCPServer` or the SDK.

- [ ] **Step 5: Expand the bundle audit**

Append:

```ts
for (const input of [
  'src/main/core/MCPServer.ts',
  'src/main/core/MCPTools.ts',
  'src/main/core/MCPContextResolver.ts'
]) {
  assert.equal(eagerInputs.has(input), false, `${input} must not be eager`)
}
assert.equal(
  eagerExternalImports.some((item) => item.startsWith('@modelcontextprotocol/sdk/')),
  false,
  'MCP SDK must not be eager'
)
```

- [ ] **Step 6: Register and run all MCP regressions**

Add to `package.json`:

```json
"test:mcp-lazy-runtime": "tsx scripts/mcp-lazy-runtime-test.ts"
```

Run:

```bash
yarn test:mcp-lazy-runtime
npx tsx scripts/mcp-lifecycle-preferences-test.ts
npx tsx scripts/mcp-regression-test.ts
npx tsx scripts/mcp-list-services-cache-test.ts
yarn test:main-lazy-bundle
npx vue-tsc --noEmit
```

Expected: all commands exit 0. The disabled runtime test must report zero loads; auto-start must load exactly once.

- [ ] **Step 7: Commit**

```bash
git add src/main/core/MCPRuntime.ts scripts/mcp-lazy-runtime-test.ts src/main/Application.ts src/main/core/IPCHandler.ts scripts/main-process-lazy-bundle-test.ts package.json
git commit -m "perf: lazy load MCP main runtime"
```

### Task 8: Run the Complete Static, Type, and Build Verification

**Files:**

- Modify: `package.json`
- Verify: all files changed in Tasks 1–7
- Verify: `dist/electron/main.mjs`
- Verify: `dist/electron/chunks/`

- [ ] **Step 1: Add the aggregate deterministic test script**

Add to `package.json`:

```json
"test:main-lazy": "yarn test:main-lazy-runtime && yarn test:main-lazy-utilities && yarn test:github-account && yarn test:mcp-lazy-runtime && yarn test:main-lazy-bundle"
```

- [ ] **Step 2: Run deterministic tests**

Run:

```bash
yarn test:main-lazy
yarn test:helper
npx tsx scripts/mcp-lifecycle-preferences-test.ts
npx tsx scripts/mcp-regression-test.ts
yarn test:language-lazy
```

Expected: every command exits 0.

- [ ] **Step 3: Run formatting, lint, and type verification**

Run:

```bash
npx prettier --check configs/esbuild.config.ts configs/esbuild.config.win.ts src/main src/shared/debounce.ts src/shared/process-options.ts src/fork/Helper.ts src/fork/module/App src/render/components/Setup/store.ts src/render/util/GlobalIPCOn.ts scripts/main-process-lazy-runtime-test.ts scripts/main-process-lazy-bundle-test.ts scripts/main-process-eager-utilities-test.ts scripts/github-account-service-test.ts scripts/mcp-lazy-runtime-test.ts package.json
npx eslint src/main src/shared/debounce.ts src/shared/process-options.ts src/fork/Helper.ts src/fork/module/App src/render/components/Setup/store.ts src/render/util/GlobalIPCOn.ts scripts/main-process-lazy-runtime-test.ts scripts/main-process-lazy-bundle-test.ts scripts/main-process-eager-utilities-test.ts scripts/github-account-service-test.ts scripts/mcp-lazy-runtime-test.ts
npx vue-tsc --noEmit
```

Expected: all commands exit 0. Existing warnings outside this file set may be recorded, but no new diagnostics are accepted.

- [ ] **Step 4: Build production main and fork outputs without packaging**

Run:

```bash
yarn clean:dev
npx tsx -e "import { build } from 'esbuild'; import config from './configs/esbuild.config'; (async () => { await build(config.dist); await build(config.distFork) })().catch((error) => { console.error(error); process.exitCode = 1 })"
find dist/electron -maxdepth 2 -type f -name '*.mjs' -print | sort
```

Expected: build exits 0; output contains `dist/electron/main.mjs`, `dist/electron/fork.mjs`, and multiple files below `dist/electron/chunks/`.

- [ ] **Step 5: Confirm the production entry excludes optional imports**

Run:

```bash
yarn test:main-lazy-bundle
rg -n "node-pty|node-window-manager|serve-handler|@modelcontextprotocol/sdk|node-machine-id|markdown-it-async|from\"axios\"|from \"axios\"" dist/electron/main.mjs
```

Expected: the audit passes and `rg` exits 1 with no matches in `main.mjs`. Matches inside `dist/electron/chunks/*.mjs` are expected.

- [ ] **Step 6: Commit the aggregate verification entry**

```bash
git add package.json
git commit -m "test: add main process lazy loading suite"
```

### Task 9: Perform Development, Feature, Packaging, and Memory Smoke Tests

**Files:**

- Verify: `dist/electron/`
- Verify: packaged ASAR output for the current platform
- No source edits are expected unless a smoke test exposes a defect.

- [ ] **Step 1: Launch a clean development session**

Run:

```bash
yarn dev
```

Expected: the development runner builds split main chunks, launches `dist/electron/main.mjs`, and the main window, menu, tray, selected locale, and base IPC initialize without an import-resolution error.

- [ ] **Step 2: Measure stable idle main RSS three times**

For each fresh launch, do not start a service task, wait ten seconds after the main window appears, then run:

```bash
ps -axo pid=,rss=,command= | rg 'dist/electron/main.mjs'
```

Expected on macOS/Linux: exactly one main-process row; divide RSS KiB by 1024 for MiB. Record all three readings and compare the median with the pre-change approximately 160 MB main-process baseline. Also inspect renderer, GPU/helper, and utility-process rows separately so fork migration is not reported as total-memory savings. On Windows, take the equivalent main `FlyEnv.exe` private working-set readings in Task Manager or Process Explorer.

- [ ] **Step 3: Verify deferred loading feature by feature**

In one session, exercise this sequence and check the main-process log for first-use chunk errors after each action:

```text
terminal create -> write -> resize -> clear -> stop
capture config restore -> start capture -> select window -> save -> stop
SiteSucker setup -> save -> run -> stop
static HTTP server start -> stop
Markdown preview render with a fenced code block
MIME type list, TOML parse/stringify, and RSA key generation
GitHub cached-user refresh -> login cancel -> login success -> license fetch/add/delete
MCP status with autoStart off -> manual start -> stop
Nginx startup with an existing common config
```

Expected: every existing UI response remains correct. Before the first matching action, the corresponding optional dependency is absent from the eager bundle by the deterministic audit; first use completes within roughly 500 ms excluding network and user-driven OAuth time.

- [ ] **Step 4: Verify conditional paths**

Run these isolated checks:

```text
enable MCP autoStart, relaunch, confirm MCP is running, then disable it
temporarily move the test profile's Nginx common config aside, relaunch, confirm extraction and regenerated nginx.conf, then restore the config
invoke the platform helper check and, on Windows, an allowed helper-fallback command
quit once before using optional tools and once after using each native tool group
```

Expected: MCP loads only when configured; missing Nginx config still extracts; helper behavior and permission prompts are unchanged; shutdown neither imports unused chunks nor leaves active PTYs, HTTP servers, capture shortcuts, crawler work, OAuth callback listeners, or MCP listeners.

- [ ] **Step 5: Verify packaged chunk resolution**

Run the normal unsigned/local packaging workflow for the current platform:

```bash
yarn build
```

Expected: electron-builder includes `dist/electron/**/*`, the packaged application opens from ASAR, and first use of terminal, Markdown, OAuth, and MCP resolves their chunks without `ERR_MODULE_NOT_FOUND`. Platform signing/notarization credentials are not required for the local unpacked smoke artifact; if the configured release target requires credentials, run the generated unpacked application before the signing stage.

- [ ] **Step 6: Run final repository verification**

Run:

```bash
git status --short
git log --oneline -10
```

Expected: no unintended generated or source files are staged; Tasks 1–8 appear as focused commits. Report the three idle RSS readings, median, baseline delta, first-use latency observations, tested platform, and any platform smoke checks that still require CI hardware.
