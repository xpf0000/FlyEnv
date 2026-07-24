# Temporal UI and Startup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Temporal start with a valid Windows configuration path, give its Configuration tab the Codex full-height layout, and open the managed Web UI from an on-demand Mailpit-style website button.

**Architecture:** Keep Temporal Server launch arguments in a pure helper so the Windows regression is tested without starting a service. The renderer owns the UI button's install/start/error state and calls public Fork methods for installation status and idempotent UI startup. The Fork retains process ownership and cleanup, while the configuration page switches from the self-contained `Conf/index.vue` layout to Codex's card/body/footer composition.

**Tech Stack:** Vue 3 Composition API, Element Plus, Pinia, Electron IPC, TypeScript, Node assertion scripts.

---

## File map

| File | Responsibility |
| --- | --- |
| `src/fork/module/Temporal/util.ts` | Build platform-safe Temporal Server command arguments. |
| `src/fork/module/Temporal/index.ts` | Start the server without a root override and expose idempotent Web UI startup. |
| `scripts/temporal-module-test.ts` | Regression checks for command arguments and required Fork/renderer contracts. |
| `src/render/components/Temporal/Config.vue` | Codex-style full-height config card for Server and UI YAML files. |
| `src/render/components/Temporal/Index.vue` | Mailpit-style website icon and install/start/open state machine. |
| `src/render/components/Temporal/aside.vue` | Remove the auto-start extension parameter. |
| `src/render/components/Temporal/setup.ts` | Delete the obsolete persisted preference. |

### Task 1: Cover and fix Temporal Server command arguments

**Files:**
- Modify: `scripts/temporal-module-test.ts`
- Modify: `src/fork/module/Temporal/util.ts`
- Modify: `src/fork/module/Temporal/index.ts:29,102-104`

- [ ] **Step 1: Write the failing regression assertion**

Extend the utility import and add this test after the existing `serverEnvName` assertion:

~~~ts
import {
  buildServerStartArgs,
  buildServerYaml,
  buildUiYaml,
  normalizePath,
  serverEnvName
} from '../src/fork/module/Temporal/util'

const configDir = 'E:\\FlyEnv-Data\\server\\temporal\\config'
assert.deepEqual(buildServerStartArgs(configDir, '1.31.2'), [
  '-c',
  configDir,
  '-e',
  'temporal-v1.31.2',
  'start'
])
assert.ok(!buildServerStartArgs(configDir, '1.31.2').includes('-r'))
~~~

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test:temporal`

Expected: the Temporal module test fails because `buildServerStartArgs` is not exported.

- [ ] **Step 3: Write the minimal implementation**

Add this function below `serverEnvName` in `src/fork/module/Temporal/util.ts`:

~~~ts
export function buildServerStartArgs(configDir: string, version: string): string[] {
  return ['-c', configDir, '-e', serverEnvName(version), 'start']
}
~~~

Update the Temporal import and launch call in `src/fork/module/Temporal/index.ts`:

~~~ts
import { buildServerStartArgs, buildServerYaml, buildUiYaml } from './util'

// inside _startServer, after await this.initConfig(version).on(on)
const execArgs = buildServerStartArgs(configDir, version.version ?? '')
~~~

Do not pass `-r /`; on Windows it yields the invalid path `\\E:\\...`.

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test:temporal`

Expected: both Temporal test scripts print `ALL CHECKS PASSED` and exit 0.

- [ ] **Step 5: Commit**

~~~bash
git add scripts/temporal-module-test.ts src/fork/module/Temporal/util.ts src/fork/module/Temporal/index.ts
git commit -m "fix: start temporal with absolute config path"
~~~

### Task 2: Add idempotent managed Web UI startup

**Files:**
- Modify: `scripts/temporal-module-test.ts`
- Modify: `src/fork/module/Temporal/index.ts:94-154`

- [ ] **Step 1: Write the failing lifecycle checks**

Add this import and contract checks to `scripts/temporal-module-test.ts`:

~~~ts
import { readFileSync } from 'node:fs'

