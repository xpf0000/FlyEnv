# Windows Elevation Method Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Add a Windows-only General-settings switch for UAC versus Helper, defaulting to Helper and persisting UAC whenever the helper executable is missing or helper installation fails.

**Architecture:** Store a helper | uac preference in the normal setup config and mirror it to global.Server, which ForkItem already sends before each task. The seven-operation Windows fallback remains the only UAC transport: Helper.send() uses it directly in UAC mode and when a configured Helper has no executable.

**Tech Stack:** Electron main/fork processes, Vue 3 Composition API, Pinia, Element Plus, TypeScript, electron-store, Node assertion scripts.

---

## File Structure

- Modify: src/shared/WindowsHelperState.ts — elevation union/default/resolver.
- Modify: src/global.d.ts, src/main/core/ConfigManager.ts, src/main/core/ServerManager.ts, src/render/store/app.ts — persist and propagate the setting.
- Modify: src/fork/Helper.ts and src/main/core/AppHelper.ts — UAC direct routing and automatic fallback notifications.
- Modify: src/main/Application.ts — persist fallback and notify the renderer.
- Create: src/render/components/Setup/WindowsElevationMethod/index.vue — control matching TrayStyle.
- Modify: src/render/components/Setup/Common.vue and src/render/util/GlobalIPCOn.ts — placement and state synchronization.
- Modify: src/lang/en/setup.json and src/lang/zh/setup.json — labels and tooltip.
- Modify: scripts/windows-helper-state-test.ts and scripts/windows-helper-send-test.ts; create scripts/windows-elevation-method-test.ts — regression coverage.

### Task 1: Define the shared elevation configuration

**Files:**
- Modify: src/shared/WindowsHelperState.ts:1-105
- Modify: src/global.d.ts:3-51
- Modify: src/main/core/ConfigManager.ts:1-234
- Modify: src/main/core/ServerManager.ts:1-107
- Modify: src/render/store/app.ts:1-190
- Test: scripts/windows-helper-state-test.ts

- [ ] **Step 1: Write the failing resolver test**

Add this import and assertions to scripts/windows-helper-state-test.ts before production changes:

~~~
import {
  DEFAULT_WINDOWS_ELEVATION_METHOD,
  resolveWindowsElevationMethod
} from '../src/shared/WindowsHelperState'

assert.equal(DEFAULT_WINDOWS_ELEVATION_METHOD, 'helper')
assert.equal(resolveWindowsElevationMethod(undefined), 'helper')
assert.equal(resolveWindowsElevationMethod('helper'), 'helper')
assert.equal(resolveWindowsElevationMethod('uac'), 'uac')
assert.equal(resolveWindowsElevationMethod('invalid'), 'helper')
~~~

- [ ] **Step 2: Run the test to prove it is red**

Run: yarn tsx scripts/windows-helper-state-test.ts

Expected: compilation reports that the two requested exports do not exist.

- [ ] **Step 3: Implement the shared contract and config defaults**

Add this complete contract to src/shared/WindowsHelperState.ts after AppHelperErrorCode:

~~~
export type WindowsElevationMethod = 'helper' | 'uac'

export const DEFAULT_WINDOWS_ELEVATION_METHOD: WindowsElevationMethod = 'helper'

export const resolveWindowsElevationMethod = (value: unknown): WindowsElevationMethod => {
  return value === 'uac' ? 'uac' : DEFAULT_WINDOWS_ELEVATION_METHOD
}
~~~

Use the same type in the global declaration, main config, renderer config, and global sync:

~~~
/* src/global.d.ts */
import type { WindowsElevationMethod } from '@shared/WindowsHelperState'

export interface ServerType {
  // retain existing fields
  WindowsElevationMethod?: WindowsElevationMethod
}

/* src/main/core/ConfigManager.ts */
import {
  DEFAULT_WINDOWS_ELEVATION_METHOD,
  type WindowsElevationMethod
} from '@shared/WindowsHelperState'

interface ConfigOptions {
  // retain existing fields
  setup: {
    // retain existing setup fields
    windowsElevationMethod: WindowsElevationMethod
  }
}

// add inside defaults.setup
windowsElevationMethod: DEFAULT_WINDOWS_ELEVATION_METHOD,

/* src/render/store/app.ts */
import {
  DEFAULT_WINDOWS_ELEVATION_METHOD,
  type WindowsElevationMethod
} from '@shared/WindowsHelperState'

type StateBase = SetupBase & {
  // retain existing fields
  windowsElevationMethod?: WindowsElevationMethod
}

