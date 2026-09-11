import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { buildSync } from 'esbuild'
import type ConfigManager from '../src/main/core/ConfigManager'
import { compileScript, compileStyleAsync, compileTemplate, parse } from '@vue/compiler-sfc'
import { ref } from 'vue'
import { BuiltInLocaleCatalog } from '../src/lang/catalog'
import {
  MODULE_ONBOARDING_VERSION,
  initialModuleOnboardingVersion
} from '../src/shared/ModuleOnboarding'
import type { AllAppModule } from '../src/render/core/type'
import {
  buildAllVisible,
  buildPresetVisibility,
  collectPresetFlags,
  MODULE_ONBOARDING_FOUNDATION_FLAGS,
  MODULE_STACK_PRESETS
} from '../src/render/components/ModuleOnboarding/presets'
import { persistModuleOnboarding } from '../src/render/components/ModuleOnboarding/persistence'
import {
  completeModuleOnboardingConfig,
  handleCompleteModuleOnboardingRequest,
  protectModuleOnboardingConfigPatch
} from '../src/main/core/ModuleOnboardingConfig'
import { createModuleOnboardingStartupGate } from '../src/render/components/ModuleOnboarding/startupGate'

const onboardingLocaleKeys = [
  'title',
  'description',
  'selectedCount',
  'apply',
  'customize',
  'showAll',
  'saveFailed'
]
for (const { sourceDir } of Object.values(BuiltInLocaleCatalog)) {
  const setup = JSON.parse(
    readFileSync(new URL(`../src/lang/${sourceDir}/setup.json`, import.meta.url), 'utf8')
  )
  const messages = setup.moduleOnboarding
  assert.ok(
    messages && typeof messages === 'object' && !Array.isArray(messages),
    `${sourceDir}: setup.moduleOnboarding must be an object`
  )
  assert.deepEqual(
    Object.keys(messages).sort(),
    [...onboardingLocaleKeys].sort(),
    `${sourceDir}: onboarding must contain exactly the seven required keys`
  )
  for (const key of onboardingLocaleKeys) {
    assert.equal(typeof messages[key], 'string', `${sourceDir}: ${key} must be a string`)
    assert.ok(messages[key].trim(), `${sourceDir}: ${key} must not be empty`)
    assert.deepEqual(
      messages[key].match(/\{[^{}]*\}/g) ?? [],
      key === 'selectedCount' ? ['{count}'] : [],
      `${sourceDir}: ${key} must preserve the expected interpolation placeholders`
    )
  }
}

const onboardingComponentSource = readFileSync(
  new URL('../src/render/components/ModuleOnboarding/index.vue', import.meta.url),
  'utf8'
)
const onboardingComponent = parse(onboardingComponentSource, {
  filename: 'src/render/components/ModuleOnboarding/index.vue'
})
assert.deepEqual(onboardingComponent.errors, [])
assert.ok(onboardingComponent.descriptor.scriptSetup)
assert.ok(onboardingComponent.descriptor.template)
const onboardingScript = compileScript(onboardingComponent.descriptor, {
  id: 'module-onboarding'
})
const onboardingTemplate = compileTemplate({
  id: 'module-onboarding',
  filename: 'src/render/components/ModuleOnboarding/index.vue',
  source: onboardingComponent.descriptor.template.content,
  compilerOptions: { bindingMetadata: onboardingScript.bindings }
})
assert.deepEqual(onboardingTemplate.errors, [])
for (const style of onboardingComponent.descriptor.styles) {
  const onboardingStyle = await compileStyleAsync({
    id: 'module-onboarding',
    filename: 'src/render/components/ModuleOnboarding/index.vue',
    source: style.content,
    scoped: style.scoped,
    preprocessLang: style.lang as 'scss'
  })
  assert.deepEqual(onboardingStyle.errors, [])
}

