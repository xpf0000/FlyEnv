# MCP Independent Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add MCP lifecycle preferences so FlyEnv can auto-start MCP on app launch and optionally exclude MCP from group start/stop without affecting manual MCP control.

**Architecture:** Split persistent lifecycle preferences from runtime status. Main-process startup behavior will move behind a small `MCPLifecycle` helper so app-launch auto-start is testable without booting Electron, and renderer group filtering will move behind a small `groupService` helper so independent MCP is excluded from group state/action calculations without rewriting the large aside component.

**Tech Stack:** TypeScript, Electron main-process IPC, Vue 3 Composition API, Pinia, `tsx` script-based regression tests

---

## File Structure

- Create: `src/main/core/MCPLifecycle.ts`
  Owns app-launch MCP auto-start behavior and error swallowing/logging semantics.
- Modify: `src/main/core/MCPConfigManager.ts`
  Replaces persisted `enabled` with `autoStart` and `independentService`.
- Modify: `src/main/Application.ts`
  Calls the lifecycle helper immediately after `mcpServer` is created.
- Modify: `src/main/core/IPCHandler.ts`
  Keeps `mcp:start` / `mcp:stop` runtime-only and leaves preferences untouched.
- Create: `scripts/mcp-lifecycle-preferences-test.ts`
  Main-process regression script for config round-trip, runtime-only start/stop, and app-launch auto-start.
- Create: `src/render/components/Aside/groupService.ts`
  Pure helpers for deciding whether a service participates in group calculations.
- Modify: `src/render/core/ASide.ts`
  Extends `AppServiceModuleItem` with optional `participatesInGroup`.
- Modify: `src/render/components/MCP/ASide.ts`
  Sets `participatesInGroup` from `MCPSetup.config.independentService`.
- Modify: `src/render/components/Aside/Index.vue`
  Routes group filtering, `groupDo`, `groupIsRunning`, `groupDisabled`, and `noGroupStart` through the helper.
- Modify: `src/render/components/MCP/setup.ts`
  Removes `enabled` from MCP config state and adds `autoStart` plus `independentService`.
- Modify: `src/render/components/MCP/Service.vue`
  Adds the two lifecycle switches and persists them immediately.
- Modify: `src/lang/en/mcp.json`
  Adds English copy for the new switches.
- Modify: `src/lang/zh/mcp.json`
  Adds Chinese copy for the new switches.
- Create: `scripts/mcp-group-service-test.ts`
  Renderer-side regression script for group-participation filtering.

### Task 1: Add a failing main-process lifecycle regression

**Files:**
- Create: `scripts/mcp-lifecycle-preferences-test.ts`
- Read: `src/main/core/IPCHandler.ts`
- Read: `src/main/core/MCPConfigManager.ts`
- Read: `docs/superpowers/specs/2026-06-29-mcp-independent-service-design.md`

- [ ] **Step 1: Write the failing regression script**