// add inside initial state.config.setup
windowsElevationMethod: DEFAULT_WINDOWS_ELEVATION_METHOD,

/* src/main/core/ServerManager.ts */
import { resolveWindowsElevationMethod } from '@shared/WindowsHelperState'

updateGlobalConfig() {
  global.Server.ForceStart = this.configManager.getConfig('setup.forceStart')
  global.Server.Licenses = this.configManager.getConfig('setup.license')
  global.Server.UserUUID = this.configManager.getConfig('setup.user_uuid')
  global.Server.WindowsElevationMethod = resolveWindowsElevationMethod(
    this.configManager.getConfig('setup.windowsElevationMethod')
  )
}
~~~

- [ ] **Step 4: Run the state test to prove it is green**

Run: yarn tsx scripts/windows-helper-state-test.ts

Expected: windows-helper-state-test: ok

- [ ] **Step 5: Commit the configuration contract**

Run:

~~~
git add src/shared/WindowsHelperState.ts src/global.d.ts src/main/core/ConfigManager.ts src/main/core/ServerManager.ts src/render/store/app.ts scripts/windows-helper-state-test.ts
git commit -m "feat: add Windows elevation method config"
~~~

### Task 2: Route the existing seven UAC operations without helper checks

**Files:**
- Modify: src/fork/Helper.ts:1-284
- Modify: src/main/core/AppHelper.ts:14-379
- Test: scripts/windows-helper-send-test.ts

- [ ] **Step 1: Write failing direct-UAC and missing-binary tests**

Replace the existing missing-binary rejection assertion and append these test cases in scripts/windows-helper-send-test.ts:

~~~
let missingFallbacks = 0
let missingReason = ''
const missingHelper = createHelper({
  isWindows: () => true,
  getWindowsElevationMethod: () => 'helper',
  appHelperCheck: async () => {
    throw new AppHelperError('helper_binary_missing', 'missing')
  },
  runWindowsHelperFallback: async () => {
    missingFallbacks += 1
    return true
  },
  notifyWindowsElevationFallback: (reason) => {
    missingReason = reason
  }
})

assert.equal(
  await missingHelper.send('tools', 'writeFileByRoot', 'C:/FlyEnv/test.txt', 'content'),
  true
)
assert.equal(missingFallbacks, 1)
assert.equal(missingReason, 'helper_binary_missing')

let uacChecks = 0
let uacFallbacks = 0
const uacHelper = createHelper({
  isWindows: () => true,
  getWindowsElevationMethod: () => 'uac',
  appHelperCheck: async () => {
    uacChecks += 1
    return true
  },
  runWindowsHelperFallback: async () => {
    uacFallbacks += 1
    return true
  }
})

assert.equal(await uacHelper.send('tools', 'setSystemEnv', 'FLYENV_ALIAS', 'C:/FlyEnv'), true)
assert.equal(uacChecks, 0)
assert.equal(uacFallbacks, 1)

await assert.rejects(
  uacHelper.send('tools', 'readFileByRoot', 'C:/FlyEnv/private.txt'),
  (error: any) => error?.code === 'windows_fallback_not_supported'
)
~~~

- [ ] **Step 2: Run the routing test to prove it is red**

Run: yarn tsx scripts/windows-helper-send-test.ts

Expected: compilation rejects the new Helper dependency fields; existing behavior still rejects helper_binary_missing.

- [ ] **Step 3: Implement direct-UAC routing**

Extend the Helper imports and injected dependencies:

~~~
import {
  AppHelperError,
  isAppHelperError,
  isWindowsHelperFallbackAllowed,
  resolveWindowsElevationMethod,
  resolveWindowsHelperTransport,
  type AppHelperErrorCode,
  type WindowsElevationMethod
} from '@shared/WindowsHelperState'

type HelperDeps = {
  // retain existing dependencies
  getWindowsElevationMethod: () => WindowsElevationMethod
  notifyWindowsElevationFallback: (reason: AppHelperErrorCode) => void
}

const defaultHelperDeps: HelperDeps = {
  // retain existing dependencies
  getWindowsElevationMethod: () => resolveWindowsElevationMethod(global.Server.WindowsElevationMethod),
  notifyWindowsElevationFallback: (reason) => {
    process.send?.({
      on: true,
      key: 'App-Windows-Elevation-Method-Fallback',
      info: { code: 200, method: 'uac', reason }
    })
  }
}
~~~

Add these two full Helper methods:

~~~
private async runWindowsUacFallback<T>(module: Module, fn: FN, args: any[]): Promise<T> {
  if (!isWindowsHelperFallbackAllowed(module, fn)) {
    throw new AppHelperError(
      'windows_fallback_not_supported',
      'Windows UAC does not support ' + module + '/' + fn
    )
  }
  this.enable = false
  return (await this.deps.runWindowsHelperFallback(module, fn, args)) as T
}

private notifyWindowsElevationFallback(reason: AppHelperErrorCode) {
  if (this.appHelper) {
    this.appHelper.fallbackToUac(reason)
    return
  }
  this.deps.notifyWindowsElevationFallback(reason)
}
~~~

At the beginning of send<T>(), before appHelperCheck(), add:

~~~
if (this.deps.isWindows() && this.deps.getWindowsElevationMethod() === 'uac') {
  try {
    resolveOnce(await this.runWindowsUacFallback<T>(module, fn, args))
  } catch (error) {
    rejectOnce(this.normalizeError(error))
  }
  return
}
~~~

At the beginning of routeUnavailableHelper<T>(), before resolveWindowsHelperTransport(), add:

~~~
if (
  this.deps.isWindows() &&
  isAppHelperError(error, 'helper_binary_missing') &&
  isWindowsHelperFallbackAllowed(module, fn)
) {
  this.notifyWindowsElevationFallback(error.code)
  return { handled: true, value: await this.runWindowsUacFallback<T>(module, fn, args) }
}
~~~

Extend AppHelperMessage state and add this public method to src/main/core/AppHelper.ts:

~~~
fallbackToUac(reason?: string) {
  this.emitStatus('fallbackToUac', reason)
}
~~~

- [ ] **Step 4: Run the routing test to prove it is green**

Run: yarn tsx scripts/windows-helper-send-test.ts

Expected: windows helper send test passed; selected UAC makes zero health checks and missing helper binaries use the supported fallback once.

- [ ] **Step 5: Commit the routing behavior**

Run:

~~~
git add src/fork/Helper.ts src/main/core/AppHelper.ts scripts/windows-helper-send-test.ts
git commit -m "feat: route Windows UAC elevation"
~~~

### Task 3: Persist and broadcast automatic fallback

**Files:**
- Modify: src/main/Application.ts:91-305,408-423
- Create: scripts/windows-elevation-method-test.ts

- [ ] **Step 1: Create the failing main-process integration test**

Create scripts/windows-elevation-method-test.ts:

~~~
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const application = fs.readFileSync(path.resolve('src/main/Application.ts'), 'utf8')
const serverManager = fs.readFileSync(path.resolve('src/main/core/ServerManager.ts'), 'utf8')

assert.match(serverManager, /WindowsElevationMethod = resolveWindowsElevationMethod/)
assert.match(application, /App-Windows-Elevation-Method-Fallback/)
assert.match(application, /APP-Windows-Elevation-Method-Changed/)
assert.match(application, /message.state === 'installFaild'/)
assert.match(application, /message.state === 'fallbackToUac'/)
assert.match(application, /this.serverManager.updateGlobalConfig/)

console.log('windows elevation method test passed')
~~~

- [ ] **Step 2: Run the new integration test to prove it is red**

Run: yarn tsx scripts/windows-elevation-method-test.ts

Expected: an assertion fails because Application has no fallback event listener or renderer method-change broadcast.

- [ ] **Step 3: Centralize persistence in Application**

Add this method to Application:

~~~
private setWindowsElevationMethod(method: 'helper' | 'uac', reason?: string) {
  this.configManager.setConfig('setup.windowsElevationMethod', method)
  this.serverManager.updateGlobalConfig()
  if (!this.mainWindow) {
    return
  }
  this.windowManager.sendCommandTo(
    this.mainWindow,
    'APP-Windows-Elevation-Method-Changed',
    'APP-Windows-Elevation-Method-Changed',
    { method, reason }
  )
}
~~~

Call updateGlobalConfig() immediately after serverManager.setProxy() in init(), and call it after configManager.setConfig(config) in the application:save-preference listener.

At the start of handleHelperStatusMessage(), before existing notice construction, add:

~~~
if (
  global.Server.isWindows &&
  (message.state === 'installFaild' || message.state === 'fallbackToUac') &&
  global.Server.WindowsElevationMethod === 'helper'
) {
  this.setWindowsElevationMethod('uac', message.reason)
}
~~~