const appComponentSource = readFileSync(new URL('../src/render/App.vue', import.meta.url), 'utf8')
const appComponent = parse(appComponentSource, { filename: 'src/render/App.vue' })
assert.deepEqual(appComponent.errors, [])
assert.ok(appComponent.descriptor.scriptSetup)
assert.ok(appComponent.descriptor.template)
const appScript = compileScript(appComponent.descriptor, { id: 'app' })
const appTemplate = compileTemplate({
  id: 'app',
  filename: 'src/render/App.vue',
  source: appComponent.descriptor.template.content,
  compilerOptions: { bindingMetadata: appScript.bindings }
})
assert.deepEqual(appTemplate.errors, [])
for (const style of appComponent.descriptor.styles) {
  const appStyle = await compileStyleAsync({
    id: 'app',
    filename: 'src/render/App.vue',
    source: style.content,
    scoped: style.scoped,
    preprocessLang: style.lang as 'scss'
  })
  assert.deepEqual(appStyle.errors, [])
}

const createStartupHarness = (storedVersion: number, readyAtStart: boolean) => {
  let ready = readyAtStart
  let initialized = false
  let initializationCount = 0
  const navigationErrors: unknown[] = []
  const gate = createModuleOnboardingStartupGate({
    storedVersion,
    currentVersion: MODULE_ONBOARDING_VERSION,
    initialize: async () => {
      if (initialized || !ready) return
      initialized = true
      initializationCount += 1
    },
    onPreparationError: (error) => navigationErrors.push(error)
  })
  return {
    gate,
    navigationErrors,
    initializationCount: () => initializationCount,
    markReady: () => {
      ready = true
    }
  }
}

const existingInstall = createStartupHarness(MODULE_ONBOARDING_VERSION, true)
assert.equal(existingInstall.gate.onboardingRequired, false)
assert.equal(existingInstall.gate.onboardingResolved.value, true)
await existingInstall.gate.initializeWhenAllowed()
assert.equal(existingInstall.initializationCount(), 1)

for (const ordering of ['ready-before-mount', 'ready-after-mount'] as const) {
  const freshInstall = createStartupHarness(0, ordering === 'ready-before-mount')
  assert.equal(freshInstall.gate.onboardingRequired, true)
  assert.equal(freshInstall.gate.onboardingResolved.value, false)
  await freshInstall.gate.initializeWhenAllowed()
  if (ordering === 'ready-after-mount') freshInstall.markReady()
  await freshInstall.gate.initializeWhenAllowed()
  assert.equal(freshInstall.initializationCount(), 0)
  await freshInstall.gate.completeOnboarding()
  assert.equal(freshInstall.initializationCount(), 1)
  await freshInstall.gate.initializeWhenAllowed()
  await freshInstall.gate.initializeWhenAllowed()
  assert.equal(freshInstall.initializationCount(), 1)
}

const resolvedBeforeReady = createStartupHarness(0, false)
await resolvedBeforeReady.gate.completeOnboarding()
assert.equal(resolvedBeforeReady.initializationCount(), 0)
resolvedBeforeReady.markReady()
await resolvedBeforeReady.gate.initializeWhenAllowed()
await resolvedBeforeReady.gate.initializeWhenAllowed()
assert.equal(resolvedBeforeReady.initializationCount(), 1)

const persistedMarker = ref(0)
const markerRace = createStartupHarness(persistedMarker.value, true)
persistedMarker.value = MODULE_ONBOARDING_VERSION
assert.equal(markerRace.gate.onboardingRequired, true)
assert.equal(markerRace.gate.onboardingResolved.value, false)
await markerRace.gate.completeOnboarding()
assert.equal(markerRace.gate.onboardingResolved.value, true)
assert.equal(markerRace.initializationCount(), 1)

const customizeSequence: string[] = []
const customizeGate = createModuleOnboardingStartupGate({
  storedVersion: 0,
  currentVersion: MODULE_ONBOARDING_VERSION,
  initialize: async () => {
    customizeSequence.push('initialize')
  }
})
await customizeGate.completeOnboarding(async () => {
  assert.equal(customizeGate.onboardingResolved.value, true)
  customizeSequence.push('select-module-settings')
  await Promise.resolve()
  customizeSequence.push('navigate-setup')
})
assert.equal(customizeGate.onboardingResolved.value, true)
assert.deepEqual(customizeSequence, ['select-module-settings', 'navigate-setup', 'initialize'])

