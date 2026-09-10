import assert from 'node:assert/strict'
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
  handleCompleteModuleOnboardingRequest
} from '../src/main/core/ModuleOnboardingConfig'

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
console.log = originalConsoleLog
console.warn = originalConsoleWarn