Handle fork-originated automatic fallback before the existing App-Need-Init-FlyEnv-Helper branch:

~~~
if (key === 'App-Windows-Elevation-Method-Fallback') {
  this.setWindowsElevationMethod('uac', info?.reason)
  return
}
~~~

- [ ] **Step 4: Run the integration test to prove it is green**

Run: yarn tsx scripts/windows-elevation-method-test.ts

Expected: windows elevation method test passed

- [ ] **Step 5: Commit persistence and broadcast**

Run:

~~~
git add src/main/Application.ts scripts/windows-elevation-method-test.ts
git commit -m "feat: persist Windows helper fallback"
~~~

### Task 4: Add the Windows General-settings control

**Files:**
- Create: src/render/components/Setup/WindowsElevationMethod/index.vue
- Modify: src/render/components/Setup/Common.vue:1-90
- Modify: src/render/util/GlobalIPCOn.ts:1-61
- Modify: src/lang/en/setup.json:42-49
- Modify: src/lang/zh/setup.json:42-49
- Modify: scripts/windows-elevation-method-test.ts

- [ ] **Step 1: Extend the integration test with failing renderer assertions**

Append to scripts/windows-elevation-method-test.ts:

~~~
const common = fs.readFileSync(path.resolve('src/render/components/Setup/Common.vue'), 'utf8')
const control = fs.readFileSync(
  path.resolve('src/render/components/Setup/WindowsElevationMethod/index.vue'),
  'utf8'
)
const globalIpc = fs.readFileSync(path.resolve('src/render/util/GlobalIPCOn.ts'), 'utf8')
const english = JSON.parse(fs.readFileSync(path.resolve('src/lang/en/setup.json'), 'utf8'))
const chinese = JSON.parse(fs.readFileSync(path.resolve('src/lang/zh/setup.json'), 'utf8'))

assert.match(common, /<WindowsElevationMethod \/>/)
assert.match(control, /value="uac"/)
assert.match(control, /value="helper"/)
assert.match(control, /APP-FlyEnv-Helper-Install/)
assert.match(globalIpc, /APP-Windows-Elevation-Method-Changed/)
assert.equal(english.windowsElevationMethod, 'Elevation Method')
assert.equal(chinese.windowsElevationMethod, '提权方式')
~~~

- [ ] **Step 2: Run the integration test to prove it is red**

Run: yarn tsx scripts/windows-elevation-method-test.ts

Expected: file-not-found error for src/render/components/Setup/WindowsElevationMethod/index.vue.

- [ ] **Step 3: Implement the controlled radio group and renderer synchronization**

Create src/render/components/Setup/WindowsElevationMethod/index.vue:

~~~
<template>
  <div class="plant-title flex items-center gap-1">
    <span>{{ I18nT('setup.windowsElevationMethod') }}</span>
    <el-popover placement="top" width="auto">
      <template #reference>
        <yb-icon :svg="import('@/svg/question.svg?raw')" width="12" height="12"></yb-icon>
      </template>
      <template #default>
        <span>{{ I18nT('setup.windowsElevationMethodTips') }}</span>
      </template>
    </el-popover>
  </div>
  <div class="main reset-pass">
    <el-radio-group :model-value="method" :disabled="changing" @change="changeMethod">
      <el-radio-button :label="I18nT('setup.windowsElevationUac')" value="uac"></el-radio-button>
      <el-radio-button :label="I18nT('setup.windowsElevationHelper')" value="helper"></el-radio-button>
    </el-radio-group>
  </div>
</template>

<script lang="ts" setup>
  import { computed, ref } from 'vue'
  import { AppStore } from '@/store/app'
  import IPC from '@/util/IPC'
  import { I18nT } from '@lang/index'
  import { resolveWindowsElevationMethod, type WindowsElevationMethod } from '@shared/WindowsHelperState'

  const store = AppStore()
  const changing = ref(false)
  const method = computed(() => resolveWindowsElevationMethod(store.config.setup.windowsElevationMethod))

  const persist = async (value: WindowsElevationMethod) => {
    store.config.setup.windowsElevationMethod = value
    await store.saveConfig()
  }

  const verifyOrInstallHelper = () =>
    new Promise<boolean>((resolve) => {
      IPC.send('APP-FlyEnv-Helper-Install').then((key: string, res: any) => {
        IPC.off(key)
        resolve(res?.code === 0)
      })
    })

  const changeMethod = async (value: string | number | boolean) => {
    if ((value !== 'uac' && value !== 'helper') || changing.value || value === method.value) {
      return
    }
    if (value === 'uac') {
      await persist('uac')
      return
    }
    changing.value = true
    try {
      await persist((await verifyOrInstallHelper()) ? 'helper' : 'uac')
    } catch {
      await persist('uac')
    } finally {
      changing.value = false
    }
  }