const navigationFailure = new Error('navigation failed')
const failureSequence: string[] = []
const failedNavigationGate = createModuleOnboardingStartupGate({
  storedVersion: 0,
  currentVersion: MODULE_ONBOARDING_VERSION,
  initialize: async () => {
    failureSequence.push('initialize')
  },
  onPreparationError: (error) => {
    assert.equal(error, navigationFailure)
    failureSequence.push('report-navigation-error')
  }
})
await failedNavigationGate.completeOnboarding(async () => {
  failureSequence.push('navigate-setup')
  throw navigationFailure
})
assert.deepEqual(failureSequence, ['navigate-setup', 'report-navigation-error', 'initialize'])

assert.equal(MODULE_ONBOARDING_VERSION, 1)
assert.equal(initialModuleOnboardingVersion(false), 0)
assert.equal(initialModuleOnboardingVersion(true), 1)

assert.deepEqual(MODULE_ONBOARDING_FOUNDATION_FLAGS, ['startup-group', 'hosts', 'tools'])
assert.equal(MODULE_STACK_PRESETS[0]?.id, 'php')
assert.equal(MODULE_STACK_PRESETS.length, 8)

const phpPythonFlags = collectPresetFlags(['php', 'python'])
for (const flag of [
  'php',
  'php-fpm',
  'python',
  'node',
  'mysql',
  'mariadb',
  'postgresql',
  'nginx',
  'redis',
  'startup-group',
  'hosts',
  'tools'
] as const) {
  assert.equal(phpPythonFlags.has(flag), true)
}
assert.equal(phpPythonFlags.size, 13)

const current = { linuxOnly: false, customerX: false }
const supported = ['php', 'python', 'redis'] as AllAppModule[]
assert.deepEqual(buildPresetVisibility(current, supported, []), {
  linuxOnly: false,
  customerX: false,
  php: false,
  python: false,
  redis: false
})

assert.deepEqual(
  buildPresetVisibility(
    { customerX: false },
    ['php', 'startup-group', 'hosts', 'tools'] as AllAppModule[],
    ['php']
  ),
  { customerX: false, php: true, 'startup-group': true, hosts: true, tools: true }
)

assert.deepEqual(
  buildAllVisible({ customerX: false }, ['php', 'python', 'redis'] as AllAppModule[]),
  { customerX: false, php: true, python: true, redis: true }
)

const successConfig = {
  moduleOnboardingVersion: 0,
  setup: { common: { showItem: { php: true } } }
}
const nextVisibility = { php: false, python: true }
let releaseSave!: () => void
const savePending = new Promise<void>((resolve) => {
  releaseSave = resolve
})
let receivedRequest: unknown
const persistencePending = persistModuleOnboarding(
  successConfig,
  nextVisibility,
  async (request) => {
    receivedRequest = request
    assert.deepEqual(request, {
      moduleOnboardingVersion: 1,
      showItem: { php: false, python: true }
    })
    assert.notEqual(request.showItem, nextVisibility)
    assert.equal(successConfig.moduleOnboardingVersion, 0)
    assert.deepEqual(successConfig.setup.common.showItem, { php: true })
    await savePending
  }
)
nextVisibility.python = false
assert.deepEqual(receivedRequest, {
  moduleOnboardingVersion: 1,
  showItem: { php: false, python: true }
})
assert.equal(successConfig.moduleOnboardingVersion, 0)
releaseSave()
await persistencePending
assert.equal(successConfig.moduleOnboardingVersion, 1)
assert.deepEqual(successConfig.setup.common.showItem, { php: false, python: true })

const failureVisibility = { php: true }
const failureConfig = {
  moduleOnboardingVersion: 0,
  setup: { common: { showItem: failureVisibility } }
}
await assert.rejects(
  persistModuleOnboarding(failureConfig, { php: false }, async () => {
    throw new Error('disk full')
  }),
  /disk full/
)
assert.equal(failureConfig.moduleOnboardingVersion, 0)
assert.equal(failureConfig.setup.common.showItem, failureVisibility)
assert.deepEqual(failureConfig.setup.common.showItem, { php: true })