```ts
import assert from 'node:assert/strict'
import IPCHandler from '../src/main/core/IPCHandler'
import { startMcpOnLaunchIfNeeded } from '../src/main/core/MCPLifecycle'

class FakeMcpConfigManager {
  store: Record<string, any>

  constructor(store?: Record<string, any>) {
    this.store = {
      autoStart: false,
      independentService: false,
      host: '127.0.0.1',
      port: 7682,
      token: 'test-token',
      transport: { http: true, stdio: false },
      enabledTools: [],
      approval: {},
      allowRemote: false,
      maskSecrets: false,
      ...(store ?? {})
    }
  }

  getConfig(key?: string, defaultValue?: any) {
    if (typeof key === 'undefined') {
      return this.store
    }
    return this.store[key] ?? defaultValue
  }

  setConfig(key: string | Record<string, any>, value?: any) {
    if (typeof key === 'string') {
      this.store[key] = value
    } else {
      Object.assign(this.store, key)
    }
    return this.store
  }
}

class FakeMcpServer {
  starts = 0
  stops = 0
  failStart = false

  async start() {
    this.starts += 1
    if (this.failStart) {
      throw new Error('EADDRINUSE')
    }
    return { running: true, host: '127.0.0.1', port: 7682 }
  }

  async stop() {
    this.stops += 1
    return { running: false }
  }

  status() {
    return { running: this.starts > this.stops }
  }
}

class FakeWindowManager {
  sent: Array<{ command: string; key: string; data: any }> = []

  sendCommandTo(_window: any, command: string, key: string, data: any) {
    this.sent.push({ command, key, data })
  }
}

function createHandler(
  config: FakeMcpConfigManager,
  server: FakeMcpServer,
  windowManager: FakeWindowManager
) {
  return new IPCHandler({
    configManager: {} as any,
    mcpConfigManager: config as any,
    mcpServer: server as any,
    mcpBridgeManager: { getBridgePath: () => 'C:/FlyEnv/mcp/flyenv-mcp-stdio.mjs' } as any,
    windowManager: windowManager as any,
    trayManager: {} as any,
    serverManager: { setProxy() {}, updateGlobalConfig() {} } as any,
    appNodeFnManager: {} as any,
    siteSuckerManager: {} as any,
    mainWindow: {}
  })
}

async function flushAsyncWork() {
  await new Promise((resolve) => setImmediate(resolve))
}

async function testConfigRoundTripAndRuntimeOnlyStartStop() {
  const config = new FakeMcpConfigManager({ autoStart: false, independentService: true })
  const server = new FakeMcpServer()
  const windowManager = new FakeWindowManager()
  const handler = createHandler(config, server, windowManager)

  handler.handleCommand('mcp:setConfig', 'set-config', {
    autoStart: true,
    independentService: true
  })
  await flushAsyncWork()
  assert.equal(config.getConfig('autoStart'), true)
  assert.equal(config.getConfig('independentService'), true)
  assert.equal(windowManager.sent.at(-1)?.data?.data?.autoStart, true)

  handler.handleCommand('mcp:start', 'start-config')
  await flushAsyncWork()
  assert.equal(server.starts, 1)
  assert.equal(config.getConfig('autoStart'), true)
  assert.equal(config.getConfig('independentService'), true)
  assert.equal(config.getConfig('enabled'), undefined)

  handler.handleCommand('mcp:stop', 'stop-config')
  await flushAsyncWork()
  assert.equal(server.stops, 1)
  assert.equal(config.getConfig('enabled'), undefined)
}

async function testAppLaunchAutoStart() {
  const disabledConfig = new FakeMcpConfigManager({ autoStart: false })
  const disabledServer = new FakeMcpServer()
  assert.equal(await startMcpOnLaunchIfNeeded(disabledConfig as any, disabledServer as any), false)
  assert.equal(disabledServer.starts, 0)

  const enabledConfig = new FakeMcpConfigManager({ autoStart: true })
  const enabledServer = new FakeMcpServer()
  assert.equal(await startMcpOnLaunchIfNeeded(enabledConfig as any, enabledServer as any), true)
  assert.equal(enabledServer.starts, 1)

  const failingServer = new FakeMcpServer()
  failingServer.failStart = true
  const errors: string[] = []
  assert.equal(
    await startMcpOnLaunchIfNeeded(enabledConfig as any, failingServer as any, (error) => {
      errors.push(String(error))
    }),
    false
  )
  assert.match(errors[0] ?? '', /EADDRINUSE/)
}

async function main() {
  await testConfigRoundTripAndRuntimeOnlyStartStop()
  await testAppLaunchAutoStart()
  console.log('mcp-lifecycle-preferences-test: ok')
}

main().catch((error) => {
  console.error('mcp-lifecycle-preferences-test: failed', error)
  process.exit(1)
})
```

- [ ] **Step 2: Run the regression to verify it fails**

Run: `npx tsx scripts/mcp-lifecycle-preferences-test.ts`

Expected: FAIL because `src/main/core/MCPLifecycle.ts` does not exist yet, and the current `handleMcpStart()` / `handleMcpStop()` still write `enabled` into persisted config.

- [ ] **Step 3: Commit the failing regression**

```bash
git add scripts/mcp-lifecycle-preferences-test.ts
git commit -m "test: cover mcp lifecycle preferences"
```

### Task 2: Implement main-process lifecycle preferences

