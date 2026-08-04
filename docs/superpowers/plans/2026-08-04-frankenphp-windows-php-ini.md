# FrankenPHP Windows PHP Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Initialize a missing Windows FrankenPHP `php.ini` with bundled PHP extensions and expose the same editor from the FrankenPHP service list.

**Architecture:** Keep file creation idempotent and local to the FrankenPHP fork module. A small pure helper builds the Windows INI content from a template and an extension-existence predicate; the module calls it after install, before startup, and through `getIniPath` for the editor. The existing PHP drawer becomes parameterized so FrankenPHP can reuse it without changing PHP's default behavior.

**Tech Stack:** TypeScript, Electron fork IPC, Vue 3 SFCs, Monaco-based `Conf` editor, Node `assert/strict`, `tsx`.

---

### Task 1: Add the failing INI builder regression test

**Files:**

- Create: `scripts/frankenphp-php-ini-test.ts`
- Create: `src/fork/module/FrankenPHP/PhpIni.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the failing test and package command**

Create `scripts/frankenphp-php-ini-test.ts` with a pure content test:

```ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildWindowsPhpIni } from '../src/fork/module/FrankenPHP/PhpIni'

const template = ';extension_dir = "ext"\r\n[PHP]\r\n'
const content = buildWindowsPhpIni(template, (name) =>
  ['php_curl.dll', 'php_xdebug.dll'].includes(name)
)

assert.match(content, /^extension_dir = "ext"$/m)
assert.match(content, /extension=php_curl\.dll/)
assert.match(content, /zend_extension=php_xdebug\.dll/)
assert.doesNotMatch(content, /extension=php_gd\.dll/)
assert.match(content, /\[PHP\]/)