const customizeVisibility = { php: true }
const customizeConfig = {
  moduleOnboardingVersion: 0,
  setup: { common: { showItem: customizeVisibility } }
}
let customizeRequest: unknown
await persistModuleOnboarding(customizeConfig, undefined, async (request) => {
  customizeRequest = request
  assert.equal(customizeConfig.moduleOnboardingVersion, 0)
})
assert.deepEqual(customizeRequest, { moduleOnboardingVersion: 1 })
assert.equal(customizeConfig.moduleOnboardingVersion, 1)
assert.equal(customizeConfig.setup.common.showItem, customizeVisibility)

for (const invalidRequest of [
  undefined,
  null,
  [],
  {},
  { moduleOnboardingVersion: 0 },
  { moduleOnboardingVersion: 2 },
  { moduleOnboardingVersion: 1, showItem: null },
  { moduleOnboardingVersion: 1, showItem: [] },
  { moduleOnboardingVersion: 1, showItem: 'php' },
  { moduleOnboardingVersion: 1, showItem: { php: 1 } },
  { moduleOnboardingVersion: 1, showItem: { php: true, python: 'yes' } }
]) {
  let invalidSaveCalls = 0
  const result = handleCompleteModuleOnboardingRequest(invalidRequest, {
    completeModuleOnboarding: () => {
      invalidSaveCalls += 1
    }
  })
  assert.equal(result.code, 1)
  assert.equal(invalidSaveCalls, 0)
}

let savedVisibility: unknown
let validSaveCalls = 0
assert.deepEqual(
  handleCompleteModuleOnboardingRequest(
    { moduleOnboardingVersion: 1, showItem: { php: false, python: true } },
    {
      completeModuleOnboarding: (showItem) => {
        validSaveCalls += 1
        savedVisibility = showItem
      }
    }
  ),
  { code: 0, data: true }
)
assert.equal(validSaveCalls, 1)
assert.deepEqual(savedVisibility, { php: false, python: true })

assert.deepEqual(
  handleCompleteModuleOnboardingRequest(
    { moduleOnboardingVersion: 1 },
    {
      completeModuleOnboarding: (showItem) => {
        assert.equal(showItem, undefined)
      }
    }
  ),
  { code: 0, data: true }
)

assert.deepEqual(
  handleCompleteModuleOnboardingRequest(
    { moduleOnboardingVersion: 1 },
    {
      completeModuleOnboarding: () => {
        throw new Error('write failed')
      }
    }
  ),
  { code: 1, msg: 'write failed' }
)
assert.deepEqual(handleCompleteModuleOnboardingRequest({ moduleOnboardingVersion: 1 }), {
  code: 1,
  msg: 'Config manager is unavailable'
})

const currentSetup = {
  common: { showItem: { php: true }, untouched: 'common' },
  proxy: { on: false }
}
const configVisibility = { php: false, python: true }
const configPatches: unknown[] = []
completeModuleOnboardingConfig((patch) => configPatches.push(patch), currentSetup, configVisibility)
configVisibility.python = false
assert.equal(configPatches.length, 1)
assert.deepEqual(configPatches[0], {
  moduleOnboardingVersion: 1,
  setup: {
    common: {
      showItem: { php: false, python: true },
      untouched: 'common'
    },
    proxy: { on: false }
  }
})
assert.deepEqual(currentSetup.common.showItem, { php: true })

const markerOnlyPatches: unknown[] = []
completeModuleOnboardingConfig((patch) => markerOnlyPatches.push(patch), currentSetup, undefined)
assert.deepEqual(markerOnlyPatches, [{ moduleOnboardingVersion: 1 }])