**Files:**
- Create: `src/main/core/MCPLifecycle.ts`
- Modify: `src/main/core/MCPConfigManager.ts`
- Modify: `src/main/Application.ts`
- Modify: `src/main/core/IPCHandler.ts`
- Test: `scripts/mcp-lifecycle-preferences-test.ts`
- Verify: `scripts/mcp-regression-test.ts`

- [ ] **Step 1: Add the app-launch MCP lifecycle helper**

```ts
// src/main/core/MCPLifecycle.ts
export async function startMcpOnLaunchIfNeeded(
  mcpConfigManager: { getConfig: (key?: string, defaultValue?: any) => any },
  mcpServer: { start: () => Promise<any> },
  onError: (error: unknown) => void = (error) => {
    console.log('mcp auto-start error: ', error)
  }
) {
  const autoStart = !!mcpConfigManager.getConfig('autoStart', false)
  if (!autoStart) {
    return false
  }
  try {
    await mcpServer.start()
    return true
  } catch (error) {
    onError(error)
    return false
  }
}
```

- [ ] **Step 2: Replace persisted `enabled` with `autoStart` and `independentService`**

```ts
// src/main/core/MCPConfigManager.ts
export interface MCPConfigOptions {
  autoStart: boolean
  independentService: boolean
  transport: {
    http: boolean
    stdio: boolean
  }
  host: string
  port: number
  token: string
  enabledTools: string[]
  approval: Record<string, 'auto' | 'confirm'>
  allowRemote: boolean
  maskSecrets: boolean
}

// inside defaults:
defaults: {
  autoStart: false,
  independentService: false,
  transport: {
    http: true,
    stdio: false
  },
  host: MCP_DEFAULT_HOST,
  port: MCP_DEFAULT_PORT,
  token: '',
  enabledTools: [...MCP_DEFAULT_ENABLED_TOOLS],
  approval: { ...MCP_DEFAULT_APPROVAL },
  allowRemote: false,
  maskSecrets: false
}
```

- [ ] **Step 3: Wire app-launch auto-start and keep IPC start/stop runtime-only**

```ts
// src/main/Application.ts
import { startMcpOnLaunchIfNeeded } from './core/MCPLifecycle'

// inside initForkManager(), after mcpServer creation + ipc dependency update:
this.mcpServer = new MCPServer(this.forkManager, this.mcpConfigManager, this.configManager)
this.ipcHandler.updateDependencies({ forkManager: this.forkManager, mcpServer: this.mcpServer })
startMcpOnLaunchIfNeeded(this.mcpConfigManager, this.mcpServer).catch(() => {})
```

```ts
// src/main/core/IPCHandler.ts
private handleMcpStart(command: string, key: string) {
  const server = this.deps.mcpServer
  const mcpConfig = this.deps.mcpConfigManager
  if (!server || !mcpConfig) {
    this.sendToMainWindow(command, key, { code: 1, msg: 'MCP not initialized' })
    return
  }
  server
    .start()
    .then((res) => {
      this.sendToMainWindow(command, key, { code: 0, data: res })
    })
    .catch((e: any) => {
      this.sendToMainWindow(command, key, { code: 1, msg: `${e?.message ?? e}` })
    })
}

private handleMcpStop(command: string, key: string) {
  const server = this.deps.mcpServer
  const mcpConfig = this.deps.mcpConfigManager
  if (!server || !mcpConfig) {
    this.sendToMainWindow(command, key, { code: 1, msg: 'MCP not initialized' })
    return
  }
  server
    .stop()
    .then((res) => {
      this.sendToMainWindow(command, key, { code: 0, data: res })
    })
    .catch((e: any) => {
      this.sendToMainWindow(command, key, { code: 1, msg: `${e?.message ?? e}` })
    })
}
```

- [ ] **Step 4: Run the new lifecycle regression**

Run: `npx tsx scripts/mcp-lifecycle-preferences-test.ts`

Expected: PASS with `mcp-lifecycle-preferences-test: ok`

- [ ] **Step 5: Run existing MCP regression coverage**

Run: `npx tsx scripts/mcp-regression-test.ts`

Expected: PASS with `mcp regression tests passed`

