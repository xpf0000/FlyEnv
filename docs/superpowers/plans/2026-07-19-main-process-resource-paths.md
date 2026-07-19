# Main Process Resource Paths Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make all packaged main-process resource paths independent of esbuild chunk location and handle screenshot page load failures without unhandled promise rejections.

**Architecture:** Introduce pure application-root path resolvers plus Electron runtime wrappers that supply `app.getAppPath()`. Migrate every audited application resource lookup to those wrappers, then enforce the contract at source and generated-bundle boundaries. Keep renderer layout and main-process splitting unchanged.

**Tech Stack:** TypeScript 5.8, Electron 39, Node.js path APIs, esbuild splitting/metafile output, Vite 6, Electron Builder, Node `assert` test scripts run with `tsx`.

---

## File Structure

- Create `src/main/utils/AppResourcePath.ts`: pure, Electron-free application/electron/renderer path resolvers.
- Create `src/main/utils/AppRuntimePath.ts`: runtime wrappers that obtain the stable root from `app.getAppPath()`.
- Create `scripts/main-process-resource-path-test.ts`: focused resolver, source-contract, and screenshot-load-error regression test.
- Modify `src/main/index.ts`: derive `global.__static` from the application root.
- Modify `src/main/configs/page.ts`: derive main and tray HTML paths from the renderer output root.
- Modify `src/main/Application.ts`: derive `fork.mjs` from the Electron output root.
- Modify `src/main/core/Capturer.ts`: derive screenshot HTML from the renderer output root and cleanly handle load failures.
- Modify `src/main/core/UpdateManager.ts`: derive development `app-update.yml` from the application root.
- Modify `scripts/main-process-lazy-bundle-test.ts`: assert Capturer remains a dynamic chunk but no longer crosses output directories via `../render`.
- Modify `package.json`: expose the focused test and include it in `test:main-lazy`.

### Task 1: Add Stable Resource Path APIs

**Files:**
- Create: `scripts/main-process-resource-path-test.ts`
- Create: `src/main/utils/AppResourcePath.ts`
- Create: `src/main/utils/AppRuntimePath.ts`

- [ ] **Step 1: Write the failing resolver test**

Create `scripts/main-process-resource-path-test.ts` with:

```ts
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const purePathModule = 'src/main/utils/AppResourcePath.ts'
const runtimePathModule = 'src/main/utils/AppRuntimePath.ts'

assert.equal(existsSync(purePathModule), true, 'pure resource path resolver must exist')
assert.equal(existsSync(runtimePathModule), true, 'Electron runtime path wrapper must exist')

const {
  resolveAppResourcePath,
  resolveElectronResourcePath,
  resolveRendererResourcePath
} = await import('../src/main/utils/AppResourcePath')

const appRoot = resolve('tmp', 'flyenv-app')
assert.equal(resolveAppResourcePath(appRoot, 'app-update.yml'), resolve(appRoot, 'app-update.yml'))
assert.equal(
  resolveElectronResourcePath(appRoot, 'fork.mjs'),
  resolve(appRoot, 'dist', 'electron', 'fork.mjs')
)
assert.equal(
  resolveElectronResourcePath(appRoot, 'static'),
  resolve(appRoot, 'dist', 'electron', 'static')
)
assert.equal(
  resolveRendererResourcePath(appRoot, 'capturer', 'capturer.html'),
  resolve(appRoot, 'dist', 'render', 'capturer', 'capturer.html')
)

const runtimeSource = readFileSync(runtimePathModule, 'utf8')
assert.match(runtimeSource, /app\.getAppPath\(\)/)
assert.match(runtimeSource, /getAppResourcePath/)
assert.match(runtimeSource, /getElectronResourcePath/)
assert.match(runtimeSource, /getRendererResourcePath/)

console.log('main process resource path tests passed')
```

- [ ] **Step 2: Run the test and verify the expected failure**

Run:

```bash
npx tsx scripts/main-process-resource-path-test.ts
```

Expected: FAIL with `pure resource path resolver must exist` because neither path utility exists yet.

- [ ] **Step 3: Implement the pure path resolver**

Create `src/main/utils/AppResourcePath.ts`:

```ts
import { resolve } from 'node:path'

export const resolveAppResourcePath = (appRoot: string, ...segments: string[]) => {
  return resolve(appRoot, ...segments)
}

export const resolveElectronResourcePath = (appRoot: string, ...segments: string[]) => {
  return resolveAppResourcePath(appRoot, 'dist', 'electron', ...segments)
}

export const resolveRendererResourcePath = (appRoot: string, ...segments: string[]) => {
  return resolveAppResourcePath(appRoot, 'dist', 'render', ...segments)
}
```

- [ ] **Step 4: Implement Electron runtime wrappers**

Create `src/main/utils/AppRuntimePath.ts`:

```ts
import { app } from 'electron'
import {
  resolveAppResourcePath,
  resolveElectronResourcePath,
  resolveRendererResourcePath
} from './AppResourcePath'

export const getAppResourcePath = (...segments: string[]) => {
  return resolveAppResourcePath(app.getAppPath(), ...segments)
}

export const getElectronResourcePath = (...segments: string[]) => {
  return resolveElectronResourcePath(app.getAppPath(), ...segments)
}

export const getRendererResourcePath = (...segments: string[]) => {
  return resolveRendererResourcePath(app.getAppPath(), ...segments)
}
```

- [ ] **Step 5: Run the focused test and verify it passes**

Run:

```bash
npx tsx scripts/main-process-resource-path-test.ts
```

Expected: PASS with `main process resource path tests passed`.

- [ ] **Step 6: Commit the path API**

```bash
git add scripts/main-process-resource-path-test.ts src/main/utils/AppResourcePath.ts src/main/utils/AppRuntimePath.ts
git commit -m "fix: add stable main resource paths"
```

### Task 2: Migrate Every Audited Application Resource

**Files:**
- Modify: `scripts/main-process-resource-path-test.ts`
- Modify: `scripts/main-process-lazy-bundle-test.ts`
- Modify: `src/main/index.ts:1-27`
- Modify: `src/main/configs/page.ts:1-10`
- Modify: `src/main/Application.ts:1-41,235-240`
- Modify: `src/main/core/Capturer.ts:1-23`
- Modify: `src/main/core/UpdateManager.ts:1-17`

- [ ] **Step 1: Extend the focused test with failing source contracts**

Insert before the final `console.log` in `scripts/main-process-resource-path-test.ts`:

```ts
const auditedSources = {
  index: readFileSync('src/main/index.ts', 'utf8'),
  pages: readFileSync('src/main/configs/page.ts', 'utf8'),
  application: readFileSync('src/main/Application.ts', 'utf8'),
  capturer: readFileSync('src/main/core/Capturer.ts', 'utf8'),
  updater: readFileSync('src/main/core/UpdateManager.ts', 'utf8')
}

for (const [name, source] of Object.entries(auditedSources)) {
  assert.doesNotMatch(
    source,
    /fileURLToPath\(import\.meta\.url\)|\b__dirname\b/,
    `${name} must not derive application resources from its generated module location`
  )
}

assert.match(auditedSources.index, /getElectronResourcePath\('static'\)/)
assert.match(auditedSources.pages, /getRendererResourcePath\('index\.html'\)/)
assert.match(auditedSources.pages, /getRendererResourcePath\('tray\.html'\)/)
assert.match(auditedSources.application, /getElectronResourcePath\('fork\.mjs'\)/)
assert.match(
  auditedSources.capturer,
  /getRendererResourcePath\('capturer', 'capturer\.html'\)/
)
assert.match(auditedSources.updater, /getAppResourcePath\('app-update\.yml'\)/)
```

- [ ] **Step 2: Extend the bundle test to reproduce the chunk-relative failure**

In `scripts/main-process-lazy-bundle-test.ts`, immediately after `const result = await buildMainFixture()`, add:

```ts
const capturerOutputEntry = Object.entries(result.metafile!.outputs).find(([, output]) =>
  Object.hasOwn(output.inputs, 'src/main/core/Capturer.ts')
)
assert.ok(capturerOutputEntry, 'Capturer output must exist')
assert.match(
  capturerOutputEntry[0].replaceAll('\\', '/'),
  /\/chunks\/Capturer-[^/]+\.mjs$/,
  'Capturer must remain a dynamically loaded chunk'
)
const capturerOutputFile = result.outputFiles?.find((output) =>
  output.path
    .replaceAll('\\', '/')
    .endsWith(capturerOutputEntry[0].replaceAll('\\', '/'))
)
assert.ok(capturerOutputFile, 'Capturer generated file must be available for inspection')
assert.doesNotMatch(
  capturerOutputFile.text,
  /\.\.\/render\/capturer\/capturer\.html/,
  'Capturer chunk must not resolve renderer files relative to the chunk directory'
)
assert.match(
  capturerOutputFile.text,
  /getRendererResourcePath\("capturer", "capturer\.html"\)/,
  'Capturer chunk must use the stable renderer resource path API'
)
```

