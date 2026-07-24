# Go GVM Version Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a macOS/Linux-only GVM page to the Go module with GVM installation, version discovery, binary installation, uninstall, default selection, and FlyEnv installed-version discovery.

**Architecture:** Keep GVM as a dedicated Go page, matching Rustup's module-specific workflow. Put CLI text parsing in a pure shared module, filesystem and command execution in a focused GoLang fork helper, and terminal command construction in pure renderer helpers so all non-UI behavior is directly testable.

**Tech Stack:** TypeScript 5.8, Vue 3 Composition API, Pinia, Electron IPC, Node.js child processes/filesystem, Element Plus, XTerm, script-based tests with `tsx` and `node:assert`.

---

## File Structure

- Create `src/shared/Gvm.ts`: safe GVM identifier parsing, available/installed list parsing, merge logic, and POSIX shell quoting.
- Create `src/fork/module/GoLang/gvm.ts`: GVM root resolution, `gos` directory discovery, and injectable execution of `gvm listall`/`gvm list`.
- Modify `src/fork/module/GoLang/index.ts`: expose `checkGvm` and `gvmData`, and include GVM installations in Go discovery.
- Create `src/render/components/GoLang/gvm/command.ts`: validated installer and version-operation command builders.
- Create `src/render/components/GoLang/gvm/setup.ts`: reactive IPC, terminal, refresh, and task state.
- Create `src/render/components/GoLang/gvm/index.vue`: the GVM card, search, status columns, actions, and terminal state.
- Create `src/render/components/GoLang/tabs.ts`: append GVM without changing existing tab indexes.
- Modify `src/render/components/GoLang/Index.vue`: render the appended GVM page only on non-Windows systems.
- Create `scripts/go-gvm-test.ts`: behavioral tests for parsers, helpers, commands, platform tab behavior, and source-level integration contracts.
- Modify `package.json`: add the focused `test:go-gvm` command.

### Task 1: Parse and merge GVM version output safely

**Files:**
- Create: `scripts/go-gvm-test.ts`
- Create: `src/shared/Gvm.ts`
- Modify: `package.json`

- [ ] **Step 1: Add the focused test command and failing parser tests**

Add this script to `package.json`:

```json
"test:go-gvm": "tsx scripts/go-gvm-test.ts"
```

Create `scripts/go-gvm-test.ts` with the first behavior block:

```ts
import assert from 'node:assert/strict'
import {
  isGvmVersionIdentifier,
  mergeGvmVersionData,
  parseGvmAvailableVersions,
  parseGvmInstalledVersions,
  quotePosixShell
} from '../src/shared/Gvm'

const availableOutput = `
gvm gos (available)

   go1.24.4
   go1.24.5
   release.r60.3
   weekly.2012-03-13
   go1.24.5;touch /tmp/not-allowed
`

assert.deepEqual(parseGvmAvailableVersions(availableOutput), [
  'go1.24.4',
  'go1.24.5',
  'release.r60.3',
  'weekly.2012-03-13'
])

const installedOutput = `
gvm gos (installed)

   go1.23.9
=> go1.24.5
`

assert.deepEqual(parseGvmInstalledVersions(installedOutput), [
  { name: 'go1.23.9', isDefault: false },
  { name: 'go1.24.5', isDefault: true }
])

assert.deepEqual(mergeGvmVersionData(availableOutput, installedOutput), [
  { name: 'go1.24.4', version: '1.24.4', installed: false, isDefault: false },
  { name: 'go1.24.5', version: '1.24.5', installed: true, isDefault: true },
  {
    name: 'release.r60.3',
    version: 'release.r60.3',
    installed: false,
    isDefault: false
  },
  {
    name: 'weekly.2012-03-13',
    version: 'weekly.2012-03-13',
    installed: false,
    isDefault: false
  },
  { name: 'go1.23.9', version: '1.23.9', installed: true, isDefault: false }
])

assert.equal(isGvmVersionIdentifier('go1.24.5'), true)
assert.equal(isGvmVersionIdentifier('release.r60.3'), true)
assert.equal(isGvmVersionIdentifier('weekly.2012-03-13'), true)
assert.equal(isGvmVersionIdentifier('gvm'), false)
assert.equal(isGvmVersionIdentifier('go1.24.5;rm'), false)
assert.equal(quotePosixShell("/Users/Test O'Neil/.gvm/scripts/gvm"), "'/Users/Test O'\\''Neil/.gvm/scripts/gvm'")

console.log('go gvm tests passed')
```