const protectedCurrent = {
  moduleOnboardingVersion: 1,
  setup: { common: { showItem: { php: false, python: true }, theme: 'dark' }, license: 'old' }
}
const protectedIncoming = {
  moduleOnboardingVersion: 0,
  setup: { common: { showItem: { php: true, python: false }, theme: 'light' }, license: 'new' }
}
const currentBeforeProtection = structuredClone(protectedCurrent)
const incomingBeforeProtection = structuredClone(protectedIncoming)
const protectedPatch = protectModuleOnboardingConfigPatch(protectedCurrent, protectedIncoming)
assert.deepEqual(protectedPatch, {
  moduleOnboardingVersion: 1,
  setup: { common: { showItem: { php: false, python: true }, theme: 'light' }, license: 'new' }
})
assert.deepEqual(protectedCurrent, currentBeforeProtection)
assert.deepEqual(protectedIncoming, incomingBeforeProtection)
protectedPatch.setup!.common.showItem.php = true
assert.deepEqual(protectedCurrent, currentBeforeProtection)

// Exercise the real main-process write boundary without opening a user profile.
const configManagerBundle = buildSync({
  entryPoints: ['src/main/core/ConfigManager.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  packages: 'external',
  write: false
}).outputFiles[0]!.text
const configManagerModule = { exports: {} as { default: typeof ConfigManager } }
const requireDependency = createRequire(import.meta.url)
new Function('require', 'module', 'exports', configManagerBundle)(
  (name: string) =>
    name === 'electron' || name === 'electron-store' ? {} : requireDependency(name),
  configManagerModule,
  configManagerModule.exports
)
const createConfigWriteHarness = (initial: Record<string, any>) => {
  let persisted = structuredClone(initial)
  const manager = Object.create(configManagerModule.exports.default.prototype) as ConfigManager
  manager.config = {
    get store() {
      return structuredClone(persisted)
    },
    get: (key: string) => structuredClone(persisted[key]),
    set: (key: string | object, value?: unknown) => {
      persisted = {
        ...persisted,
        ...structuredClone(typeof key === 'string' ? { [key]: value } : key)
      }
    }
  } as ConfigManager['config']
  return { manager, read: () => structuredClone(persisted) }
}

type RendererReceive = (event: unknown, command: string, key: string, response: unknown) => void
let rendererReceive!: RendererReceive
const rendererSends: Array<{ command: string; key: string; args: unknown[] }> = []
const originalConsoleLog = console.log
const originalConsoleWarn = console.warn
console.log = () => undefined
console.warn = () => undefined
;(globalThis as any).window = {
  FlyEnvNodeAPI: {
    ipcReceiveFromMain(callback: RendererReceive) {
      rendererReceive = callback
    },
    ipcSendToMain(command: string, key: string, ...args: unknown[]) {
      rendererSends.push({ command, key, args })
    }
  }
}

const { app: rendererApp } = await import('../src/render/util/NodeFn')
const rendererSuccess = rendererApp.completeModuleOnboarding({
  moduleOnboardingVersion: 1,
  showItem: { php: false }
})
assert.deepEqual(rendererSends[0]?.args, [
  'app',
  'completeModuleOnboarding',
  { moduleOnboardingVersion: 1, showItem: { php: false } }
])
rendererReceive({}, 'command', rendererSends[0]!.key, { code: 0, data: true })
assert.equal(await rendererSuccess, true)

const rendererFailure = rendererApp.completeModuleOnboarding({ moduleOnboardingVersion: 1 })
rendererReceive({}, 'command', rendererSends[1]!.key, { code: 1, msg: 'write failed' })
await assert.rejects(rendererFailure, /write failed/)

;(globalThis as any).localStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined
}
const { createPinia, setActivePinia } = await import('pinia')
const { AppStore } = await import('../src/render/store/app')
setActivePinia(createPinia())
const appStore = AppStore()
assert.equal(appStore.config.moduleOnboardingVersion, 1)

const initConfigPending = appStore.initConfig()
const initConfigSend = rendererSends.at(-1)!
assert.deepEqual(initConfigSend.args, ['app', 'getConfig'])
rendererReceive({}, 'command', initConfigSend.key, {
  server: {},
  password: '',
  moduleOnboardingVersion: 0,
  setup: {
    common: { showItem: { php: true } },
    hosts: { write: true },
    proxy: { on: false, fastProxy: '', proxy: '' },
    lang: '',
    autoCheck: false,
    forceStart: false,
    showAIRobot: true,
    phpBrewInitiated: false,
    mongodbBrewInitiated: false,
    editorConfig: { theme: 'auto', fontSize: 16, lineHeight: 2 },
    currentNodeTool: 'default'
  },
  httpServe: []
})
await initConfigPending
assert.equal(appStore.config.moduleOnboardingVersion, 0)