const temporalForkSource = readFileSync(
  new URL('../src/fork/module/Temporal/index.ts', import.meta.url),
  'utf8'
)
assert.match(temporalForkSource, /startUiServer\(version: SoftInstalled\)/)
assert.match(temporalForkSource, /isUiServerRunning\(\)/)
assert.doesNotMatch(temporalForkSource, /_startServer\(version: SoftInstalled, uiFlag\?: string\)/)
~~~

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test:temporal`

Expected: the lifecycle API assertions fail because the public UI startup method and running-process check do not exist.

- [ ] **Step 3: Write the minimal implementation**

Make `_startServer` accept only `version: SoftInstalled` and remove its `uiFlag` branch. Add these methods before the existing `_startUiServer` method:

~~~ts
startUiServer(version: SoftInstalled) {
  return new ForkPromise(async (resolve, reject, on) => {
    try {
      if (await this.isUiServerRunning()) {
        resolve({ running: true })
        return
      }
      await this._startUiServer(version, on)
      resolve({ running: false })
    } catch (e) {
      reject(e)
    }
  })
}

private async isUiServerRunning(): Promise<boolean> {
  if (!existsSync(this.uiPidPath)) {
    return false
  }
  try {
    const pid = (await readFile(this.uiPidPath, 'utf-8')).trim()
    if (!pid) {
      return false
    }
    const plist = await StopProcessListFetch()
    return (
      ProcessOwnedPidsByPid(pid, plist, [
        this.uiBin(),
        global.Server.BaseDir,
        global.Server.AppDir
      ]).length > 0
    )
  } catch {
    return false
  }
}
~~~

Keep `_startUiServer` responsible for its binary guard, YAML initialization, and `serviceStartSpawn` call. Keep the existing `_stopUiServer` cleanup path.

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test:temporal`

Expected: lifecycle and existing utility assertions pass.

- [ ] **Step 5: Commit**

~~~bash
git add scripts/temporal-module-test.ts src/fork/module/Temporal/index.ts
git commit -m "feat: start temporal ui on demand"
~~~

### Task 3: Rebuild the Temporal Configuration tab around the Codex layout

**Files:**
- Modify: `scripts/temporal-module-test.ts`
- Modify: `src/render/components/Temporal/Config.vue`

- [ ] **Step 1: Write a failing layout-contract test**

Append this check to `scripts/temporal-module-test.ts`:

~~~ts
const temporalConfigSource = readFileSync(
  new URL('../src/render/components/Temporal/Config.vue', import.meta.url),
  'utf8'
)
assert.match(temporalConfigSource, /module-config h-full overflow-hidden flex flex-col/)
assert.match(temporalConfigSource, /app-base-el-card flex-1 overflow-hidden/)
assert.match(temporalConfigSource, /import ConfVM from '@\/components\/Conf\/conf.vue'/)
assert.match(temporalConfigSource, /import ToolVM from '@\/components\/Conf\/tool.vue'/)
~~~

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test:temporal`

Expected: the old self-contained `Conf/index.vue` wrapper fails the layout-contract assertion.

- [ ] **Step 3: Write the minimal implementation**

Replace the template in `Config.vue` with this Codex-equivalent card composition:

~~~vue
<template>
  <div class="module-config h-full overflow-hidden flex flex-col">
    <el-card class="app-base-el-card flex-1 overflow-hidden">
      <template #header>
        <el-radio-group v-model="confType">
          <el-radio-button label="server" value="server">Server</el-radio-button>
          <el-radio-button label="ui" value="ui">UI</el-radio-button>
        </el-radio-group>
      </template>
      <template #default>
        <ConfVM
          :key="file"
          ref="conf"
          class="h-full overflow-hidden"
          type-flag="temporal"
          :default-file="defaultFile"
          :file="file"
          file-ext="yaml"
          :show-commond="false"
        />
      </template>
      <template #footer>
        <ToolVM v-if="conf" :conf="conf" />
      </template>
    </el-card>
  </div>
</template>
~~~

Import `ConfVM` from `@/components/Conf/conf.vue` and `ToolVM` from `@/components/Conf/tool.vue`. Retain the current computed Server/UI file paths. Replace the one-time `fs.existsSync(...).then(...)` call with an immediate `watch(file, ...)`: for a non-empty missing Server file invoke `initConfig` with a deep copy of `currentVersion.value`; for a missing UI file invoke `initUiConfig`; after successful IPC, await `nextTick()` and call `conf.value?.update()`.

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test:temporal`

Expected: all configuration layout assertions and existing utility assertions pass.

- [ ] **Step 5: Commit**

~~~bash
git add scripts/temporal-module-test.ts src/render/components/Temporal/Config.vue
git commit -m "fix: fill temporal configuration editor height"
~~~

### Task 4: Replace Web UI controls with the on-demand website icon

**Files:**
- Modify: `scripts/temporal-module-test.ts`
- Modify: `src/render/components/Temporal/Index.vue`
- Modify: `src/render/components/Temporal/aside.vue`
- Delete: `src/render/components/Temporal/setup.ts`

- [ ] **Step 1: Write failing renderer integration checks**

Append the following checks to `scripts/temporal-module-test.ts`:

~~~ts
const temporalIndexSource = readFileSync(
  new URL('../src/render/components/Temporal/Index.vue', import.meta.url),
  'utf8'
)
assert.match(temporalIndexSource, /v-if="isRunning" #tool-left/)
assert.match(temporalIndexSource, /uiState/)
assert.match(temporalIndexSource, /fetchUiLatest/)
assert.match(temporalIndexSource, /installUiLatest/)
assert.match(temporalIndexSource, /startUiServer/)
assert.match(temporalIndexSource, /http.svg/)
assert.doesNotMatch(temporalIndexSource, /TemporalSetup|uiEnabled|base\.install/)

const temporalAsideSource = readFileSync(
  new URL('../src/render/components/Temporal/aside.vue', import.meta.url),
  'utf8'
)
assert.doesNotMatch(temporalAsideSource, /TemporalSetup|startExtParam/)
~~~

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test:temporal`

Expected: the current switch, Install button, and `startExtParam` make the new checks fail.

- [ ] **Step 3: Write the minimal implementation**

In `Index.vue`, retain the current tabs and use this Service slot:

~~~vue
<template v-if="isRunning" #tool-left>
  <el-button
    class="button"
    link
    :loading="uiState === 'loading'"
    :style="{ color: uiState === 'error' ? '#f56c6c' : '#01cc74' }"
    @click.stop="openTemporalUi"
  >
    <yb-icon
      v-if="uiState !== 'loading'"
      style="width: 20px; height: 20px; margin-left: 10px"
      :svg="import('@/svg/http.svg?raw')"
    />
  </el-button>
</template>
~~~

Use `BrewStore` to derive `isRunning` and `currentVersion`; add `uiState` as `'idle' | 'loading' | 'error'`. Implement a Promise wrapper around `IPC.send('app-fork:temporal', ...)` that unregisters its IPC key. `openTemporalUi` must return while loading or without a current version, set loading, then run in this exact order: `uiServerInfo`; when uninstalled, `fetchUiLatest` then `installUiLatest` with a deep-copied row; `startUiServer` with the deep-copied current version; read the generated UI YAML port and call `shell.openExternal('http://127.0.0.1:<port>/')`. A nonzero Fork result or caught exception calls `MessageError` and leaves `uiState` as `'error'`; success restores `'idle'`.

In `aside.vue`, retain only `AsideSetup('temporal')` and the existing `AppServiceModule.temporal` registration. Remove all `TemporalSetup`, `BrewStore`, and `startExtParam` code. Delete `setup.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test:temporal`

Expected: all checks pass; the website icon is shown only while Temporal is running, and no auto-start setting or Install control remains.

- [ ] **Step 5: Commit**

~~~bash
git add scripts/temporal-module-test.ts src/render/components/Temporal/Index.vue src/render/components/Temporal/aside.vue
git rm src/render/components/Temporal/setup.ts
git commit -m "feat: open temporal ui from service icon"
~~~

### Task 5: Format, type-check, and perform Windows acceptance verification

**Files:**
- Verify: `src/fork/module/Temporal/util.ts`
- Verify: `src/fork/module/Temporal/index.ts`
- Verify: `src/render/components/Temporal/Config.vue`
- Verify: `src/render/components/Temporal/Index.vue`
- Verify: `src/render/components/Temporal/aside.vue`
- Verify: `scripts/temporal-module-test.ts`

- [ ] **Step 1: Check formatting**

Run:

~~~bash
yarn exec prettier --check src/fork/module/Temporal/util.ts src/fork/module/Temporal/index.ts src/render/components/Temporal/Config.vue src/render/components/Temporal/Index.vue src/render/components/Temporal/aside.vue scripts/temporal-module-test.ts
~~~

Expected: all listed files are formatted. If a difference is reported, run the same command with `--write`, rerun `--check`, then rerun `yarn test:temporal`.

- [ ] **Step 2: Run regression and type validation**

Run:

~~~bash
yarn test:temporal
yarn exec vue-tsc --noEmit
~~~

Expected: both Temporal scripts print `ALL CHECKS PASSED`; `vue-tsc` exits 0 with no diagnostics from changed files.

- [ ] **Step 3: Verify the actual Windows configuration boundary**

Run:

~~~powershell
& 'E:\Github\FlyEnv\data\app\temporal\1.31.2\temporal-server.exe' -c 'E:\Github\FlyEnv\data\server\temporal\config' -e 'temporal-v1.31.2' render-config
~~~

Expected: output includes `Loading config files=[E:\\Github\\FlyEnv\\data\\server\\temporal\\config\\temporal-v1.31.2.yaml]` and contains no path beginning with `\\E:`.

- [ ] **Step 4: Manually validate the renderer interaction**

In the development app, start Temporal Server and open the Service tab. Verify that the green website icon is shown and there is no Web UI switch or Install button. Click it with no UI binary installed and verify loading, installation, startup, and browser opening at the configured port. Stop and restart Temporal, deliberately reserve the UI port, click the icon, and verify it stays red on failure and retries on the next click.

- [ ] **Step 5: Commit verification-only corrections if required**

Run:

~~~bash
git status --short
git add src/fork/module/Temporal/util.ts src/fork/module/Temporal/index.ts src/render/components/Temporal/Config.vue src/render/components/Temporal/Index.vue src/render/components/Temporal/aside.vue scripts/temporal-module-test.ts
git commit -m "test: verify temporal ui workflow"
~~~

Create this final commit only when formatting or verification requires a source correction after the previous task commits.