</script>
~~~

Import WindowsElevationMethod in Common.vue and add this Windows-only row after the existing Windows TrayStyle row:

~~~
<div v-if="isWindows" class="row-2">
  <div class="col">
    <WindowsElevationMethod />
  </div>
</div>
~~~

Register this renderer event in GlobalIPCOn.init():

~~~
IPC.on('APP-Windows-Elevation-Method-Changed').then((key: string, res: any) => {
  if (res?.method === 'helper' || res?.method === 'uac') {
    AppStore().config.setup.windowsElevationMethod = res.method
  }
})
~~~

Add these exact JSON fields after the existing FlyEnv Helper fields:

~~~
/* src/lang/en/setup.json */
"windowsElevationMethod": "Elevation Method",
"windowsElevationMethodTips": "Choose how Windows operations that require administrator privileges are elevated. UAC asks for confirmation for each supported operation; Helper avoids repeated prompts after it is installed.",
"windowsElevationUac": "UAC",
"windowsElevationHelper": "Helper"

/* src/lang/zh/setup.json */
"windowsElevationMethod": "提权方式",
"windowsElevationMethodTips": "选择 Windows 需要管理员权限操作的提权方式。UAC 会在每次支持的操作时请求确认；帮助程序安装成功后可避免重复确认。",
"windowsElevationUac": "UAC",
"windowsElevationHelper": "帮助程序"
~~~

- [ ] **Step 4: Run the integration test to prove it is green**

Run: yarn tsx scripts/windows-elevation-method-test.ts

Expected: windows elevation method test passed

- [ ] **Step 5: Commit the settings UI**

Run:

~~~
git add src/render/components/Setup/WindowsElevationMethod/index.vue src/render/components/Setup/Common.vue src/render/util/GlobalIPCOn.ts src/lang/en/setup.json src/lang/zh/setup.json scripts/windows-elevation-method-test.ts
git commit -m "feat: add Windows elevation method setting"
~~~

### Task 5: Verify the completed feature

**Files:**
- Modify only the named feature files if a focused verification reveals a defect.

- [ ] **Step 1: Run focused behavior tests**

Run:

~~~
yarn tsx scripts/windows-helper-state-test.ts
yarn tsx scripts/windows-helper-send-test.ts
yarn tsx scripts/windows-helper-fallback-plan-test.ts
yarn tsx scripts/windows-app-helper-init-test.ts
yarn tsx scripts/windows-helper-install-ipc-test.ts
yarn tsx scripts/windows-elevation-method-test.ts
yarn test:helper:contract
~~~

Expected: every command exits 0 and prints its success line.

- [ ] **Step 2: Run lint, type validation, and whitespace checks**

Run:

~~~
yarn exec eslint src/shared/WindowsHelperState.ts src/fork/Helper.ts src/main/core/AppHelper.ts src/main/Application.ts src/main/core/ConfigManager.ts src/main/core/ServerManager.ts src/render/store/app.ts src/render/util/GlobalIPCOn.ts src/render/components/Setup/Common.vue src/render/components/Setup/WindowsElevationMethod/index.vue scripts/windows-helper-state-test.ts scripts/windows-helper-send-test.ts scripts/windows-elevation-method-test.ts
yarn exec vue-tsc --noEmit
git diff --check
git status --short
~~~

Expected: lint, type validation, and diff checks exit 0. If the type command reports an unrelated existing failure, preserve its exact path and message in the handoff.

- [ ] **Step 3: Commit any verification correction**

Run only when a preceding verification required a code correction:

~~~
git add src/shared/WindowsHelperState.ts src/global.d.ts src/main/core/ConfigManager.ts src/main/core/ServerManager.ts src/render/store/app.ts src/fork/Helper.ts src/main/core/AppHelper.ts src/main/Application.ts src/render/components/Setup/WindowsElevationMethod/index.vue src/render/components/Setup/Common.vue src/render/util/GlobalIPCOn.ts src/lang/en/setup.json src/lang/zh/setup.json scripts/windows-helper-state-test.ts scripts/windows-helper-send-test.ts scripts/windows-elevation-method-test.ts
git commit -m "test: verify Windows elevation method"
~~~