console.log('frankenphp-php-ini-test: ok')
```

Add this script entry near the other focused checks in `package.json`:

```json
"test:frankenphp-php-ini": "tsx scripts/frankenphp-php-ini-test.ts"
```

- [ ] **Step 2: Run the new test before implementation**

Run: `yarn test:frankenphp-php-ini`

Expected: FAIL because `PhpIni.ts` does not exist yet.

- [ ] **Step 3: Commit the red test**

```bash
git add scripts/frankenphp-php-ini-test.ts package.json
git commit -m "test: cover FrankenPHP Windows php.ini flow"
```

### Task 2: Implement the pure Windows INI builder

**Files:**

- Create: `src/fork/module/FrankenPHP/PhpIni.ts`
- Test: `scripts/frankenphp-php-ini-test.ts`

- [ ] **Step 1: Define the Windows PHP extension candidates**

In `PhpIni.ts`, export the same candidate set used by `src/fork/module/Php.win/index.ts`, preserving `zend_extension` for Xdebug:

```ts
export const WINDOWS_PHP_EXTENSIONS = [
  { name: 'php_redis.dll', type: 'extension' },
  { name: 'php_xdebug.dll', type: 'zend_extension' },
  { name: 'php_mongodb.dll', type: 'extension' },
  { name: 'php_memcache.dll', type: 'extension' },
  { name: 'php_pdo_sqlsrv.dll', type: 'extension' },
  { name: 'php_openssl.dll', type: 'extension' },
  { name: 'php_curl.dll', type: 'extension' },
  { name: 'php_gd.dll', type: 'extension' },
  { name: 'php_fileinfo.dll', type: 'extension' },
  { name: 'php_zip.dll', type: 'extension' },
  { name: 'php_mbstring.dll', type: 'extension' },
  { name: 'php_mysqli.dll', type: 'extension' },
  { name: 'php_pdo_mysql.dll', type: 'extension' },
  { name: 'php_pdo_odbc.dll', type: 'extension' },
  { name: 'php_intl.dll', type: 'extension' },
  { name: 'php_exif.dll', type: 'extension' },
  { name: 'php_simplexml.dll', type: 'extension' },
  { name: 'php_xml.dll', type: 'extension' },
  { name: 'php_dom.dll', type: 'extension' },
  { name: 'php_xmlreader.dll', type: 'extension' },
  { name: 'php_xmlwriter.dll', type: 'extension' },
  { name: 'php_json.dll', type: 'extension' },
  { name: 'php_bcmath.dll', type: 'extension' },
  { name: 'php_sodium.dll', type: 'extension' },
  { name: 'php_soap.dll', type: 'extension' },
  { name: 'php_ldap.dll', type: 'extension' },
  { name: 'php_imap.dll', type: 'extension' },
  { name: 'php_sockets.dll', type: 'extension' },
  { name: 'php_pdo_pgsql.dll', type: 'extension' },
  { name: 'php_pdo_sqlite.dll', type: 'extension' },
  { name: 'php_sqlite3.dll', type: 'extension' },
  { name: 'php_iconv.dll', type: 'extension' },
  { name: 'php_ftp.dll', type: 'extension' },
  { name: 'php_gettext.dll', type: 'extension' },
  { name: 'php_shmop.dll', type: 'extension' }
] as const
```

- [ ] **Step 2: Implement deterministic template transformation**

Add the following implementation below the candidate constant. It replaces or appends `extension_dir = "ext"`, filters candidates through `extensionExists`, and appends one enabled line only when that exact line is not already present in the template:

```ts
type ExtensionExists = (name: string) => boolean

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export const buildWindowsPhpIni = (content: string, extensionExists: ExtensionExists): string => {
  const extensionDir = /^\s*;?\s*extension_dir\s*=\s*"ext"\s*$/m
  let result = extensionDir.test(content)
    ? content.replace(extensionDir, 'extension_dir = "ext"')
    : `${content.trimEnd()}\n\nextension_dir = "ext"\n`

  const enabled = WINDOWS_PHP_EXTENSIONS.filter(({ name }) => extensionExists(name)).filter(
    ({ name, type }) => {
      const line = new RegExp(`^\\s*${type}\\s*=\\s*${escapeRegExp(name)}\\s*$`, 'm')
      return !line.test(result)
    }
  )
  if (enabled.length > 0) {
    result = `${result.trimEnd()}\n\n${enabled.map(({ name, type }) => `${type}=${name}`).join('\n')}\n`
  }
  return `${result.trimEnd()}\n`
}
```

- [ ] **Step 3: Run the pure builder test**

Run: `yarn test:frankenphp-php-ini`

Expected output: `frankenphp-php-ini-test: ok`.

- [ ] **Step 4: Commit the helper**

```bash
git add src/fork/module/FrankenPHP/PhpIni.ts scripts/frankenphp-php-ini-test.ts
git commit -m "feat: build FrankenPHP Windows php.ini content"
```

### Task 3: Integrate idempotent initialization into the FrankenPHP fork module

**Files:**

- Modify: `src/fork/module/FrankenPHP/index.ts`
- Test: `scripts/frankenphp-php-ini-test.ts`

- [ ] **Step 1: Extend the regression test with backend lifecycle assertions**

Append this code before the final `console.log` in `scripts/frankenphp-php-ini-test.ts`:

```ts
const root = join(import.meta.dirname, '..')
const moduleSource = readFileSync(join(root, 'src/fork/module/FrankenPHP/index.ts'), 'utf8')

assert.match(moduleSource, /ensureWindowsPhpIni/)
assert.match(moduleSource, /this\.ensureWindowsPhpIni\(row\.appDir\)/)
assert.match(moduleSource, /this\.ensureWindowsPhpIni\(version\.path\)/)
assert.match(moduleSource, /getIniPath\(version: SoftInstalled\)/)
```

- [ ] **Step 2: Run the backend lifecycle regression before implementation**

Run: `yarn test:frankenphp-php-ini`

Expected: FAIL because the FrankenPHP module does not yet have the initializer or its install/start/editor call sites.

- [ ] **Step 3: Add the filesystem initializer**

Add this import beside the other FrankenPHP module imports:

```ts
import { buildWindowsPhpIni } from './PhpIni'
```

Add this private method to the `FrankenPHP` class:

```ts
private async ensureWindowsPhpIni(versionPath: string): Promise<string> {
  const ini = join(versionPath, 'php.ini')
  if (!isWindows() || existsSync(ini)) {
    return ini
  }

  const development = join(versionPath, 'php.ini-development')
  const production = join(versionPath, 'php.ini-production')
  const template = existsSync(development) ? development : production
  if (!existsSync(template)) {
    throw new Error(I18nT('common.error.phpiniNotFound'))
  }

  const content = buildWindowsPhpIni(
    await readFile(template, 'utf-8'),
    (name) => existsSync(join(versionPath, 'ext', name))
  )
  await writeFile(ini, content)
  await writeFile(join(versionPath, 'php.ini.default'), content)
  return ini
}
```

- [ ] **Step 4: Initialize immediately after Windows extraction**

Replace the Windows branch of `_installSoftHandle` with this code, leaving the non-Windows copy/chmod branch unchanged:

```ts
if (isWindows()) {
  await zipUnpack(row.zip, row.appDir)
  await this.ensureWindowsPhpIni(row.appDir)
} else {
  const dir = row.appDir
  await mkdirp(dir)
  await copyFile(row.zip, row.bin)
  await chmod(row.bin, '0755')
  if (isMacOS()) {
    await binXattrFix(row.bin)
  }
}
```

- [ ] **Step 5: Initialize before service startup**

At the beginning of the `_startServer` fork executor, before `fixVHost()` and before the FrankenPHP process is spawned, add this guarded initialization:

```ts
try {
  await this.ensureWindowsPhpIni(version.path)
} catch (error) {
  reject(error)
  return
}