- [ ] **Step 2: Run the test and verify the red state**

Run:

```bash
yarn test:go-gvm
```

Expected: FAIL because `src/shared/Gvm.ts` does not exist.

- [ ] **Step 3: Implement the pure parser and merge model**

Create `src/shared/Gvm.ts`:

```ts
export type GvmVersionItem = {
  name: string
  version: string
  installed: boolean
  isDefault: boolean
}

export type GvmInstalledVersion = {
  name: string
  isDefault: boolean
}

const GVM_VERSION_PATTERN =
  /^(?:go[A-Za-z0-9._-]*|release\.[A-Za-z0-9._-]+|weekly\.[A-Za-z0-9._-]+)$/

export function isGvmVersionIdentifier(value: string): boolean {
  return GVM_VERSION_PATTERN.test(value)
}

function parseGvmLine(line: string): GvmInstalledVersion | undefined {
  const trimmed = line.trim()
  const isDefault = trimmed.startsWith('=>')
  const normalized = trimmed.replace(/^=>\s*/, '').trim()
  const name = normalized.split(/\s+/)[0] ?? ''
  if (!isGvmVersionIdentifier(name)) {
    return undefined
  }
  return { name, isDefault }
}

export function parseGvmAvailableVersions(output: string): string[] {
  return Array.from(
    new Set(
      output
        .split(/\r?\n/)
        .map((line) => parseGvmLine(line)?.name)
        .filter((name): name is string => !!name)
    )
  )
}

export function parseGvmInstalledVersions(output: string): GvmInstalledVersion[] {
  const versions = new Map<string, GvmInstalledVersion>()
  output
    .split(/\r?\n/)
    .map(parseGvmLine)
    .filter((item): item is GvmInstalledVersion => !!item)
    .forEach((item) => versions.set(item.name, item))
  return Array.from(versions.values())
}

function displayVersion(name: string): string {
  return name.startsWith('go') ? name.slice(2) : name
}

export function mergeGvmVersionData(
  availableOutput: string,
  installedOutput: string
): GvmVersionItem[] {
  const installed = new Map(
    parseGvmInstalledVersions(installedOutput).map((item) => [item.name, item])
  )
  const names = [...parseGvmAvailableVersions(availableOutput)]
  installed.forEach((_item, name) => {
    if (!names.includes(name)) {
      names.push(name)
    }
  })
  return names.map((name) => ({
    name,
    version: displayVersion(name),
    installed: installed.has(name),
    isDefault: installed.get(name)?.isDefault ?? false
  }))
}

export function quotePosixShell(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`
}
```

- [ ] **Step 4: Run the focused test and verify green**

Run:

```bash
yarn test:go-gvm
```

Expected: PASS and print `go gvm tests passed`.

- [ ] **Step 5: Commit the parser slice**

```bash
git add package.json scripts/go-gvm-test.ts src/shared/Gvm.ts
git commit -m "feat: parse GVM version output"
```

### Task 2: Add fork-side GVM discovery and IPC data

**Files:**
- Create: `src/fork/module/GoLang/gvm.ts`
- Modify: `src/fork/module/GoLang/index.ts`
- Modify: `scripts/go-gvm-test.ts`

- [ ] **Step 1: Extend the focused test with fork-helper behavior**

Add these imports to `scripts/go-gvm-test.ts`:

```ts
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  fetchGvmVersionData,
  findGvmGoDirectories,
  gvmInitScript,
  resolveGvmRoot
} from '../src/fork/module/GoLang/gvm'
```

Insert this block before the final `console.log`:

```ts
assert.equal(resolveGvmRoot(' /custom/gvm ', '/Users/test'), '/custom/gvm')
assert.equal(resolveGvmRoot('', '/Users/test'), '/Users/test/.gvm')
assert.equal(gvmInitScript('/Users/test/.gvm'), '/Users/test/.gvm/scripts/gvm')

