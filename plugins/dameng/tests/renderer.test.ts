import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { parse, compileScript } from '@vue/compiler-sfc'
import { createRenderer, defineComponent, h, nextTick, reactive } from 'vue'
import {
  DAMENG_LIMITS,
  DAMENG_INITIAL_STORAGE,
  defaultDamengSettings,
  validateDamengSettings,
  type DamengSettings
} from '../shared'

// Exercise the real singleton class with only the host transport/storage edges
// replaced. Page teardown never participates in operation ownership.
const harness = {
  sent: [] as any[],
  off: [] as string[],
  saved: [] as any[],
  errors: [] as string[],
  successes: [] as string[],
  refreshes: 0,
  savedSettings: undefined as any,
  storageError: false,
  currentInstalled: undefined as any,
  logExists: false,
  logSnapshots: [] as { file: string; exists: boolean }[],
  setupCalls: [] as any[],
  setupResult: false as boolean,
  setupAction: undefined as ((item: any) => Promise<boolean>) | undefined,
  setupWait: undefined as Promise<boolean> | undefined,
  pickerCalls: [] as any[],
  pickerWait: undefined as Promise<unknown> | undefined,
  pickerResult: { canceled: true, filePaths: [] as string[] },
  configError: false,
  configWait: undefined as Promise<unknown> | undefined,
  configSaves: [] as any[],
  app: undefined as any,
  module: undefined as any
}
;(globalThis as any).__damengRenderer = harness
;(globalThis as any).window = { Server: { isWindows: false } }
harness.app = {
  config: { setup: { dameng: { dirs: ['/keep/existing'] } } },
  async saveConfig() {
    if (harness.configWait) return harness.configWait
    if (harness.configError) throw new Error('config save unavailable')
    harness.configSaves.push(JSON.parse(JSON.stringify(this.config)))
    return true
  }
}
harness.module = {
  installed: [],
  installedFetched: true,
  async fetchInstalled() {
    harness.refreshes++
    harness.module.installedFetched = true
  }
}
const sources: Record<string, string> = {
  './setup':
    'export const showSetupDialog = item => { const h=globalThis.__damengRenderer; h.setupCalls.push(item); return h.setupAction ? h.setupAction(item) : h.setupWait ?? Promise.resolve(h.setupResult) }',
  '@/util/Index': 'export const reactiveBind = value => value',
  '@/util/Storage': `const h = globalThis.__damengRenderer;
    export const StorageGetAsync = async () => h.savedSettings;
    export const StorageSetAsync = async (_key, value) => { if (h.storageError) throw new Error('storage unavailable'); h.saved.push(value) }`,
  '@/util/Element': `const h = globalThis.__damengRenderer;
    export const MessageError = value => h.errors.push(value);
    export const MessageSuccess = value => h.successes.push(value)`,
  '@/store/brew':
    'export const BrewStore = () => ({ module: () => globalThis.__damengRenderer.module, currentVersion: () => globalThis.__damengRenderer.currentInstalled })',
  '@/store/app': 'export const AppStore = () => globalThis.__damengRenderer.app',
  '@/util/path-browserify': "export { normalize } from 'pathe'",
  '@/util/NodeFn': `const h = globalThis.__damengRenderer;
    export const dialog = { async showOpenDialog(options) { h.pickerCalls.push(options); return h.pickerWait ?? h.pickerResult } }`,
  '@lang/index': "export const AppI18n = () => ({ global: { locale: 'en' } })",
  '@/util/IPC': `const h = globalThis.__damengRenderer;
    export default { send(channel, action, ...args) {
      const request = { key: String(h.sent.length), channel, action, args, then(cb) { this.callback = cb } };
      h.sent.push(request); return request;
    }, off(key) { h.off.push(key) } }`
}
const result = await build({
  entryPoints: ['plugins/dameng/render/store.ts'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
  plugins: [
    {
      name: 'host-edges',
      setup(builder) {
        builder.onResolve({ filter: /^(?:@|\.\/setup$)/ }, (args) => {
          if (!(args.path in sources)) throw new Error(`Unexpected host dependency ${args.path}`)
          return { path: args.path, namespace: 'mock-host' }
        })
        builder.onLoad({ filter: /.*/, namespace: 'mock-host' }, (args) => ({
          contents: sources[args.path],
          resolveDir: process.cwd()
        }))
      }
    }
  ]
})
const {
  DamengPluginManager,
  copySettings,
  isInitialPasswordValid,
  isCurrentPasswordValid,
  generateInitialPassword,
  initialCredentialError
} = await import(
  `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`
)
const tick = () => new Promise((resolve) => setImmediate(resolve))
const reply = (request: any, code: number, data?: any, msg?: any) =>
  request.callback(request.key, { code, data, msg })

const row = (name: string) => ({
  progress: 0,
  id: name,
  bin: `/dm/${name}/bin/dmserver`,
  appDir: `/dm/${name}`,
  version: '8.1',
  installed: false,
  downing: false
})
const runtime = { initialized: false, installId: 'one' }
const initial = {
  port: 5236,
  pageSize: 8,
  extentSize: 16,
  charset: 1,
  caseSensitive: true,
  bufferMB: 256,
  logSizeMB: 256
}

assert.equal(isInitialPasswordValid('StrongPwd9!'), true)
assert.equal(isInitialPasswordValid('123456_Xpf'), true)
const generated = new Set<string>()
for (let i = 0; i < 100; i++) {
  const password = generateInitialPassword()
  assert.equal(isInitialPasswordValid(password), true)
  generated.add(password)
}
assert.equal(generated.size, 100)
for (const password of ['Short9!', 'NoSymbol999', 'white Space9!', 'BadQuote9!"', 'BadSlash9!\\']) {
  assert.equal(isInitialPasswordValid(password), false)
}
assert.equal(isCurrentPasswordValid('rotated-old-account'), true)
assert.equal(isCurrentPasswordValid('invalid\npassword'), false)

for (const key of ['port', 'bufferMB', 'logSizeMB'] as const) {
  const { min, max } = DAMENG_LIMITS[key]
  for (const value of [min, max]) {
    validateDamengSettings({ ...defaultDamengSettings(), [key]: value })
  }
  for (const value of [min - 1, max + 1, min + 0.5, NaN, Infinity]) {
    assert.throws(() => validateDamengSettings({ ...defaultDamengSettings(), [key]: value }))
  }
}
for (const [key, values] of [
  ['pageSize', DAMENG_LIMITS.pageSizes],
  ['extentSize', DAMENG_LIMITS.extentSizes],
  ['charset', DAMENG_LIMITS.charsets]
] as const) {
  for (const value of values) validateDamengSettings({ ...defaultDamengSettings(), [key]: value })
  assert.throws(() =>
    validateDamengSettings({ ...defaultDamengSettings(), [key]: -1 } as DamengSettings)
  )
}
assert.throws(() =>
  validateDamengSettings({
    ...defaultDamengSettings(),
    caseSensitive: 'true'
  } as unknown as DamengSettings)
)
assert.equal(
  defaultDamengSettings().logSizeMB * DAMENG_INITIAL_STORAGE.redoLogCount +
    DAMENG_INITIAL_STORAGE.tablespaceMB * DAMENG_INITIAL_STORAGE.tablespaceCount,
  896,
  'disk estimate includes MAIN/SYSTEM/ROLL and both redo logs'
)

const manager = new DamengPluginManager(1000)
await manager.init()
for (const key of ['port', 'bufferMB', 'logSizeMB'] as const) {
  for (const value of [DAMENG_LIMITS[key].min, DAMENG_LIMITS[key].max]) {
    await manager.saveSettings(
      { ...defaultDamengSettings(), [key]: value },
      { sysdbaPassword: '', auditorPassword: '' }
    )
  }
  await assert.rejects(
    manager.saveSettings(
      { ...defaultDamengSettings(), [key]: DAMENG_LIMITS[key].min - 1 },
      { sysdbaPassword: '', auditorPassword: '' }
    )
  )
}
harness.saved.splice(0)
await manager.saveSettings(initial, {
  sysdbaPassword: 'StrongPwd9!',
  auditorPassword: 'AuditPwd9!'
})
assert.deepEqual(Object.keys(harness.saved[0]).sort(), Object.keys(initial).sort())
assert.equal(JSON.stringify(harness.saved).includes('StrongPwd9!'), false)

const installRow = row('one')
manager.onlineVersions = [installRow]
const beforeCancelRequests = harness.sent.length
const beforeCancelErrors = harness.errors.length
const cancelPicker = manager.chooseInstallDirectory()
assert.strictEqual(manager.chooseInstallDirectory(), cancelPicker, 'browse is single-flight')
assert.equal(await cancelPicker, undefined, 'native picker cancel does not change the input')
assert.equal(harness.sent.length, beforeCancelRequests, 'browse never validates or installs')
assert.equal(harness.errors.length, beforeCancelErrors, 'cancel is not an operation failure')
assert.deepEqual(harness.pickerCalls[0].properties, [
  'openDirectory',
  'createDirectory',
  'showHiddenFiles'
])
const beforeMissingPath = harness.sent.length
assert.equal(await manager.install(installRow), false, 'fresh installs require explicit input')
assert.equal(harness.sent.length, beforeMissingPath)
for (const path of [
  '/chosen/with space',
  '/chosen/中文',
  '/chosen/has-dot',
  '/chosen/has.dot',
  'relative'
]) {
  assert.equal(await manager.install(row('invalid-characters'), path), false)
}
assert.equal(harness.sent.length, beforeMissingPath, 'invalid syntax never reaches Fork')

harness.pickerResult = { canceled: false, filePaths: ['/chosen/DM'] }
const invalidInstall = manager.install(row('invalid-path'), '/chosen/DM')
await tick()
assert.equal(harness.sent.at(-1).action, 'validateInstallPath')
reply(harness.sent.at(-1), 500, undefined, 'invalid vendor path')
assert.equal(await invalidInstall, false)
assert.equal(
  harness.sent.at(-1).action,
  'validateInstallPath',
  'path validation failure prevents installer IPC'
)

let accepted = 0
const install = manager.install(installRow, '/chosen/DM', () => accepted++)
assert.strictEqual(manager.install(installRow), install, 'duplicate install shares promise')
await tick()
const preflight = harness.sent.at(-1)
assert.equal(preflight.action, 'validateInstallPath')
assert.equal(preflight.args[1], '/chosen/DM')
assert.equal(accepted, 0, 'dialog stays open while validation is pending')
harness.pickerResult.filePaths[0] = '/edited/later'
reply(preflight, 0, { programDir: '/chosen/DM', bin: '/chosen/DM/bin/dmserver' })
await tick()
const request = harness.sent.at(-1)
assert.equal(request.action, 'installSoft')
assert.equal(accepted, 1, 'validation closes the dialog before download')
assert.equal(request.args[1], '/chosen/DM', 'installer retains the chosen directory snapshot')
reply(request, 200, undefined, { progress: 35, downState: 'download' })
assert.equal(manager.state(installRow).busy, true)
assert.equal(installRow.progress, 35)
assert.equal(harness.off.includes(request.key), false, 'progress keeps IPC listener')
assert.strictEqual(manager.install(installRow), install, 'new page shares the existing request')
reply(request, 0, {
  installed: true,
  programDir: '/chosen/DM',
  bin: '/chosen/DM/bin/dmserver',
  warning: 'Media release warning'
})
assert.equal(await install, true)
assert.equal(installRow.installed, true)
assert.equal(installRow.appDir, '/chosen/DM')
assert.equal(installRow.bin, '/chosen/DM/bin/dmserver')
assert.deepEqual(harness.app.config.setup.dameng.dirs, ['/keep/existing', '/chosen/DM'])
assert.equal(harness.configSaves.at(-1).setup.dameng.dirs.at(-1), '/chosen/DM')
assert.strictEqual(
  manager.state(installRow),
  manager.state({ damengRuntime: { installId: 'one' } }),
  'catalog and installed operation identity survives chosen bin changes'
)
assert.equal(
  manager.state(installRow).unknown,
  false,
  'supplementary warning preserves installation success'
)
assert.equal(harness.errors.includes('Media release warning'), true)
assert.equal(installRow.downing, false)
assert.equal(harness.off.filter((key) => key === request.key).length, 1)
reply(request, 200, undefined, { progress: 1 })
assert.equal(installRow.progress, 100, 'late events ignored')

const partial = { ...row('partial-registration'), registrationPending: false }
const partialInstall = manager.install(partial, '/chosen/Partial')
await tick()
reply(harness.sent.at(-1), 0, {
  programDir: '/chosen/Partial',
  bin: '/chosen/Partial/bin/dmserver'
})
await tick()
harness.configError = true
reply(harness.sent.at(-1), 0, {
  installed: true,
  programDir: '/chosen/Partial',
  bin: '/chosen/Partial/bin/dmserver'
})
assert.equal(await partialInstall, false)
harness.configError = false
assert.equal(partial.installed, false)
assert.equal(partial.registrationPending, true)
assert.deepEqual(
  harness.app.config.setup.dameng.dirs,
  ['/keep/existing', '/chosen/DM'],
  'failed config save rolls back only its added path'
)
const requestsBeforeRegister = harness.sent.length
const pickersBeforeRegister = harness.pickerCalls.length
assert.equal(
  await manager.install(partial),
  true,
  'explicit retry only registers the completed installation'
)
assert.equal(harness.sent.length, requestsBeforeRegister)
assert.equal(harness.pickerCalls.length, pickersBeforeRegister)
assert.equal(partial.registrationPending, false)
assert.equal(partial.installed, true)

;(globalThis as any).window.Server.isWindows = true
const windowsPending = {
  ...row('windows-pending'),
  appDir: 'C:\\DM\\Owned',
  registrationPending: true
}
harness.app.config.setup.dameng.dirs.push(null, 'c:/dm/owned/')
assert.equal(await manager.install(windowsPending), true)
assert.equal(
  harness.app.config.setup.dameng.dirs.filter((path: string) => /owned/i.test(path)).length,
  1,
  'Windows registration skips an invalid sibling and deduplicates case, separators and trailing slash'
)
;(globalThis as any).window.Server.isWindows = false

const removedRegistration = harness.app.config.setup.dameng.dirs.indexOf('/chosen/DM')
const catalogWithRegistration = manager.fetchOnlineVersions(true)
await tick()
const catalogSnapshot = harness.sent.at(-1)
assert.equal(catalogSnapshot.action, 'fetchAllOnlineVersion')
harness.app.config.setup.dameng.dirs.splice(removedRegistration, 1)
assert.equal(
  catalogSnapshot.args[0].dameng.dirs.includes('/chosen/DM'),
  true,
  'catalog captures custom paths before an asynchronous edit'
)
reply(catalogSnapshot, 0, [{ ...installRow, installed: true, registrationPending: false }])
await catalogWithRegistration
const catalogAfterRemoval = manager.fetchOnlineVersions(true)
await tick()
assert.equal(harness.sent.at(-1).args[0].dameng.dirs.includes('/chosen/DM'), false)
reply(harness.sent.at(-1), 0, [{ ...installRow, installed: false, registrationPending: true }])
await catalogAfterRemoval
const removedRow = manager.onlineVersions.find((value: any) => value.id === 'one')
assert.equal(
  removedRow.installed,
  false,
  'catalog refresh clears installed flag after custom path removal'
)
assert.equal(removedRow.registrationPending, true)
const beforeReaddRequests = harness.sent.length
assert.equal(await manager.install(removedRow), true)
assert.equal(
  harness.sent.length,
  beforeReaddRequests,
  're-adding the owned custom path never reruns the installer'
)
assert.equal(harness.app.config.setup.dameng.dirs.includes('/chosen/DM'), true)

const saveTimeoutManager = new DamengPluginManager(20)
const hungRegistration = { ...row('hung-registration'), registrationPending: true }
harness.configWait = new Promise(() => {})
const hungSave = saveTimeoutManager.install(hungRegistration)
assert.equal(
  await Promise.race([
    hungSave,
    new Promise((resolve) => setTimeout(() => resolve('no-terminal-result'), 100))
  ]),
  false,
  'missing save callback releases registration with a partial result'
)
harness.configWait = undefined
assert.equal(hungRegistration.registrationPending, true)
assert.equal(harness.app.config.setup.dameng.dirs.includes(hungRegistration.appDir), false)
assert.equal(saveTimeoutManager.state(hungRegistration).busy, false)
assert.equal(
  await saveTimeoutManager.install(hungRegistration),
  true,
  'timed-out config save permits only registration retry'
)

const installed = { ...row('two'), damengRuntime: runtime, run: false }
const params = { ...initial, sysdbaPassword: 'StrongPwd9!', auditorPassword: 'AuditPwd9!' }
const initialize = manager.initialize(installed, params)
params.port = 9999
await tick()
const initRequest = harness.sent.at(-1)
assert.equal(initRequest.args[1].port, 5236, 'initialization request is immutable')
assert.strictEqual(manager.initialize(installed, params), initialize)
reply(initRequest, 500, undefined, 'failed StrongPwd9!')
const refreshesBeforeFailure = harness.refreshes
assert.equal(await initialize, false)
assert.equal(
  harness.refreshes,
  refreshesBeforeFailure + 1,
  'failed initialization refreshes registration-recovery metadata'
)
assert.equal(
  manager.state(installed).error.includes('StrongPwd9!'),
  false,
  'errors redact request credentials'
)
const retry = manager.initialize(installed, { ...params, port: 5236 })
await tick()
const settingsSavedBeforeFreshSuccess = harness.saved.length
reply(harness.sent.at(-1), 0, { initialized: true, resumed: false })
assert.equal(await retry, true, 'known failure releases operation for a safe backend recheck')
assert.equal(
  harness.saved.length,
  settingsSavedBeforeFreshSuccess + 1,
  'confirmed fresh initialization persists its nonsecret defaults'
)
assert.equal(JSON.stringify(harness.saved.at(-1)).includes('StrongPwd9!'), false)

const staleRow = { ...row('stale-registration'), run: false, damengRuntime: { ...runtime } }
const staleSettings = { ...manager.settings }
const staleCredentials = { ...manager.credentials }
const savedBeforeStaleResume = harness.saved.length
const staleResume = manager.initialize(staleRow, {
  ...initial,
  port: 6000,
  sysdbaPassword: 'DifferentPwd9!',
  auditorPassword: 'DifferentAudit9!'
})
await tick()
reply(harness.sent.at(-1), 0, { initialized: true, resumed: true })
assert.equal(await staleResume, true)
assert.deepEqual(
  manager.settings,
  staleSettings,
  'backend recovery result overrides stale fresh-init metadata'
)
assert.deepEqual(
  manager.credentials,
  staleCredentials,
  'backend recovery never adopts newly edited passwords'
)
assert.equal(harness.saved.length, savedBeforeStaleResume)

const persistenceFailure = manager.initialize(
  { ...row('save-failure'), run: false, damengRuntime: { ...runtime, installId: 'save-failure' } },
  {
    ...initial,
    port: 6001,
    sysdbaPassword: 'ActualPwd99!',
    auditorPassword: 'ActualAudit99!'
  }
)
await tick()
harness.storageError = true
reply(harness.sent.at(-1), 0, { initialized: true, resumed: false })
assert.equal(
  await persistenceFailure,
  true,
  'settings persistence failure does not reject a completed database initialization'
)
harness.storageError = false
assert.equal(manager.credentials.sysdbaPassword, 'ActualPwd99!')
assert.equal(manager.settings.port, 6001)
assert.equal(manager.state({ id: 'save-failure' }).error, '')
assert.equal(
  harness.errors.some((message) => message.includes('storage unavailable')),
  true
)

await assert.rejects(
  (async () => {
    harness.storageError = true
    try {
      await manager.saveSettings(initial, { sysdbaPassword: 'NewPwd99!', auditorPassword: '' })
    } finally {
      harness.storageError = false
    }
  })(),
  /storage unavailable/
)
assert.equal(
  manager.credentials.sysdbaPassword,
  'ActualPwd99!',
  'standalone settings still requires a successful save'
)

const recovery = {
  ...row('recovery'),
  run: false,
  damengRuntime: { ...runtime, installId: 'recovery', initializationCompleted: true }
}
const priorSettings = { ...manager.settings }
const priorCredentials = { ...manager.credentials }
const resume = manager.initialize(recovery, {
  ...initial,
  port: 6000,
  sysdbaPassword: 'DifferentPwd9!',
  auditorPassword: 'DifferentAudit9!'
})
await tick()
const resumeRequest = harness.sent.at(-1)
assert.equal(resumeRequest.action, 'initializeDatabase')
assert.equal(
  resumeRequest.args[1],
  undefined,
  'registration recovery must not submit new database settings or passwords'
)
reply(resumeRequest, 0, { initialized: true, resumed: true })
assert.equal(await resume, true)
assert.deepEqual(manager.settings, priorSettings, 'registration recovery keeps existing defaults')
assert.deepEqual(
  manager.credentials,
  priorCredentials,
  'registration recovery keeps the actual session credentials'
)
const noCredentials = new DamengPluginManager(1000)
const resumeWithoutPasswords = noCredentials.initialize(recovery)
await tick()
reply(harness.sent.at(-1), 0, { initialized: true, resumed: true })
assert.equal(
  await resumeWithoutPasswords,
  true,
  'registration recovery does not require fresh initialization passwords'
)
assert.deepEqual(noCredentials.credentials, { sysdbaPassword: '', auditorPassword: '' })

const timeoutManager = new DamengPluginManager(15)
const timeoutRow = row('timeout')
timeoutManager.onlineVersions = [timeoutRow]
const timedInstall = timeoutManager.install(timeoutRow, '/chosen/Timeout')
await tick()
reply(harness.sent.at(-1), 0, {
  programDir: '/chosen/Timeout',
  bin: '/chosen/Timeout/bin/dmserver'
})
assert.equal(await timedInstall, false)
assert.equal(timeoutManager.state(timeoutRow).unknown, true)
const count = harness.sent.length
assert.equal(await timeoutManager.install(timeoutRow), false)
assert.equal(harness.sent.length, count, 'timeout prevents replay')
const catalog = timeoutManager.fetchOnlineVersions(true)
await tick()
reply(harness.sent.at(-1), 0, [row('timeout')])
await catalog
assert.equal(timeoutManager.onlineVersions[0].disabled, true, 'refresh cannot clear unknown gate')
assert.equal(await timeoutManager.install(timeoutManager.onlineVersions[0]), false)
assert.equal(harness.sent.length, count + 1)

const active = { ...installed, run: true, damengRuntime: { ...runtime, initialized: true } }
const info = manager.getInstanceInfo(active)
assert.strictEqual(manager.getInstanceInfo(active), info)
await tick()
const infoRequest = harness.sent.at(-1)
reply(infoRequest, 0, { version: 'DM8', initialized: true, expiredDate: '2027-01-01' })
await info
assert.equal(manager.info(active).data.expiredDate, '2027-01-01')
const alreadyInitialized = manager.startParams(active)
await tick()
assert.equal(harness.sent.at(-1).action, 'getInitializationState')
reply(harness.sent.at(-1), 0, { ...runtime, initialized: true })
assert.deepEqual(await alreadyInitialized, [{ sysdbaPassword: 'ActualPwd99!' }])
const startingRow = {
  ...row('auto-start'),
  running: true,
  run: false,
  damengRuntime: { ...runtime, installId: 'auto-start', initialized: true }
}
const canceledStart = manager.startParams(startingRow)
assert.strictEqual(manager.startParams(startingRow), canceledStart)
const canceledAssertion = assert.rejects(canceledStart, /canceled/i)
await tick()
reply(harness.sent.at(-1), 0, { ...runtime, installId: 'auto-start', initialized: false })
await canceledAssertion
assert.equal(harness.setupCalls.at(-1), startingRow)
assert.equal(
  startingRow.damengRuntime.initialized,
  false,
  'fresh Fork state replaces stale renderer flag'
)
assert.equal(
  harness.sent.at(-1).action,
  'getInitializationState',
  'cancel never initializes or starts'
)
harness.setupAction = (item) =>
  manager.initialize(
    item,
    { ...initial, sysdbaPassword: '123456_Xpf', auditorPassword: 'AuditPwd9!' },
    true
  )
const automaticStart = manager.startParams(startingRow)
await tick()
reply(harness.sent.at(-1), 0, { ...runtime, installId: 'auto-start', initialized: false })
await tick()
assert.equal(
  harness.sent.at(-1).action,
  'initializeDatabase',
  'pending generic start flag permits required initialization'
)
reply(harness.sent.at(-1), 0, { initialized: true, resumed: false })
await tick()
assert.equal(
  harness.sent.at(-1).action,
  'getInitializationState',
  'success rechecks Fork state before handing off startup'
)
reply(harness.sent.at(-1), 0, { ...runtime, installId: 'auto-start', initialized: true })
assert.deepEqual(await automaticStart, [{ sysdbaPassword: '123456_Xpf' }])
harness.setupAction = undefined
harness.setupResult = true
const notInitialized = manager.startParams(startingRow)
const incompleteAssertion = assert.rejects(notInitialized, /initializ/i)
await tick()
reply(harness.sent.at(-1), 0, { ...runtime, installId: 'auto-start', initialized: false })
await tick()
reply(harness.sent.at(-1), 0, { ...runtime, installId: 'auto-start', initialized: false })
await incompleteAssertion
harness.setupResult = false
const failedRead = manager.startParams(startingRow)
const failedReadAssertion = assert.rejects(failedRead, /state unavailable/)
await tick()
reply(harness.sent.at(-1), 500, undefined, 'state unavailable')
await failedReadAssertion
const afterReadFailure = manager.startParams(startingRow)
await tick()
reply(harness.sent.at(-1), 0, { ...runtime, installId: 'auto-start', initialized: true })
assert.deepEqual(
  await afterReadFailure,
  [{ sysdbaPassword: '123456_Xpf' }],
  'read failure releases the startup guard'
)
const noSession = new DamengPluginManager(1000)
harness.setupAction = async (item) => {
  assert.equal(item, undefined)
  noSession.credentials.sysdbaPassword = 'ExistingPwd9!'
  return true
}
const sessionStart = noSession.startParams(startingRow)
await tick()
reply(harness.sent.at(-1), 0, { ...runtime, installId: 'auto-start', initialized: true })
assert.deepEqual(
  await sessionStart,
  [{ sysdbaPassword: 'ExistingPwd9!' }],
  'existing database asks for its current password without reinitialization'
)
harness.setupAction = undefined
assert.deepEqual(await manager.stopParams(), [])

// Exercise the actual Logs component: the shared log reader checks existence at
// mount, so first startup must make it retry even when its path stays unchanged.
const logsFile = 'plugins/dameng/render/Logs.vue'
const { descriptor } = parse(await readFile(logsFile, 'utf8'), { filename: logsFile })
const logsScript = compileScript(descriptor, { id: 'dameng-log-test', inlineTemplate: true })
const vueUrl = pathToFileURL(createRequire(import.meta.url).resolve('vue')).href
const logSources: Record<string, string> = {
  ...sources,
  '@/components/Log/index.vue': `import { h } from 'vue';
    export default { props: ['logFile'], setup(props) {
      const harness = globalThis.__damengRenderer;
      harness.logSnapshots.push({ file: props.logFile, exists: harness.logExists });
      return () => h('div');
    } }`,
  '@/components/Log/tool.vue': 'export default { render: () => null }'
}
const logsBundle = await build({
  stdin: { contents: logsScript.content, sourcefile: logsFile, loader: 'ts' },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
  plugins: [
    {
      name: 'log-host',
      setup(builder) {
        builder.onResolve({ filter: /^vue$/ }, () => ({ path: vueUrl, external: true }))
        builder.onResolve({ filter: /^@/ }, (args) => ({
          path: args.path,
          namespace: 'mock-log-host'
        }))
        builder.onLoad({ filter: /.*/, namespace: 'mock-log-host' }, (args) => ({
          contents: logSources[args.path]
        }))
      }
    }
  ]
})
const { default: Logs } = await import(
  `data:text/javascript;base64,${Buffer.from(logsBundle.outputFiles[0].text).toString('base64')}`
)
type TestNode = { children: TestNode[]; parent?: TestNode }
const renderer = createRenderer<TestNode, TestNode>({
  createElement: () => ({ children: [] }),
  createText: () => ({ children: [] }),
  createComment: () => ({ children: [] }),
  patchProp() {},
  setText() {},
  setElementText() {},
  parentNode: (node) => node.parent ?? null,
  nextSibling: () => null,
  insert(node, parent) {
    node.parent = parent
    parent.children.push(node)
  },
  remove(node) {
    if (node.parent) node.parent.children.splice(node.parent.children.indexOf(node), 1)
  }
})
harness.currentInstalled = reactive({
  ...active,
  run: false,
  damengRuntime: { ...active.damengRuntime, logFile: '/dm/startup.log' }
})
const logApp = renderer.createApp(Logs)
logApp.component(
  'ElCard',
  defineComponent({
    setup(_props, { slots }) {
      return () => h('div', [slots.default?.(), slots.footer?.()])
    }
  })
)
logApp.mount({ children: [] })
assert.equal(harness.logSnapshots.at(-1)?.exists, false)
harness.logExists = true
harness.currentInstalled.run = true
await nextTick()
assert.equal(
  harness.logSnapshots.at(-1)?.exists,
  true,
  'first startup makes the standard log reader retry an initially absent path'
)
assert.equal(harness.logSnapshots.length, 2)
logApp.unmount()

const dialogCalls = {
  saved: 0,
  initialized: [] as any[],
  initializationWait: undefined as Promise<boolean> | undefined,
  manager: {
    settings: initial,
    credentials: { sysdbaPassword: '', auditorPassword: '' },
    async init() {},
    async saveSettings() {
      dialogCalls.saved++
    },
    async initialize(...args: any[]) {
      dialogCalls.initialized.push(args)
      return dialogCalls.initializationWait ?? true
    }
  },
  copySettings,
  initialCredentialError,
  generateInitialPassword
}
;(globalThis as any).__damengDialog = dialogCalls
const dialogFile = 'plugins/dameng/render/SetupDialog.vue'
const dialogDescriptor = parse(await readFile(dialogFile, 'utf8'), {
  filename: dialogFile
}).descriptor
const dialogScript = compileScript(dialogDescriptor, { id: 'dameng-dialog-test' })
const dialogBundle = await build({
  stdin: {
    contents: dialogScript.content,
    sourcefile: dialogFile,
    resolveDir: join(process.cwd(), 'plugins/dameng/render'),
    loader: 'ts'
  },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
  plugins: [
    {
      name: 'dialog-host',
      setup(builder) {
        builder.onResolve({ filter: /^vue$/ }, () => ({ path: vueUrl, external: true }))
        builder.onResolve({ filter: /^\.\/store$/ }, () => ({
          path: 'dialog-store',
          namespace: 'mock-dialog'
        }))
        builder.onResolve({ filter: /^@/ }, (args) => ({
          path: args.path,
          namespace: 'mock-dialog'
        }))
        builder.onLoad({ filter: /.*/, namespace: 'mock-dialog' }, (args) => ({
          contents:
            args.path === 'dialog-store'
              ? 'export const { manager: DamengManager, copySettings, initialCredentialError, generateInitialPassword } = globalThis.__damengDialog'
              : args.path === '@lang/index'
                ? sources[args.path] + '; export const I18nT = value => value'
                : sources[args.path]
        }))
      }
    }
  ]
})
const { default: SetupDialog } = await import(
  `data:text/javascript;base64,${Buffer.from(dialogBundle.outputFiles[0].text).toString('base64')}`
)
SetupDialog.render = () => null
const dialogApp = renderer.createApp(SetupDialog)
const dialog = dialogApp.mount({ children: [] }) as any
await dialog.open(recovery)
await dialog.$.setupState.submit()
assert.equal(
  dialogCalls.saved,
  0,
  'registration resume does not save fresh defaults or credentials'
)
assert.equal(
  dialogCalls.initialized.length,
  1,
  'registration resume works without initialization passwords'
)
assert.equal(dialogCalls.initialized[0][1], undefined)
dialogCalls.manager.credentials = {
  sysdbaPassword: 'DifferentPwd9!',
  auditorPassword: 'DifferentAudit9!'
}
await dialog.open(installed)
const setupForm = dialog.$.setupState
setupForm.credentials.sysdbaPassword = '123456_Xpf'
await setupForm.submit()
assert.match(setupForm.error, /SYSAUDITOR/)
assert.equal(dialogCalls.initialized.length, 1, 'missing audit password is named and prevents IPC')
setupForm.generate('auditorPassword')
assert.equal(isInitialPasswordValid(setupForm.credentials.auditorPassword), true)
assert.equal(
  setupForm.credentials.sysdbaPassword,
  '123456_Xpf',
  'audit generation leaves administrator input unchanged'
)
await setupForm.submit()
assert.equal(
  dialogCalls.saved,
  0,
  'fresh initialization must not pre-adopt credentials or defaults before the backend result'
)
assert.equal(dialogCalls.initialized.length, 2)
assert.equal(dialogCalls.initialized[1][1].sysdbaPassword, '123456_Xpf')
await dialog.open()
await dialog.$.setupState.submit()
assert.equal(dialogCalls.saved, 1, 'standalone settings retains its required save flow')
dialogApp.unmount()
assert.match(dialogDescriptor.template!.content, /<el-scrollbar height="100%">/)
assert.match(dialogDescriptor.styles[0].content, /height: 75vh/)
const automaticDialogApp = renderer.createApp(SetupDialog, {
  startup: true,
  initialTarget: installed
})
const automaticDialog = automaticDialogApp.mount({ children: [] }) as any
const completions: boolean[] = []
automaticDialog.onSubmit((value: boolean) => completions.push(value))
await tick()
assert.equal(
  automaticDialog.$.setupState.show,
  true,
  'startup prompt opens without an entry-page ref'
)
automaticDialog.$.setupState.generate('sysdbaPassword')
automaticDialog.$.setupState.generate('auditorPassword')
await automaticDialog.$.setupState.submit()
assert.deepEqual(completions, [true])
assert.equal(
  dialogCalls.initialized.at(-1)[2],
  true,
  'startup initialization explicitly distinguishes the generic pending-start flag'
)
automaticDialog.$.setupState.closed()
assert.deepEqual(completions, [true], 'closed event does not replay completion')
automaticDialogApp.unmount()
const cancelDialogApp = renderer.createApp(SetupDialog, { startup: true, initialTarget: installed })
const cancelDialog = cancelDialogApp.mount({ children: [] }) as any
const canceledCompletions: boolean[] = []
cancelDialog.onSubmit((value: boolean) => canceledCompletions.push(value))
await tick()
let completeInitialization!: (value: boolean) => void
dialogCalls.initializationWait = new Promise((resolve) => {
  completeInitialization = resolve
})
cancelDialog.$.setupState.generate('sysdbaPassword')
cancelDialog.$.setupState.generate('auditorPassword')
const canceledInitialization = cancelDialog.$.setupState.submit()
cancelDialog.show = false
assert.deepEqual(
  canceledCompletions,
  [false],
  'cancel settles immediately, before the close animation'
)
completeInitialization(true)
await canceledInitialization
cancelDialog.$.setupState.closed()
cancelDialogApp.unmount()
assert.deepEqual(canceledCompletions, [false], 'completion after cancel must never resume startup')
dialogCalls.initializationWait = undefined
// Mount the real installation dialog setup against the real controller.
;(globalThis as any).__damengInstallManager = manager
const installDialogFile = 'plugins/dameng/render/InstallDialog.vue'
const installDescriptor = parse(await readFile(installDialogFile, 'utf8'), {
  filename: installDialogFile
}).descriptor
const installScript = compileScript(installDescriptor, { id: 'dameng-install-dialog-test' })
const installBundle = await build({
  stdin: {
    contents: installScript.content,
    sourcefile: installDialogFile,
    resolveDir: join(process.cwd(), 'plugins/dameng/render'),
    loader: 'ts'
  },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
  plugins: [
    {
      name: 'install-dialog-host',
      setup(builder) {
        builder.onResolve({ filter: /^vue$/ }, () => ({ path: vueUrl, external: true }))
        builder.onResolve({ filter: /^\.\/store$/ }, () => ({
          path: 'install-store',
          namespace: 'mock-install'
        }))
        builder.onResolve({ filter: /^@/ }, (args) => ({
          path: args.path,
          namespace: 'mock-install'
        }))
        builder.onLoad({ filter: /.*/, namespace: 'mock-install' }, (args) => ({
          contents:
            args.path === 'install-store'
              ? 'export const DamengManager = globalThis.__damengInstallManager'
              : args.path === '@lang/index'
                ? sources[args.path] + '; export const I18nT = value => value'
                : sources[args.path]
        }))
      }
    }
  ]
})
const { default: InstallDialog } = await import(
  `data:text/javascript;base64,${Buffer.from(installBundle.outputFiles[0].text).toString('base64')}`
)
InstallDialog.render = () => null
const installApp = renderer.createApp(InstallDialog)
const installDialog = installApp.mount({ children: [] }) as any
const form = installDialog.$.setupState
const nativeCount = harness.pickerCalls.length
const ipcCount = harness.sent.length
const dialogRow = row('dialog-install')
installDialog.open(dialogRow)
assert.equal(form.show, true)
assert.equal(
  harness.pickerCalls.length,
  nativeCount,
  'download opens FlyEnv dialog before native picker'
)
assert.equal(harness.sent.length, ipcCount, 'opening dialog never downloads')
form.directory = '/typed/DM8'
harness.pickerResult = { canceled: true, filePaths: [] }
await form.browse()
assert.equal(form.directory, '/typed/DM8', 'picker cancel preserves typed input')
assert.equal(harness.pickerCalls.at(-1).defaultPath, '/typed/DM8')
harness.pickerResult = { canceled: false, filePaths: ['/selected/DM8'] }
await form.browse()
assert.equal(form.directory, '/selected/DM8')
assert.equal(harness.sent.length, ipcCount, 'browse never downloads')
form.directory = '/invalid-dir'
await form.submit()
assert.equal(form.show, true, 'invalid syntax leaves dialog open')
assert.ok(form.error)
assert.equal(harness.sent.length, ipcCount)
form.directory = '/chosen/DM8'
const invalidDirectory = form.submit()
await tick()
reply(harness.sent.at(-1), 500, undefined, 'Directory is not empty')
await invalidDirectory
assert.equal(form.show, true, 'Fork path refusal leaves dialog editable')
assert.match(form.error, /not empty/)
const submit = form.submit()
await tick()
assert.equal(form.submitting, true)
reply(harness.sent.at(-1), 0, { programDir: '/chosen/DM8', bin: '/chosen/DM8/bin/dmserver' })
await tick()
assert.equal(form.show, false, 'validated input closes the dialog before installation')
assert.equal(form.submitting, false)
assert.equal(harness.sent.at(-1).action, 'installSoft')
reply(harness.sent.at(-1), 0, {
  installed: true,
  programDir: '/chosen/DM8',
  bin: '/chosen/DM8/bin/dmserver'
})
await submit
let resolvePicker!: (value: unknown) => void
harness.pickerWait = new Promise((resolve) => {
  resolvePicker = resolve
})
installDialog.open(row('stale-picker'))
const staleBrowse = form.browse()
await tick()
form.show = false
installDialog.open(row('reopened-dialog'))
resolvePicker({ canceled: false, filePaths: ['/stale/DM8'] })
await staleBrowse
assert.equal(form.directory, '', 'old picker cannot overwrite a reopened dialog')
assert.equal(form.browsing, false)
harness.pickerWait = new Promise((resolve) => {
  resolvePicker = resolve
})
const unmountedBrowse = form.browse()
await tick()
installApp.unmount()
resolvePicker({ canceled: false, filePaths: ['/unmounted/DM8'] })
await unmountedBrowse
assert.equal(form.directory, '', 'unmounted view ignores native picker results')
harness.pickerWait = undefined
console.log(
  'Dameng renderer: password/persistence, single flight, progress/terminal cleanup, snapshots, failure/retry, timeout replay gate and info/lifecycle parameters passed'
)