await fixVHost()
```

Keep the existing startup logic after this call unchanged.

- [ ] **Step 6: Expose the same flow through `getIniPath`**

Add a public method returning `ForkPromise<string>`:

```ts
getIniPath(version: SoftInstalled): ForkPromise<string> {
  return new ForkPromise(async (resolve, reject) => {
    try {
      resolve(await this.ensureWindowsPhpIni(version.path))
    } catch (error) {
      reject(error)
    }
  })
}
```

- [ ] **Step 7: Run the lifecycle assertions**

Run: `yarn test:frankenphp-php-ini`

Expected output: `frankenphp-php-ini-test: ok`.

- [ ] **Step 8: Commit the fork integration**

```bash
git add src/fork/module/FrankenPHP/index.ts scripts/frankenphp-php-ini-test.ts
git commit -m "feat: initialize FrankenPHP php.ini across lifecycle"
```

### Task 4: Reuse the PHP drawer and add FrankenPHP service actions

**Files:**

- Modify: `src/render/components/PHP/Config.vue`
- Create: `src/render/components/FrankenPHP/VersionActions.vue`
- Modify: `src/render/components/FrankenPHP/Index.vue`
- Test: `scripts/frankenphp-php-ini-test.ts`

- [ ] **Step 1: Extend the regression test with renderer assertions**

Append this code before the final `console.log` in `scripts/frankenphp-php-ini-test.ts`:

```ts
const phpConfigSource = readFileSync(join(root, 'src/render/components/PHP/Config.vue'), 'utf8')
const frankenPageSource = readFileSync(
  join(root, 'src/render/components/FrankenPHP/Index.vue'),
  'utf8'
)
const frankenActionsSource = readFileSync(
  join(root, 'src/render/components/FrankenPHP/VersionActions.vue'),
  'utf8'
)