const temporaryHome = await mkdtemp(join(tmpdir(), 'flyenv-go-gvm-'))
try {
  const gvmRoot = join(temporaryHome, '.gvm')
  await mkdir(join(gvmRoot, 'gos', 'go1.23.9'), { recursive: true })
  await mkdir(join(gvmRoot, 'gos', 'go1.24.5'), { recursive: true })
  assert.deepEqual(await findGvmGoDirectories(gvmRoot), [
    join(gvmRoot, 'gos', 'go1.23.9'),
    join(gvmRoot, 'gos', 'go1.24.5')
  ])
  assert.deepEqual(await findGvmGoDirectories(join(temporaryHome, 'missing')), [])
} finally {
  await rm(temporaryHome, { recursive: true, force: true })
}

const gvmCommands: string[] = []
const gvmData = await fetchGvmVersionData(
  "/Users/Test O'Neil/.gvm/scripts/gvm",
  async (command) => {
    gvmCommands.push(command)
    return {
      stdout: command.endsWith('gvm listall')
        ? 'gvm gos (available)\n   go1.24.5\n'
        : 'gvm gos (installed)\n=> go1.24.5\n'
    }
  }
)
assert.deepEqual(gvmCommands, [
  "source '/Users/Test O'\\''Neil/.gvm/scripts/gvm' && gvm listall",
  "source '/Users/Test O'\\''Neil/.gvm/scripts/gvm' && gvm list"
])
assert.deepEqual(gvmData, [
  { name: 'go1.24.5', version: '1.24.5', installed: true, isDefault: true }
])

const goLangSource = readFileSync('src/fork/module/GoLang/index.ts', 'utf8')
assert.match(goLangSource, /findGvmGoDirectories/)
assert.match(goLangSource, /checkGvm\(\)/)
assert.match(goLangSource, /gvmData\(\)/)
assert.match(goLangSource, /fetchGvmVersionData/)
```

- [ ] **Step 2: Run the test and verify the missing helper failure**

Run:

```bash
yarn test:go-gvm
```

Expected: FAIL because `src/fork/module/GoLang/gvm.ts` does not exist.

- [ ] **Step 3: Implement fork-side GVM helpers**

Create `src/fork/module/GoLang/gvm.ts`:

```ts
import { existsSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { execPromiseWithEnv } from '@shared/child-process'
import { mergeGvmVersionData, quotePosixShell, type GvmVersionItem } from '@shared/Gvm'

type GvmCommandResult = { stdout: string }
type GvmCommandRunner = (command: string) => Promise<GvmCommandResult>

export function resolveGvmRoot(environmentRoot: string | undefined, userHome: string): string {
  const configured = `${environmentRoot ?? ''}`.trim()
  return configured || join(userHome, '.gvm')
}

export function gvmInitScript(gvmRoot: string): string {
  return join(gvmRoot, 'scripts', 'gvm')
}

export function hasGvm(gvmRoot: string): boolean {
  return existsSync(gvmInitScript(gvmRoot))
}

export async function findGvmGoDirectories(gvmRoot: string): Promise<string[]> {
  const gosDirectory = join(gvmRoot, 'gos')
  try {
    const entries = await readdir(gosDirectory, { withFileTypes: true })
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(gosDirectory, entry.name))
      .sort()
  } catch {
    return []
  }
}

const runGvmCommand: GvmCommandRunner = (command) =>
  execPromiseWithEnv(command, { shell: '/bin/bash' })

export async function fetchGvmVersionData(
  initScript: string,
  run: GvmCommandRunner = runGvmCommand
): Promise<GvmVersionItem[]> {
  const init = `source ${quotePosixShell(initScript)}`
  const [available, installed] = await Promise.all([
    run(`${init} && gvm listall`),
    run(`${init} && gvm list`)
  ])
  return mergeGvmVersionData(available.stdout, installed.stdout)
}
```

- [ ] **Step 4: Wire the GoLang fork module**

Update imports in `src/fork/module/GoLang/index.ts` to include `homedir` and the five GVM helpers:

```ts
import { homedir } from 'node:os'
import {
  fetchGvmVersionData,
  findGvmGoDirectories,
  gvmInitScript,
  hasGvm,
  resolveGvmRoot
} from './gvm'
```

Add this private resolver and the two IPC methods to the `GoLang` class:

```ts
private gvmRoot(): string {
  return resolveGvmRoot(process.env.GVM_ROOT, global.Server.UserHome ?? homedir())
}

checkGvm() {
  return new ForkPromise(async (resolve) => {
    const root = this.gvmRoot()
    resolve(hasGvm(root) ? gvmInitScript(root) : null)
  })
}