After the existing builder loop, add the renderer packaging and Vite entry contracts:

```ts
for (const builder of [
  'configs/electron-builder.ts',
  'configs/electron-builder.win.ts',
  'configs/electron-builder.linux.ts'
]) {
  const builderSource = readFileSync(builder, 'utf8')
  assert.match(builderSource, /dist\/electron\/\*\*\/\*/)
  assert.match(builderSource, /dist\/render\/\*\*\/\*/)
}

const viteConfigSource = readFileSync('configs/vite.config.ts', 'utf8')
assert.match(
  viteConfigSource,
  /capturer:\s*path\.resolve\(__dirname, '\.\.\/src\/render\/capturer\/capturer\.html'\)/
)
```

Replace the old builder loop, rather than keeping two loops that check the same files.

- [ ] **Step 3: Run both tests and verify they fail for the current bug**

Run:

```bash
npx tsx scripts/main-process-resource-path-test.ts
npx tsx scripts/main-process-lazy-bundle-test.ts
```

Expected:

- Resource-path test FAILS because `src/main/index.ts` still contains module-local `__dirname`.
- Lazy-bundle test FAILS because the Capturer chunk contains `../render/capturer/capturer.html`.

- [ ] **Step 4: Migrate `src/main/index.ts`**

Replace the complete file with:

```ts
import { app } from 'electron'
import path from 'path'
import Launcher from './Launcher'
import { existsSync } from 'node:fs'
import is from 'electron-is'
import { isLinux } from '@shared/utils'
import { getElectronResourcePath } from './utils/AppRuntimePath'

if (is.production() && !isLinux()) {
  if (process.env?.PORTABLE_EXECUTABLE_DIR) {
    const portableDataPath = path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'FlyEnv-Data')
    app.setPath('userData', portableDataPath)
    app.setPath('sessionData', portableDataPath)
  } else {
    const appData = app.getPath('appData')
    const oldPath = path.join(appData, 'PhpWebStudy')
    if (existsSync(oldPath)) {
      app.setPath('userData', oldPath)
      app.setPath('sessionData', oldPath)
    }
  }
}

global.__static = getElectronResourcePath('static').replace(/\\/g, '\\\\')
global.launcher = new Launcher()

export default () => {}
```

- [ ] **Step 5: Migrate `src/main/configs/page.ts`**

Replace the complete file with:

```ts
import is from 'electron-is'
import { ViteDevPort } from '../../../configs/vite.port'
import { getRendererResourcePath } from '../utils/AppRuntimePath'
import BrowserWindowConstructorOptions = Electron.BrowserWindowConstructorOptions

const index = getRendererResourcePath('index.html')
const tray = getRendererResourcePath('tray.html')

interface PageOptions {
  [key: string]: {
    attrs: BrowserWindowConstructorOptions
    bindCloseToHide: boolean
    url: string
  }
}

const options: PageOptions = {
  index: {
    attrs: {
      title: 'FlyEnv',
      width: 1200,
      height: 800,
      minWidth: 800,
      minHeight: 600
    },
    bindCloseToHide: true,
    url: is.dev() ? `http://localhost:${ViteDevPort}` : index
  },
  tray: {
    attrs: {},
    bindCloseToHide: true,
    url: is.dev() ? `http://localhost:${ViteDevPort}/tray.html` : tray
  }
}