assert.match(phpConfigSource, /typeFlag\??:.*frankenphp/)
assert.match(phpConfigSource, /app-fork:\$\{.*typeFlag/)
assert.match(frankenPageSource, /#action/)
assert.match(frankenPageSource, /VersionActions/)
assert.match(frankenActionsSource, /typeFlag: 'frankenphp'/)
assert.match(frankenActionsSource, /window\.Server\.isWindows/)
```

- [ ] **Step 2: Run the renderer regression before implementation**

Run: `yarn test:frankenphp-php-ini`

Expected: FAIL because the reusable drawer routing and FrankenPHP action component do not yet exist.

- [ ] **Step 3: Parameterize the PHP drawer without changing its default**

Replace the props declaration with an optional module type that defaults to PHP:

```ts
const props = withDefaults(
  defineProps<{
    version: SoftInstalled
    typeFlag?: 'php' | 'frankenphp'
  }>(),
  {
    typeFlag: 'php'
  }
)
```

Add a namespaced cache key after the existing `flag` computed value, then use it for both reads and writes of `ConfStore.phpIniFiles`:

```ts
const iniCacheKey = computed(() => `${props.typeFlag}:${flag.value}`)

const cached = ConfStore.phpIniFiles?.[iniCacheKey.value]

ConfStore.phpIniFiles[iniCacheKey.value] = res.data
```

Change the INI request and `Conf` binding to route through the prop:

```ts
IPC.send(`app-fork:${props.typeFlag}`, 'getIniPath', JSON.parse(JSON.stringify(props.version)))
```

```vue
<Conf :type-flag="typeFlag" />
```

Keep the remaining drawer settings and existing PHP call sites unchanged.

- [ ] **Step 4: Create the FrankenPHP action menu**

Create `FrankenPHP/VersionActions.vue` with the following content:

```vue
<template>
  <li @click.stop="action('open')">
    <yb-icon :svg="import('@/svg/folder.svg?raw')" width="17" height="17" />
    <span class="ml-3">{{ I18nT('base.open') }}</span>
  </li>
  <li v-if="isWindows" @click.stop="action('conf')">
    <yb-icon :svg="import('@/svg/config.svg?raw')" width="17" height="17" />
    <span class="ml-3">{{ I18nT('php.editPhpIni') }}</span>
  </li>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import type { SoftInstalled } from '@/store/brew'
  import { I18nT } from '@lang/index'
  import { AsyncComponentShow } from '@/util/AsyncComponent'
  import { shell } from '@/util/NodeFn'

  const props = defineProps<{
    item: SoftInstalled
  }>()

  const isWindows = computed(() => window.Server.isWindows)

  let ConfVM: any
  import('@/components/PHP/Config.vue').then((res) => {
    ConfVM = res.default
  })

  const action = (flag: 'open' | 'conf') => {
    if (flag === 'open') {
      shell.openPath(props.item.path)
      return
    }
    AsyncComponentShow(ConfVM, {
      version: props.item,
      typeFlag: 'frankenphp'
    }).then()
  }
</script>
```

This keeps directory opening available everywhere and hides only the edit item when `window.Server.isWindows` is false.

- [ ] **Step 5: Attach the action menu to FrankenPHP's service table**

In `FrankenPHP/Index.vue`, add this slot inside the existing `Service` component:

```vue
<template #action="{ row }">
  <VersionActions :item="row" />
</template>
```

Add the corresponding import:

```ts
import VersionActions from './VersionActions.vue'
```

Do not alter the existing PHP/Caddy columns or tabs.

- [ ] **Step 6: Run the renderer assertions**

Run: `yarn test:frankenphp-php-ini`

Expected: all helper, backend lifecycle, reusable drawer, and FrankenPHP action assertions pass.

- [ ] **Step 7: Commit the renderer integration**

```bash
git add src/render/components/PHP/Config.vue src/render/components/FrankenPHP/VersionActions.vue src/render/components/FrankenPHP/Index.vue scripts/frankenphp-php-ini-test.ts
git commit -m "feat: edit FrankenPHP php.ini from service list"
```

### Task 5: Run final verification and inspect the change

**Files:**

- Verify: `src/fork/module/FrankenPHP/PhpIni.ts`
- Verify: `src/fork/module/FrankenPHP/index.ts`
- Verify: `src/render/components/PHP/Config.vue`
- Verify: `src/render/components/FrankenPHP/VersionActions.vue`
- Verify: `src/render/components/FrankenPHP/Index.vue`
- Verify: `scripts/frankenphp-php-ini-test.ts`

- [ ] **Step 1: Run focused regression**

Run: `yarn test:frankenphp-php-ini`

Expected output: `frankenphp-php-ini-test: ok`.

- [ ] **Step 2: Run formatting and lint checks**

Run: `git diff --check`

Expected: no output and exit code 0.

Run: `yarn eslint src/fork/module/FrankenPHP/PhpIni.ts src/fork/module/FrankenPHP/index.ts src/render/components/PHP/Config.vue src/render/components/FrankenPHP/VersionActions.vue src/render/components/FrankenPHP/Index.vue scripts/frankenphp-php-ini-test.ts`

Expected: exit code 0 with no lint errors.

- [ ] **Step 3: Run the renderer type check**

Run: `yarn vue-tsc --noEmit`

Expected: exit code 0. If unrelated pre-existing diagnostics appear, record them separately and confirm the changed files introduce no new diagnostics.

- [ ] **Step 4: Review the final diff and status**

Run: `git log -5 --oneline --stat`

Expected: the recent commits cover the focused test, PHP INI helper, FrankenPHP lifecycle integration, renderer action, and design/plan documentation.

Run: `git status --short`

Expected: clean working tree.