gvmData() {
  return new ForkPromise(async (resolve) => {
    const root = this.gvmRoot()
    if (!hasGvm(root)) {
      resolve([])
      return
    }
    try {
      resolve(await fetchGvmVersionData(gvmInitScript(root)))
    } catch {
      resolve([])
    }
  })
}
```

Change `allInstalledVersions` to use an async executor and add GVM directories only on supported platforms:

```ts
allInstalledVersions(setup: any) {
  return new ForkPromise(async (resolve) => {
    let versions: SoftInstalled[] = []
    let all: Promise<SoftInstalled[]>[] = []
    const customDirs = [...(setup?.golang?.dirs ?? [])]
    if (!isWindows()) {
      customDirs.push(...(await findGvmGoDirectories(this.gvmRoot())))
    }
    if (isWindows()) {
      all = [versionLocalFetch(customDirs, 'go.exe')]
    } else {
      all = [versionLocalFetch(customDirs, 'gofmt', 'go')]
    }
    Promise.all(all)
      .then(async (list) => {
        versions = list.flat()
        versions = versionFilterSame(versions)
        const all = versions.map((item) => {
          let bin = item.bin
          if (!isWindows()) {
            bin = join(dirname(item.bin), 'go')
          }
          const command = `"${bin}" version`
          const reg = /( go)(.*?)( )/g
          return TaskQueue.run(versionBinVersion, bin, command, reg)
        })
        return Promise.all(all)
      })
      .then((list) => {
        list.forEach((v, i) => {
          const { error, version } = v
          const num = version
            ? Number(versionFixed(version).split('.').slice(0, 2).join(''))
            : null
          Object.assign(versions[i], {
            version: version,
            num,
            enable: version !== null,
            error
          })
        })
        resolve(versionSort(versions))
      })
      .catch(() => {
        resolve([])
      })
  })
}
```

- [ ] **Step 5: Run the focused test and verify green**

Run:

```bash
yarn test:go-gvm
```

Expected: PASS and print `go gvm tests passed`.

- [ ] **Step 6: Commit the fork slice**

```bash
git add scripts/go-gvm-test.ts src/fork/module/GoLang/gvm.ts src/fork/module/GoLang/index.ts
git commit -m "feat: expose GVM Go versions from fork"
```

### Task 3: Build validated renderer commands and platform tabs

**Files:**
- Create: `src/render/components/GoLang/gvm/command.ts`
- Create: `src/render/components/GoLang/tabs.ts`
- Modify: `scripts/go-gvm-test.ts`

- [ ] **Step 1: Add failing command and tab behavior tests**

Add these imports to `scripts/go-gvm-test.ts`:

```ts
import {
  GVM_INSTALL_COMMAND,
  buildGvmVersionCommand
} from '../src/render/components/GoLang/gvm/command'
import { appendGvmTab } from '../src/render/components/GoLang/tabs'
```

Insert this block before the source contract and final log:

```ts
assert.equal(
  GVM_INSTALL_COMMAND,
  'bash < <(curl -sSL https://raw.githubusercontent.com/moovweb/gvm/master/binscripts/gvm-installer)'
)
assert.equal(
  buildGvmVersionCommand('/Users/test/.gvm/scripts/gvm', 'install', 'go1.24.5'),
  "source '/Users/test/.gvm/scripts/gvm' && gvm install go1.24.5 -B"
)
assert.equal(
  buildGvmVersionCommand('/Users/test/.gvm/scripts/gvm', 'uninstall', 'go1.23.9'),
  "source '/Users/test/.gvm/scripts/gvm' && gvm uninstall go1.23.9"
)
assert.equal(
  buildGvmVersionCommand('/Users/test/.gvm/scripts/gvm', 'default', 'go1.24.5'),
  "source '/Users/test/.gvm/scripts/gvm' && gvm use go1.24.5 --default"
)
assert.throws(
  () => buildGvmVersionCommand('/Users/test/.gvm/scripts/gvm', 'install', 'go1.24;rm'),
  /Invalid GVM version/
)