const saveConfigPending = appStore.saveConfig()
const saveConfigSend = rendererSends.at(-1)!
assert.equal(saveConfigSend.command, 'application:save-preference')
assert.equal((saveConfigSend.args[0] as any).moduleOnboardingVersion, 0)
rendererReceive({}, 'command', saveConfigSend.key, true)
await saveConfigPending

const configRace = createConfigWriteHarness(JSON.parse(JSON.stringify(appStore.config)))
const onboardingSavePending = persistModuleOnboarding(
  appStore.config,
  { php: false, python: true },
  rendererApp.completeModuleOnboarding
)
const onboardingSaveSend = rendererSends.at(-1)!
const onboardingResult = handleCompleteModuleOnboardingRequest(
  onboardingSaveSend.args[2],
  configRace.manager
)
assert.deepEqual(onboardingResult, { code: 0, data: true })
assert.equal(configRace.read().moduleOnboardingVersion, 1)
assert.equal(appStore.config.moduleOnboardingVersion, 0)

// License initialization can save the old renderer snapshot before the onboarding ACK arrives.
appStore.config.setup.license = 'license-from-initialization'
appStore.config.server = { php: { current: { version: '8.4.0' } } }
const queuedOrdinarySave = appStore.saveConfig()
const queuedOrdinarySend = rendererSends.at(-1)!
const staleSnapshot = queuedOrdinarySend.args[0] as Record<string, any>
const unchangedSnapshot = structuredClone(staleSnapshot)
assert.equal(staleSnapshot.moduleOnboardingVersion, 0)
assert.deepEqual(staleSnapshot.setup.common.showItem, { php: true })
configRace.manager.setConfig(staleSnapshot)
assert.equal(configRace.read().moduleOnboardingVersion, 1, 'stale saves must not reopen onboarding')
assert.deepEqual(configRace.read().setup.common.showItem, { php: false, python: true })
assert.equal(configRace.read().setup.license, 'license-from-initialization')
assert.deepEqual(configRace.read().server, { php: { current: { version: '8.4.0' } } })
assert.deepEqual(staleSnapshot, unchangedSnapshot)
rendererReceive({}, 'command', queuedOrdinarySend.key, true)
await queuedOrdinarySave
rendererReceive({}, 'command', onboardingSaveSend.key, onboardingResult)
await onboardingSavePending
assert.equal(appStore.config.moduleOnboardingVersion, 1)
assert.deepEqual(appStore.config.setup.common.showItem, { php: false, python: true })

const completedConfig = configRace.read()
for (const revision of [1, 2, undefined]) {
  const write = createConfigWriteHarness(completedConfig)
  const patch = {
    ...(revision === undefined ? {} : { moduleOnboardingVersion: revision }),
    setup: { ...completedConfig.setup, common: { showItem: { php: true, python: false } } }
  }
  const originalPatch = structuredClone(patch)
  write.manager.setConfig(patch)
  assert.equal(write.read().moduleOnboardingVersion, revision ?? 1)
  assert.deepEqual(write.read().setup.common.showItem, { php: true, python: false })
  assert.deepEqual(patch, originalPatch)
}
const markerOnlySave = createConfigWriteHarness(completedConfig)
markerOnlySave.manager.setConfig({ moduleOnboardingVersion: 0, password: 'new-password' })
assert.equal(markerOnlySave.read().moduleOnboardingVersion, 1)
assert.deepEqual(markerOnlySave.read().setup, completedConfig.setup)
assert.equal(markerOnlySave.read().password, 'new-password')
markerOnlySave.manager.setConfig('moduleOnboardingVersion', 0)
assert.equal(markerOnlySave.read().moduleOnboardingVersion, 0)

console.log = originalConsoleLog
console.warn = originalConsoleWarn