- [ ] **Step 6: Commit the main-process lifecycle changes**

```bash
git add src/main/core/MCPLifecycle.ts src/main/core/MCPConfigManager.ts src/main/Application.ts src/main/core/IPCHandler.ts scripts/mcp-lifecycle-preferences-test.ts
git commit -m "fix: decouple mcp lifecycle preferences"
```

### Task 3: Add a failing renderer group-participation regression

**Files:**
- Create: `scripts/mcp-group-service-test.ts`
- Read: `src/render/components/Aside/Index.vue`
- Read: `src/render/components/MCP/ASide.ts`
- Read: `docs/superpowers/specs/2026-06-29-mcp-independent-service-design.md`

- [ ] **Step 1: Write the failing regression script**

```ts
import assert from 'node:assert/strict'
import {
  getGroupManagedServiceEntries,
  getGroupManagedTypeFlags,
  isGroupManagedServiceModule
} from '../src/render/components/Aside/groupService'

function makeService(participatesInGroup?: boolean, running = false, fetching = false) {
  return {
    groupDo: () => [],
    switchChange() {},
    serviceRunning: running,
    serviceFetching: fetching,
    serviceDisabled: false,
    showItem: true,
    participatesInGroup
  }
}

async function main() {
  const serviceModules = {
    nginx: makeService(true, false, false),
    mcp: makeService(false, true, true)
  }

  assert.equal(isGroupManagedServiceModule(serviceModules.nginx as any), true)
  assert.equal(isGroupManagedServiceModule(serviceModules.mcp as any), false)
  assert.equal(isGroupManagedServiceModule(makeService(undefined) as any), true)

  const groupFlags = getGroupManagedTypeFlags(
    [
      { typeFlag: 'nginx', isService: true },
      { typeFlag: 'mcp', isService: true },
      { typeFlag: 'git', isService: false }
    ] as any,
    { nginx: true, mcp: true },
    serviceModules as any
  )

  assert.deepEqual(groupFlags, ['nginx'])

  const groupEntries = getGroupManagedServiceEntries(serviceModules as any)
  assert.deepEqual(groupEntries.map((entry) => entry.typeFlag), ['nginx'])
  assert.equal(groupEntries.some((entry) => !!entry.module.serviceRunning), false)

  console.log('mcp-group-service-test: ok')
}

main().catch((error) => {
  console.error('mcp-group-service-test: failed', error)
  process.exit(1)
})
```

- [ ] **Step 2: Run the regression to verify it fails**

Run: `npx tsx scripts/mcp-group-service-test.ts`

Expected: FAIL because `src/render/components/Aside/groupService.ts` does not exist yet.

- [ ] **Step 3: Commit the failing regression**

```bash
git add scripts/mcp-group-service-test.ts
git commit -m "test: cover mcp group participation"
```

### Task 4: Implement renderer group filtering

**Files:**
- Create: `src/render/components/Aside/groupService.ts`
- Modify: `src/render/core/ASide.ts`
- Modify: `src/render/components/MCP/ASide.ts`
- Modify: `src/render/components/Aside/Index.vue`
- Test: `scripts/mcp-group-service-test.ts`

- [ ] **Step 1: Add pure helper functions for group participation**

```ts
// src/render/components/Aside/groupService.ts
import type { AppServiceModuleItem } from '@/core/ASide'
import type { AppModuleItem } from '@/core/type'

export function isGroupManagedServiceModule(serviceModule?: AppServiceModuleItem) {
  return serviceModule?.participatesInGroup !== false
}

export function getGroupManagedTypeFlags(
  modules: Array<Pick<AppModuleItem, 'typeFlag' | 'isService'>>,
  showItem: Record<string, boolean | undefined> | undefined,
  serviceModules: Partial<Record<string, AppServiceModuleItem | undefined>>
) {
  return modules
    .filter((module) => module.isService && showItem?.[module.typeFlag] !== false)
    .filter((module) => isGroupManagedServiceModule(serviceModules[module.typeFlag]))
    .map((module) => module.typeFlag)
}

export function getGroupManagedServiceEntries(
  serviceModules: Partial<Record<string, AppServiceModuleItem | undefined>>
) {
  return Object.entries(serviceModules)
    .filter(([, module]) => !!module && isGroupManagedServiceModule(module))
    .map(([typeFlag, module]) => ({
      typeFlag,
      module: module!
    }))
}
```