export default options
```

- [ ] **Step 6: Migrate `src/main/Application.ts`**

Change the imports from:

```ts
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
```

to:

```ts
import { resolve } from 'node:path'
import { getElectronResourcePath } from './utils/AppRuntimePath'
```

Delete:

```ts
const __dirname = dirname(fileURLToPath(import.meta.url))
```

Replace `initForkManager()`'s construction line with:

```ts
this.forkManager = new ForkManager(getElectronResourcePath('fork.mjs'))
```

- [ ] **Step 7: Migrate `src/main/core/Capturer.ts`**

Replace:

```ts
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve as PathResolve } from 'node:path'
```

with:

```ts
import { join } from 'node:path'
```

Add:

```ts
import { getRendererResourcePath } from '../utils/AppRuntimePath'
```

Replace:

```ts
const __dirname = dirname(fileURLToPath(import.meta.url))
const index = PathResolve(__dirname, '../render/capturer/capturer.html')
```

with:

```ts
const index = getRendererResourcePath('capturer', 'capturer.html')
```

- [ ] **Step 8: Migrate `src/main/core/UpdateManager.ts`**

Replace the imports and development configuration block with:

```ts
import { EventEmitter } from 'events'
import { dialog } from 'electron'
import is from 'electron-is'
import _updater from 'electron-updater'
import logger from './Logger'
import { I18nT } from '@lang/runtime'
import type { AppUpdater } from 'electron-updater/out/AppUpdater'
import { getAppResourcePath } from '../utils/AppRuntimePath'

const { autoUpdater } = _updater