const baseTabs = ['projects', 'service', 'versions', 'new-project']
assert.deepEqual(appendGvmTab(baseTabs, true), baseTabs)
assert.deepEqual(appendGvmTab(baseTabs, false), [...baseTabs, 'GVM'])
assert.deepEqual(baseTabs, ['projects', 'service', 'versions', 'new-project'])
```

- [ ] **Step 2: Run the test and verify red**

Run:

```bash
yarn test:go-gvm
```

Expected: FAIL because the renderer command and tab modules do not exist.

- [ ] **Step 3: Implement command construction**

Create `src/render/components/GoLang/gvm/command.ts`:

```ts
import { isGvmVersionIdentifier, quotePosixShell } from '@shared/Gvm'

export type GvmVersionAction = 'install' | 'uninstall' | 'default'

export const GVM_INSTALL_COMMAND =
  'bash < <(curl -sSL https://raw.githubusercontent.com/moovweb/gvm/master/binscripts/gvm-installer)'

export function buildGvmVersionCommand(
  initScript: string,
  action: GvmVersionAction,
  version: string
): string {
  if (!isGvmVersionIdentifier(version)) {
    throw new Error(`Invalid GVM version: ${version}`)
  }
  const init = `source ${quotePosixShell(initScript)}`
  if (action === 'install') {
    return `${init} && gvm install ${version} -B`
  }
  if (action === 'uninstall') {
    return `${init} && gvm uninstall ${version}`
  }
  return `${init} && gvm use ${version} --default`
}
```

- [ ] **Step 4: Implement non-mutating platform tab selection**

Create `src/render/components/GoLang/tabs.ts`:

```ts
export function appendGvmTab(tabs: string[], isWindows: boolean): string[] {
  return isWindows ? [...tabs] : [...tabs, 'GVM']
}
```

- [ ] **Step 5: Run the focused test and verify green**

Run:

```bash
yarn test:go-gvm
```

Expected: PASS and print `go gvm tests passed`.

- [ ] **Step 6: Commit the renderer helpers**

```bash
git add scripts/go-gvm-test.ts src/render/components/GoLang/gvm/command.ts src/render/components/GoLang/tabs.ts
git commit -m "feat: build safe GVM renderer commands"
```

### Task 4: Add the GVM renderer state and page

**Files:**
- Create: `src/render/components/GoLang/gvm/setup.ts`
- Create: `src/render/components/GoLang/gvm/index.vue`
- Modify: `src/render/components/GoLang/Index.vue`
- Modify: `scripts/go-gvm-test.ts`

- [ ] **Step 1: Add failing renderer integration contracts**

Add this block before the final log in `scripts/go-gvm-test.ts`:

```ts
const goIndexSource = readFileSync('src/render/components/GoLang/Index.vue', 'utf8')
assert.match(goIndexSource, /<GvmVM v-else-if="tab === 4" \/>/)
assert.match(goIndexSource, /import GvmVM from '\.\/gvm\/index\.vue'/)
assert.match(goIndexSource, /appendGvmTab\(/)
assert.match(goIndexSource, /window\.Server\.isWindows/)

const gvmSetupSource = readFileSync('src/render/components/GoLang/gvm/setup.ts', 'utf8')
assert.match(gvmSetupSource, /IPC\.send\('app-fork:golang', 'checkGvm'\)/)
assert.match(gvmSetupSource, /IPC\.send\('app-fork:golang', 'gvmData'\)/)
assert.match(gvmSetupSource, /buildGvmVersionCommand/)
assert.match(gvmSetupSource, /GVM_INSTALL_COMMAND/)
assert.match(gvmSetupSource, /module\.installedFetched = false/)

const gvmPageSource = readFileSync('src/render/components/GoLang/gvm/index.vue', 'utf8')
assert.match(gvmPageSource, /GvmSetup\.installGvm/)
assert.match(gvmPageSource, /GvmSetup\.versionAction/)
assert.match(gvmPageSource, /setVersionDefault/)
assert.match(gvmPageSource, /scope\.row\.installed && !scope\.row\.isDefault/)
```

- [ ] **Step 2: Run the test and verify red**

Run:

```bash
yarn test:go-gvm
```

Expected: FAIL because `gvm/setup.ts` and `gvm/index.vue` do not exist and GoLang has no GVM tab.

- [ ] **Step 3: Implement reactive GVM state and terminal actions**

Create `src/render/components/GoLang/gvm/setup.ts` with this state contract and behavior:

```ts
import { nextTick, reactive } from 'vue'
import type { GvmVersionItem } from '@shared/Gvm'
import { AppStore } from '@/store/app'
import { BrewStore } from '@/store/brew'
import IPC from '@/util/IPC'
import XTerm from '@/util/XTerm'
import {
  GVM_INSTALL_COMMAND,
  buildGvmVersionCommand,
  type GvmVersionAction
} from './command'

async function mountAndRun(commands: string[], xtermDom: HTMLElement): Promise<void> {
  const params: string[] = []
  const proxy = AppStore().config.setup?.proxy?.proxy
  if (proxy) {
    params.push(proxy)
  }
  params.push(...commands)
  await nextTick()
  const xterm = new XTerm()
  GvmSetup.xterm = xterm
  await xterm.mount(xtermDom)
  await xterm.send(params)
}

async function refreshInstalledVersions(): Promise<void> {
  const module = BrewStore().module('golang')
  module.installedFetched = false
  await module.fetchInstalled()
}

export const GvmSetup = reactive<{
  initScript: string
  searchKey: string
  versions: GvmVersionItem[]
  installEnd: boolean
  installing: boolean
  installed?: boolean
  fetching: boolean
  xterm: XTerm | undefined
  checkGvm: () => void
  fetchData: () => void
  installGvm: (xtermDom: HTMLElement) => Promise<void>
  versionAction: (
    item: GvmVersionItem,
    action: GvmVersionAction,
    xtermDom: HTMLElement
  ) => Promise<void>
}>({
  initScript: '',
  searchKey: '',
  versions: [],
  installEnd: false,
  installing: false,
  installed: undefined,
  fetching: false,
  xterm: undefined,
  checkGvm() {
    IPC.send('app-fork:golang', 'checkGvm')
      .then((key: string, res) => {
        IPC.off(key)
        GvmSetup.initScript = res?.data ?? ''
        GvmSetup.installed = !!GvmSetup.initScript
        if (GvmSetup.installed) {
          GvmSetup.fetchData()
        }
      })
      .catch(() => {
        GvmSetup.installed = false
      })
  },
  fetchData() {
    if (!GvmSetup.installed || GvmSetup.fetching) {
      return
    }
    GvmSetup.fetching = true
    IPC.send('app-fork:golang', 'gvmData')
      .then((key: string, res) => {
        IPC.off(key)
        GvmSetup.versions = reactive(res?.data ?? [])
        GvmSetup.fetching = false
      })
      .catch(() => {
        GvmSetup.versions = []
        GvmSetup.fetching = false
      })
  },
  async installGvm(xtermDom: HTMLElement) {
    GvmSetup.installEnd = false
    try {
      await mountAndRun([GVM_INSTALL_COMMAND], xtermDom)
      GvmSetup.checkGvm()
    } finally {
      GvmSetup.installEnd = true
    }
  },
  async versionAction(
    item: GvmVersionItem,
    action: GvmVersionAction,
    xtermDom: HTMLElement
  ) {
    GvmSetup.installEnd = false
    try {
      const command = buildGvmVersionCommand(GvmSetup.initScript, action, item.name)
      await mountAndRun([command], xtermDom)
      GvmSetup.fetchData()
      await refreshInstalledVersions()
    } finally {
      GvmSetup.installEnd = true
    }
  }
})
```

- [ ] **Step 4: Implement the GVM page**

Create `src/render/components/GoLang/gvm/index.vue` with this complete card and terminal lifecycle:

```vue
<template>
  <el-card class="version-manager">
    <template #header>
      <div class="card-header">
        <div class="left"><span>GVM</span></div>
        <el-button class="button" link :disabled="refreshDisabled" @click="GvmSetup.fetchData()">
          <yb-icon
            :svg="import('@/svg/icon_refresh.svg?raw')"
            class="refresh-icon"
            :class="{ 'fa-spin': refreshDisabled }"
          />
        </el-button>
      </div>
    </template>
    <template v-if="GvmSetup.installing">
      <div class="w-full h-full overflow-hidden p-5">
        <div ref="xtermDom" class="w-full h-full overflow-hidden"></div>
      </div>
    </template>
    <template v-else-if="GvmSetup.installed === undefined">
      <div class="w-full h-full flex items-center justify-center">
        {{ I18nT('base.gettingVersion') }}
      </div>
    </template>
    <template v-else-if="GvmSetup.installed === false">
      <div class="w-full h-full flex flex-col items-center justify-center p-10 gap-5">
        <span>Install GVM?</span>
        <el-button type="primary" @click.stop="doInstall">{{ I18nT('base.confirm') }}</el-button>
      </div>
    </template>
    <template v-else>
      <el-table height="100%" :data="versionList" :border="false" style="width: 100%">
        <el-table-column prop="version">
          <template #header>
            <div class="w-full flex items-center gap-3">
              <span class="inline-flex items-center py-[2px] flex-shrink-0">{{
                I18nT('base.version')
              }}</span>
              <el-input
                v-model.trim="GvmSetup.searchKey"
                style="width: 188px"
                size="small"
                :placeholder="I18nT('common.action.search')"
                clearable
              />
            </div>
          </template>
          <template #default="scope"><span class="pl-12">{{ scope.row.version }}</span></template>
        </el-table-column>
        <el-table-column align="center" :label="I18nT('base.isInstalled')" width="150">
          <template #default="scope">
            <div class="cell-status">
              <yb-icon
                v-if="scope.row.installed"
                :svg="import('@/svg/ok.svg?raw')"
                class="installed"
              />
            </div>
          </template>
        </el-table-column>
        <el-table-column align="center" :label="I18nT('common.value.default')" width="150">
          <template #default="scope">
            <el-button v-if="scope.row.isDefault" link type="primary">
              <yb-icon :svg="import('@/svg/select.svg?raw')" width="18" height="18" />
            </el-button>
            <el-button
              v-else-if="scope.row.installed"
              class="current-set row-hover-show"
              link
              @click.stop="setVersionDefault(scope.row)"
            >
              <yb-icon class="current-not" :svg="import('@/svg/select.svg?raw')" width="18" height="18" />
            </el-button>
          </template>
        </el-table-column>
        <el-table-column align="center" :label="I18nT('common.label.action')" width="150">
          <template #default="scope">
            <el-button
              v-if="!scope.row.installed || (scope.row.installed && !scope.row.isDefault)"
              type="primary"
              link
              :disabled="GvmSetup.installing"
              @click="doVersionAction(scope.row)"
            >
              {{ scope.row.installed ? I18nT('common.action.uninstall') : I18nT('base.install') }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </template>
    <template v-if="GvmSetup.installing" #footer>
      <el-button v-if="GvmSetup.installEnd" type="primary" @click.stop="taskConfirm">
        {{ I18nT('base.confirm') }}
      </el-button>
      <el-button v-else @click.stop="taskCancel">{{ I18nT('base.cancel') }}</el-button>
    </template>
  </el-card>
</template>

<script lang="ts" setup>
  import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
  import type { GvmVersionItem } from '@shared/Gvm'
  import { I18nT } from '@lang/index'
  import XTerm from '@/util/XTerm'
  import { GvmSetup } from './setup'

  const xtermDom = ref<HTMLElement>()
  GvmSetup.checkGvm()

  const refreshDisabled = computed(() => GvmSetup.fetching || GvmSetup.installing)
  const versionList = computed(() => {
    const key = GvmSetup.searchKey.trim()
    const list = key
      ? GvmSetup.versions.filter((item) => item.version.includes(key) || item.name.includes(key))
      : [...GvmSetup.versions]
    return list.sort((a, b) => Number(b.installed) - Number(a.installed))
  })

  const startTask = (run: () => Promise<void>) => {
    GvmSetup.installing = true
    nextTick(() => run().catch(() => (GvmSetup.installEnd = true)))
  }
  const doInstall = () => startTask(() => GvmSetup.installGvm(xtermDom.value!))
  const doVersionAction = (item: GvmVersionItem) =>
    startTask(() =>
      GvmSetup.versionAction(item, item.installed ? 'uninstall' : 'install', xtermDom.value!)
    )
  const setVersionDefault = (item: GvmVersionItem) =>
    startTask(() => GvmSetup.versionAction(item, 'default', xtermDom.value!))

  const taskConfirm = () => {
    GvmSetup.installing = false
    GvmSetup.installEnd = false
    GvmSetup.xterm?.destroy()
    delete GvmSetup.xterm
    GvmSetup.checkGvm()
  }
  const taskCancel = () => {
    GvmSetup.installing = false
    GvmSetup.installEnd = false
    GvmSetup.xterm?.stop()?.then(() => {
      GvmSetup.xterm?.destroy()
      delete GvmSetup.xterm
    })
  }

  onMounted(() => {
    if (GvmSetup.installing) {
      nextTick().then(() => {
        const xterm = GvmSetup.xterm as XTerm | undefined
        if (xterm && xtermDom.value) xterm.mount(xtermDom.value).catch()
      })
    }
  })
  onUnmounted(() => GvmSetup.xterm?.unmounted?.())
</script>
```

- [ ] **Step 5: Append and render the GVM tab**

Update `src/render/components/GoLang/Index.vue`:

```vue
<ProjectCreateVM v-else-if="tab === 3" />
<GvmVM v-else-if="tab === 4" />
```

Add imports:

```ts
import GvmVM from './gvm/index.vue'
import { appendGvmTab } from './tabs'
```

Replace the tabs declaration with:

```ts
const tabs = appendGvmTab(
  [
    I18nT('host.projectGo'),
    I18nT('base.service'),
    I18nT('base.versionManager'),
    I18nT('host.newProject')
  ],
  window.Server.isWindows
)
```

- [ ] **Step 6: Run the focused test and verify green**

Run:

```bash
yarn test:go-gvm
```

Expected: PASS and print `go gvm tests passed`.

- [ ] **Step 7: Commit the UI slice**

```bash
git add scripts/go-gvm-test.ts src/render/components/GoLang/Index.vue src/render/components/GoLang/gvm/index.vue src/render/components/GoLang/gvm/setup.ts
git commit -m "feat: add GVM management page for Go"
```

### Task 5: Verify formatting, types, and bundles

**Files:**
- Modify only if checks identify a defect in the files changed above.

- [ ] **Step 1: Run the complete focused regression test**

```bash
yarn test:go-gvm
```

Expected: PASS and print `go gvm tests passed`.

- [ ] **Step 2: Run Prettier on the changed implementation files**

```bash
npx prettier --write package.json scripts/go-gvm-test.ts src/shared/Gvm.ts src/fork/module/GoLang/gvm.ts src/fork/module/GoLang/index.ts src/render/components/GoLang/Index.vue src/render/components/GoLang/tabs.ts src/render/components/GoLang/gvm/command.ts src/render/components/GoLang/gvm/setup.ts src/render/components/GoLang/gvm/index.vue
```

Expected: exit 0. Re-run `yarn test:go-gvm` after any formatting change.

- [ ] **Step 3: Run ESLint on every affected TypeScript and Vue file**

```bash
npx eslint scripts/go-gvm-test.ts src/shared/Gvm.ts src/fork/module/GoLang/gvm.ts src/fork/module/GoLang/index.ts src/render/components/GoLang/Index.vue src/render/components/GoLang/tabs.ts src/render/components/GoLang/gvm/command.ts src/render/components/GoLang/gvm/setup.ts src/render/components/GoLang/gvm/index.vue
```

Expected: exit 0 with no errors.

- [ ] **Step 4: Run the repository TypeScript check**

```bash
npx vue-tsc --noEmit
```

Expected: exit 0 with no TypeScript errors.

- [ ] **Step 5: Bundle the fork entry to verify production imports**

```bash
npx esbuild --platform=node --bundle --packages=external --format=esm --target=esnext src/fork/index.ts --outfile=/tmp/flyenv-go-gvm-fork.mjs
```

Expected: exit 0 and an esbuild completion summary.

- [ ] **Step 6: Inspect the final change set**

```bash
git diff --check
git status --short
git log -5 --oneline
```

Expected: no whitespace errors; only intended GVM files are changed or committed; the design, plan, parser, fork, renderer-helper, and UI commits are visible.

- [ ] **Step 7: Commit verification-only fixes if checks required changes**

```bash
git add package.json scripts/go-gvm-test.ts src/shared/Gvm.ts src/fork/module/GoLang/gvm.ts src/fork/module/GoLang/index.ts src/render/components/GoLang/Index.vue src/render/components/GoLang/tabs.ts src/render/components/GoLang/gvm/command.ts src/render/components/GoLang/gvm/setup.ts src/render/components/GoLang/gvm/index.vue
git commit -m "fix: satisfy GVM integration checks"
```

Skip this commit when verification made no file changes.