- [ ] **Step 2: Extend MCP service-module metadata and route the aside through the helper**

```ts
// src/render/core/ASide.ts
export interface AppServiceModuleItem {
  groupDo: (isRunning: boolean) => Array<Promise<string | boolean>>
  switchChange: () => void
  serviceRunning: boolean
  serviceFetching: boolean
  serviceDisabled: boolean
  showItem: boolean
  participatesInGroup?: boolean
}
```

```ts
// src/render/components/MCP/ASide.ts
const participatesInGroup = computed(() => {
  return !MCPSetup.config.independentService
})

const groupDo = (isRunning: boolean): Array<Promise<string | boolean>> => {
  if (MCPSetup.starting || !participatesInGroup.value) {
    return []
  }
  return [isRunning ? MCPSetup.stop() : MCPSetup.start()]
}

AppServiceModule[flag] = {
  groupDo,
  switchChange,
  serviceRunning,
  serviceFetching,
  serviceDisabled,
  showItem,
  participatesInGroup
} as any
```

```ts
// src/render/components/Aside/Index.vue
import {
  getGroupManagedServiceEntries,
  getGroupManagedTypeFlags
} from '@/components/Aside/groupService'

const groupManagedTypeFlags = computed(() => {
  return getGroupManagedTypeFlags(platformAppModules.value as any, showItem.value, AppServiceModule as any)
})

const groupManagedServiceModules = computed(() => {
  return getGroupManagedServiceEntries(AppServiceModule as any).map((entry) => entry.module)
})

const asideServiceShowModule = computed(() => {
  return groupManagedTypeFlags.value.map((f) => AppServiceModule?.[f]).filter((f) => !!f)
})

const serviceShowSystem = computed(() => {
  return groupManagedTypeFlags.value
    .filter((f) => !['php', 'php-fpm'].includes(f))
    .map((f) => brewStore.module(f).installed)
    .flat()
})

const noGroupStart = computed(() => {
  const a = groupManagedTypeFlags.value.every((typeFlag) => {
    const appModule = platformAppModules.value.find((m) => m.typeFlag === typeFlag)
    const serviceModule = AppServiceModule?.[typeFlag]
    if (appModule?.moduleType === 'language' && typeFlag !== 'php-fpm') {
      return serviceModule?.serviceDisabled !== false
    }
    const versionFlag = typeFlag === 'php-fpm' ? 'php' : typeFlag
    const v = brewStore.currentVersion(versionFlag)
    if (!v) {
      return true
    }
    return appStore.phpGroupStart?.[v.bin] === false
  })
  const b = serviceShowCustomer.value.length === 0
  return a && b
})

const groupDisabled = computed(() => {
  const modules = groupManagedServiceModules.value
  const allDisabled = modules.every((m) => !!m?.serviceDisabled)
  const running = modules.some((m) => !!m?.serviceFetching)
  return (
    allDisabled ||
    running ||
    !appStore.versionInitiated ||
    noGroupStart.value ||
    serviceShowCustomer.value.some((s) => s.running)
  )
})
```

- [ ] **Step 3: Run the renderer group regression**

Run: `npx tsx scripts/mcp-group-service-test.ts`

Expected: PASS with `mcp-group-service-test: ok`

- [ ] **Step 4: Commit the group-filtering changes**

```bash
git add src/render/components/Aside/groupService.ts src/render/core/ASide.ts src/render/components/MCP/ASide.ts src/render/components/Aside/Index.vue scripts/mcp-group-service-test.ts
git commit -m "fix: skip independent mcp in group controls"
```

### Task 5: Implement MCP lifecycle switches and locale copy

**Files:**
- Modify: `src/render/components/MCP/setup.ts`
- Modify: `src/render/components/MCP/Service.vue`
- Modify: `src/lang/en/mcp.json`
- Modify: `src/lang/zh/mcp.json`
- Verify: `scripts/mcp-lifecycle-preferences-test.ts`
- Verify: `scripts/mcp-group-service-test.ts`
- Verify: `scripts/mcp-regression-test.ts`