if (is.dev()) {
  autoUpdater.updateConfigPath = getAppResourcePath('app-update.yml')
}
```

Leave the `UpdateManager` class unchanged.

- [ ] **Step 9: Run the focused and bundle tests**

Run:

```bash
npx tsx scripts/main-process-resource-path-test.ts
npx tsx scripts/main-process-lazy-bundle-test.ts
```

Expected: both PASS. The bundle test must still prove Capturer is emitted under `chunks/`.

- [ ] **Step 10: Commit the resource migration**

```bash
git add scripts/main-process-resource-path-test.ts scripts/main-process-lazy-bundle-test.ts src/main/index.ts src/main/configs/page.ts src/main/Application.ts src/main/core/Capturer.ts src/main/core/UpdateManager.ts
git commit -m "fix: decouple app resources from chunk paths"
```

### Task 3: Handle Screenshot Page Load Failures

**Files:**
- Modify: `scripts/main-process-resource-path-test.ts`
- Modify: `src/main/core/Capturer.ts:55-95,357-363`

- [ ] **Step 1: Add the failing screenshot load-error contract**

Insert before the final `console.log` in `scripts/main-process-resource-path-test.ts`:

```ts
const capturerSource = auditedSources.capturer
assert.doesNotMatch(capturerSource, /load(?:URL|File)\([^\n]+\)\.catch\(\)/)
assert.match(capturerSource, /private handleWindowLoadError\(/)
assert.match(capturerSource, /globalShortcut\.unregister\('Escape'\)/)
assert.match(capturerSource, /this\.windowImage = null/)
assert.match(capturerSource, /this\.capturering = false/)
assert.match(capturerSource, /window\.isDestroyed\(\)/)
assert.match(capturerSource, /dialog\.showErrorBox\(/)
assert.match(capturerSource, /loadPage\.catch\(\(error\) =>/)
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
npx tsx scripts/main-process-resource-path-test.ts
```

Expected: FAIL because Capturer still contains `.catch()` without a callback and has no `handleWindowLoadError` method.

- [ ] **Step 3: Add deterministic screenshot-window cleanup**

Add this private method to `Capturer`, immediately before `stopCapturer()`:

```ts
private handleWindowLoadError(window: BrowserWindow, error: unknown) {
  globalShortcut.unregister('Escape')
  this.windowImage = null
  this.capturering = false
  if (this.window === window) {
    this.window = undefined
  }
  if (!window.isDestroyed()) {
    window.destroy()
  }
  const message = error instanceof Error ? error.message : `${error}`
  dialog.showErrorBox(
    I18nT('tools.CapturerFailTitle'),
    `${I18nT('tools.CapturerFailContent')}\n\n${message}`
  )
}
```

- [ ] **Step 4: Attach a real rejection handler to page loading**

Replace:

```ts
if (is.dev()) {
  window.loadURL(`http://localhost:${ViteDevPort}/capturer/capturer.html`).catch()
} else {
  window.loadFile(index).catch()
}
```

with:

```ts
const loadPage = is.dev()
  ? window.loadURL(`http://localhost:${ViteDevPort}/capturer/capturer.html`)
  : window.loadFile(index)
void loadPage.catch((error) => {
  this.handleWindowLoadError(window, error)
})
```

- [ ] **Step 5: Run the focused test and verify it passes**

Run:

```bash
npx tsx scripts/main-process-resource-path-test.ts
```

Expected: PASS with no empty BrowserWindow load `.catch()` calls in Capturer.

- [ ] **Step 6: Run the bundle regression test**

Run:

```bash
npx tsx scripts/main-process-lazy-bundle-test.ts
```

Expected: PASS; the cleanup method must not make Capturer eager.

- [ ] **Step 7: Commit screenshot load handling**

```bash
git add scripts/main-process-resource-path-test.ts src/main/core/Capturer.ts
git commit -m "fix: handle capturer page load failures"
```

### Task 4: Wire the Regression Test into the Main Lazy Suite

**Files:**
- Modify: `scripts/main-process-resource-path-test.ts`
- Modify: `package.json:27-32`

- [ ] **Step 1: Add a failing package-script contract**

Insert before the final `console.log` in `scripts/main-process-resource-path-test.ts`:

```ts
const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))
assert.equal(
  packageJson.scripts['test:main-resource-path'],
  'tsx scripts/main-process-resource-path-test.ts'
)
assert.match(packageJson.scripts['test:main-lazy'], /yarn test:main-resource-path/)
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
npx tsx scripts/main-process-resource-path-test.ts
```

Expected: FAIL because `test:main-resource-path` does not exist in `package.json`.

- [ ] **Step 3: Add the package scripts**

Add:

```json
"test:main-resource-path": "tsx scripts/main-process-resource-path-test.ts",
```

Change `test:main-lazy` to:

```json
"test:main-lazy": "yarn test:main-lazy-runtime && yarn test:main-lazy-utilities && yarn test:main-resource-path && yarn test:github-account && yarn test:mcp-lazy-runtime && yarn test:main-lazy-bundle",
```

- [ ] **Step 4: Run the focused test through Yarn**

Run:

```bash
yarn test:main-resource-path
```

Expected: PASS with `main process resource path tests passed`.

- [ ] **Step 5: Run the complete main lazy-loading suite**

Run:

```bash
yarn test:main-lazy
```

Expected: all main lazy runtime, utility, resource path, GitHub account, MCP runtime, and bundle tests PASS.

- [ ] **Step 6: Commit test-suite integration**

```bash
git add scripts/main-process-resource-path-test.ts package.json
git commit -m "test: cover main resource paths"
```

### Task 5: Build and Inspect Production Outputs

**Files:**
- Verify: `dist/electron/main.mjs`
- Verify: `dist/electron/chunks/Capturer-*.mjs`
- Verify: `dist/render/capturer/capturer.html`

- [ ] **Step 1: Build the production main process**

Run:

```bash
npx tsx -e "import { build } from 'esbuild'; import config from './configs/esbuild.config.ts'; void build(config.dist)"
```

Expected: exit code 0 and regenerated `dist/electron/main.mjs` plus dynamic chunks.

- [ ] **Step 2: Inspect the generated Capturer chunk**

Run:

```bash
rg -n "capturer\.html|\.\.\/render\/capturer" dist/electron/chunks/Capturer-*.mjs
```

Expected: the chunk contains the `capturer.html` path segments and contains no `../render/capturer` lookup.

- [ ] **Step 3: Build the production renderer with sufficient Node heap**

Run:

```bash
NODE_OPTIONS=--max-old-space-size=8192 npx tsx -e "import { build } from 'vite'; import config from './configs/vite.config.ts'; void build(config.buildConfig)"
```

Expected: exit code 0. Existing Vite chunk warnings are acceptable; heap exhaustion is not.

- [ ] **Step 4: Confirm the packaged renderer entry exists at the resolved location**

Run:

```bash
test -f dist/render/capturer/capturer.html
```

Expected: exit code 0.

- [ ] **Step 5: Run final regression verification**

Run:

```bash
yarn test:main-lazy
git diff --check
git status --short
```

Expected:

- all tests PASS;
- `git diff --check` produces no output;
- `git status --short` shows only intentional implementation changes or is clean after the planned commits.

- [ ] **Step 6: Review the final commit range**

Run:

```bash
git log --oneline 98e3220a..HEAD
git diff --stat 98e3220a..HEAD
```

Expected: four focused implementation commits covering the path API, resource migration, screenshot load handling, and regression suite integration.
