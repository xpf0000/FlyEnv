# Vite Lazy-Locale Dependency Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent Vite development sessions from mixing old and newly optimized Vue/Pinia runtimes when Element Plus locale chunks load lazily.

**Architecture:** Keep renderer locale imports lazy, but give Vite an explicit configuration-only manifest of every Element Plus locale dependency so its development optimizer builds one stable dependency graph before the UI loads. A parity test compares the manifest with the real static and dynamic imports and verifies both Vite development configurations consume it.

**Tech Stack:** TypeScript, Vite 6, Vue 3, Pinia 3, Element Plus, Node `assert`, TSX, Yarn

---

## File Structure

- Create `configs/element-plus-locales.ts`: one immutable list of bare Element Plus locale module identifiers used only by build tooling.
- Modify `configs/vite.config.ts`: pass a mutable copy of the manifest to `optimizeDeps.include`.
- Create `scripts/language-vite-optimize-test.ts`: compare renderer imports, the manifest, and the effective Vite development configurations.
- Modify `package.json`: expose the focused test and include it in the complete lazy-language test chain.

No component, store, Pinia, or renderer language-service file changes are required.

### Task 1: Add the Failing Optimizer-Manifest Regression Test

**Files:**

- Create: `scripts/language-vite-optimize-test.ts`

- [ ] **Step 1: Write the failing test**

Create `scripts/language-vite-optimize-test.ts` with this complete content:

```ts
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = process.cwd()
const manifestFile = resolve(root, 'configs/element-plus-locales.ts')

assert.equal(
  existsSync(manifestFile),
  true,
  'configs/element-plus-locales.ts must declare every optimized Element Plus locale'
)

const { ElementPlusLocaleModules } = await import(pathToFileURL(manifestFile).href)
const { default: viteConfig } = await import('../configs/vite.config')
const rendererSource = readFileSync(resolve(root, 'src/lang/render.ts'), 'utf8')
const localeImportPattern = /(?:from\s+|import\()['"](element-plus\/es\/locale\/lang\/[^'"]+)['"]/g
const rendererModules = [...rendererSource.matchAll(localeImportPattern)].map((match) => match[1])
const expected = [...new Set(rendererModules)].sort()
const configured = [...ElementPlusLocaleModules].sort()
const serverIncludes = [...(viteConfig.serverConfig.optimizeDeps?.include ?? [])].sort()
const serveIncludes = [...(viteConfig.serveConfig.optimizeDeps?.include ?? [])].sort()

assert.deepEqual(configured, expected, 'Vite locale manifest must match renderer locale imports')
assert.deepEqual(serverIncludes, expected, 'serverConfig must pre-optimize every renderer locale')
assert.deepEqual(serveIncludes, expected, 'serveConfig must pre-optimize every renderer locale')

console.log('language Vite optimization tests passed')
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
npx tsx scripts/language-vite-optimize-test.ts
```

Expected: FAIL with `AssertionError` containing `configs/element-plus-locales.ts must declare every optimized Element Plus locale`. The failure proves the test detects the missing optimizer manifest; do not proceed if it passes or fails for a syntax error.

### Task 2: Declare and Wire the Complete Locale Optimization Manifest

**Files:**

- Create: `configs/element-plus-locales.ts`
- Modify: `configs/vite.config.ts:1-56`
- Modify: `package.json:20-35`
- Test: `scripts/language-vite-optimize-test.ts`

- [ ] **Step 1: Create the immutable build-tool manifest**

Create `configs/element-plus-locales.ts`:

```ts
export const ElementPlusLocaleModules = [
  'element-plus/es/locale/lang/ar',
  'element-plus/es/locale/lang/az',
  'element-plus/es/locale/lang/bg',
  'element-plus/es/locale/lang/bn',
  'element-plus/es/locale/lang/cs',
  'element-plus/es/locale/lang/da',
  'element-plus/es/locale/lang/de',
  'element-plus/es/locale/lang/el',
  'element-plus/es/locale/lang/en',
  'element-plus/es/locale/lang/es',
  'element-plus/es/locale/lang/fi',
  'element-plus/es/locale/lang/fr',
  'element-plus/es/locale/lang/hr',
  'element-plus/es/locale/lang/hu',
  'element-plus/es/locale/lang/id',
  'element-plus/es/locale/lang/it',
  'element-plus/es/locale/lang/ja',
  'element-plus/es/locale/lang/ko',
  'element-plus/es/locale/lang/nl',
  'element-plus/es/locale/lang/no',
  'element-plus/es/locale/lang/pl',
  'element-plus/es/locale/lang/pt',
  'element-plus/es/locale/lang/pt-br',
  'element-plus/es/locale/lang/ro',
  'element-plus/es/locale/lang/ru',
  'element-plus/es/locale/lang/sv',
  'element-plus/es/locale/lang/tr',
  'element-plus/es/locale/lang/uk',
  'element-plus/es/locale/lang/vi',
  'element-plus/es/locale/lang/zh-cn',
  'element-plus/es/locale/lang/zh-tw'
] as const
```

- [ ] **Step 2: Include the manifest in Vite dependency optimization**

Add this import near the other configuration imports in `configs/vite.config.ts`:

```ts
import { ElementPlusLocaleModules } from './element-plus-locales'
```

Change the shared `optimizeDeps` block to:

```ts
optimizeDeps: {
  include: [...ElementPlusLocaleModules],
  esbuildOptions: {
    jsx: 'preserve',
    target: 'esnext',
    supported: {
      'top-level-await': true
    }
  }
},
```

Do not import this manifest from `src/lang/render.ts`, change its dynamic imports, or add `setActivePinia()`.

- [ ] **Step 3: Add the focused script to the language test chain**

Add this script to `package.json` alongside the existing language scripts:

```json
"test:language-vite-optimize": "tsx scripts/language-vite-optimize-test.ts"
```

Change `test:language-lazy` so the new check runs before the bundle audit:

```json
"test:language-lazy": "yarn test:language-assets && yarn test:language-runtime && yarn test:language-repository && yarn test:language-coordinator && yarn test:language-build-hook && yarn test:language-main && yarn test:language-renderer && yarn test:language-fork && yarn test:language-vite-optimize && yarn test:language-bundle"
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
yarn test:language-vite-optimize
```

Expected: exit 0 with `language Vite optimization tests passed`.

- [ ] **Step 5: Run formatting, lint, and type checks for the changed surface**

Run:

```bash
npx prettier --check configs/element-plus-locales.ts configs/vite.config.ts scripts/language-vite-optimize-test.ts package.json
npx eslint configs/element-plus-locales.ts configs/vite.config.ts scripts/language-vite-optimize-test.ts
npx vue-tsc --noEmit
```

Expected: all three commands exit 0. Existing npm user-config warnings are acceptable; source diagnostics are not.

- [ ] **Step 6: Commit the tested fix**

```bash
git add configs/element-plus-locales.ts configs/vite.config.ts scripts/language-vite-optimize-test.ts package.json
git commit -m "fix: stabilize Vite locale dependency optimization"
```

### Task 3: Verify Lazy Loading, Production Chunks, and Development Runtime

**Files:**

- Verify: `configs/element-plus-locales.ts`
- Verify: `configs/vite.config.ts`
- Verify: `src/lang/render.ts`
- Verify: `dist/render/static/js/`

- [ ] **Step 1: Run all deterministic language and memory tests**

Run:

```bash
yarn test:language-lazy
yarn test:language-memory
```

Expected: all language tests pass. The memory benchmark must retain its current limits: optimized RSS at most 80 MiB, optimized heap at most 9 MiB, at least 15 MiB RSS saved, and at least 4 MiB heap saved against the eager fixture.

- [ ] **Step 2: Build the production renderer**

Run:

```bash
NODE_OPTIONS=--max-old-space-size=4096 npx tsx -e "import { build } from 'vite'; import config from './configs/vite.config'; (async () => { await build(config.buildConfig) })().catch((error) => { console.error(error); process.exitCode = 1 })"
```

Expected: Vite exits 0 and emits the main, tray, capturer, and locale chunks under `dist/render/static/js/`.

- [ ] **Step 3: Confirm production locale splitting remains lazy**

Run:

```bash
find dist/render/static/js -name 'element-plus-locale-*.js' | wc -l
yarn test:language-bundle
```

Expected: the first command reports `31`; the bundle audit exits 0. `optimizeDeps.include` must not collapse the production locale chunks because Vite ignores dependency optimization during Rollup builds.

- [ ] **Step 4: Restart the development session so the changed Vite config takes effect**

Stop the currently running `yarn dev` process with `Ctrl-C`, then run:

```bash
yarn dev
```

Expected: Vite starts on port 4000, rebuilds its optimizer cache because the configuration hash changed, and Electron opens the main window. Do not reuse the renderer page that originally loaded hash `df9e442c`.

- [ ] **Step 5: Verify one dependency hash and a healthy mounted UI**

In the main-window DevTools console, run:

```js
performance
  .getEntriesByType('resource')
  .map(({ name }) => name)
  .filter((name) => /\/deps\/(?:vue|pinia)\.js/.test(name))
```

Expected: one `vue.js?v=<vue-hash>` URL and one `pinia.js?v=<pinia-hash>` URL, with no second version of either dependency. The two per-dependency hashes may differ. Navigate between at least three modules whose sidebars are async components. The console must contain none of:

```text
getActivePinia()
resolveComponent can only be used in render() or setup()
Cannot read properties of undefined (reading 'el')
Unhandled error during execution of setup function
```

Before and after loading at least three previously inactive Element Plus locales, run:

```bash
node -e "const fs=require('node:fs'); const m=require('./node_modules/.vite/deps/_metadata.json'); console.log(JSON.stringify({browserHash:m.browserHash,mtime:fs.statSync('./node_modules/.vite/deps/_metadata.json').mtimeMs}))"
```

Expected: `browserHash` and `mtime` are identical before and after the lazy locale loads, proving Vite did not re-optimize dependencies while the renderer was mounted.

- [ ] **Step 6: Confirm the repository is clean and record the result**

Run:

```bash
git status --short --branch
git log -3 --oneline
```

Expected: no uncommitted paths. `master` contains the fix commit and the earlier design/temporary-artifact cleanup commits.