- [ ] **Step 1: Update MCP renderer config state**

```ts
// src/render/components/MCP/setup.ts
export interface MCPConfig {
  autoStart: boolean
  independentService: boolean
  transport: { http: boolean; stdio: boolean }
  host: string
  port: number
  token: string
  enabledTools: string[]
  approval: Record<string, 'auto' | 'confirm'>
  allowRemote: boolean
  maskSecrets: boolean
}

config: MCPConfig = {
  autoStart: false,
  independentService: false,
  transport: { http: true, stdio: false },
  host: '127.0.0.1',
  port: 7682,
  token: '',
  enabledTools: [...ALL_TOOLS],
  approval: {
    start_service: 'confirm',
    stop_service: 'confirm',
    restart_service: 'confirm',
    create_site: 'confirm',
    update_site: 'confirm',
    delete_site: 'confirm',
    install_service: 'confirm'
  },
  allowRemote: false,
  maskSecrets: false
}
```

- [ ] **Step 2: Add the two switches to the MCP service page**

```vue
<!-- src/render/components/MCP/Service.vue -->
<el-form-item>
  <div class="w-full flex items-center justify-between gap-4">
    <div class="flex flex-col gap-1">
      <span>{{ I18nT('mcp.autoStart') }}</span>
      <p class="text-xs text-gray-500">{{ I18nT('mcp.autoStartTip') }}</p>
    </div>
    <el-switch v-model="MCPSetup.config.autoStart" @change="onLifecycleChange" />
  </div>
</el-form-item>

<el-form-item>
  <div class="w-full flex items-center justify-between gap-4">
    <div class="flex flex-col gap-1">
      <span>{{ I18nT('mcp.independentService') }}</span>
      <p class="text-xs text-gray-500">{{ I18nT('mcp.independentServiceTip') }}</p>
    </div>
    <el-switch v-model="MCPSetup.config.independentService" @change="onLifecycleChange" />
  </div>
</el-form-item>
```

```ts
// src/render/components/MCP/Service.vue
const onLifecycleChange = () => {
  MCPSetup.saveConfig({
    autoStart: MCPSetup.config.autoStart,
    independentService: MCPSetup.config.independentService
  })
}
```

- [ ] **Step 3: Add locale copy**

```json
// src/lang/en/mcp.json
{
  "autoStart": "Auto Start",
  "autoStartTip": "Start the MCP Server automatically when FlyEnv launches.",
  "independentService": "Independent Service",
  "independentServiceTip": "When enabled, group start/stop will skip the MCP Server."
}
```

```json
// src/lang/zh/mcp.json
{
  "autoStart": "自动启动",
  "autoStartTip": "开启后，FlyEnv 启动时会自动启动 MCP 服务。",
  "independentService": "独立服务",
  "independentServiceTip": "开启后，群组启动/关闭会跳过 MCP 服务。"
}
```

- [ ] **Step 4: Run automated regressions**

Run: `npx tsx scripts/mcp-lifecycle-preferences-test.ts`

Expected: PASS with `mcp-lifecycle-preferences-test: ok`

Run: `npx tsx scripts/mcp-group-service-test.ts`

Expected: PASS with `mcp-group-service-test: ok`

Run: `npx tsx scripts/mcp-regression-test.ts`

Expected: PASS with `mcp regression tests passed`

- [ ] **Step 5: Run a manual MCP UI smoke check**

Run: `yarn dev`

Expected:
- FlyEnv launches normally.
- On the MCP service page, `自动启动` and `独立服务` switches are visible and persist immediately.
- With `独立服务` enabled and MCP running, clicking the global group switch does not stop MCP.
- With `自动启动` enabled, quitting and relaunching FlyEnv brings MCP back up without opening the MCP page first.

- [ ] **Step 6: Commit the renderer/UI changes**

```bash
git add src/render/components/MCP/setup.ts src/render/components/MCP/Service.vue src/lang/en/mcp.json src/lang/zh/mcp.json
git commit -m "feat: add mcp lifecycle preferences"
```
