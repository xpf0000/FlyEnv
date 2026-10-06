import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { runInNewContext } from 'node:vm'

async function load(file: string, dependencies: Record<string, any>) {
  const output = await build({
    entryPoints: [file],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false,
    plugins: [
      {
        name: 'renderer-boundaries',
        setup(builder) {
          builder.onResolve({ filter: /^@\/components\/FlyEnvHelper\/index\.vue$/ }, () => ({
            path: 'installer',
            namespace: 'fixture'
          }))
          builder.onLoad({ filter: /./, namespace: 'fixture' }, () => ({
            contents: 'export default {}'
          }))
          builder.onResolve({ filter: /./ }, ({ path }) =>
            path in dependencies ? { path, external: true } : undefined
          )
        }
      }
    ]
  })
  const module = { exports: {} as any }
  runInNewContext(output.outputFiles[0].text, {
    module,
    exports: module.exports,
    require: (path: string) => dependencies[path].default ?? dependencies[path],
    window: { Server: { isLinux: true, isWindows: false } },
    console
  })
  return module.exports
}

const failures: unknown[] = []
async function check(name: string, test: () => Promise<void>) {
  try {
    await test()
    console.log(`PASS: ${name}`)
  } catch (error) {
    failures.push(error)
    console.error(`FAIL: ${name}`, error)
  }
}

await check('Linux needInstall status reaches the existing installation dialog', async () => {
  const callbacks = new Map<string, (...args: any[]) => void>()
  const prompts: string[] = []
  let pending = false
  const { default: notifications } = await load('src/render/util/GlobalIPCOn.ts', {
    '@/util/MCP': { setupMcpIpc: () => {} },
    '@/util/IPC': {
      default: { on: (key: string) => ({ then: (fn: any) => callbacks.set(key, fn) }) }
    },
    '@/util/Element': {
      MessageError: () => {},
      MessageSuccess: () => {},
      MessageWarning: () => {}
    },
    '@/components/FlyEnvHelper/setup': { FlyEnvHelperSetup: { show: false } },
    '@/store/helper': {
      default: {
        isInstallResultPending: () => pending,
        shouldShowNeedInstallDialog: () => true,
        showNeedInstallDialog: (reason: string) => prompts.push(reason)
      }
    },
    '@/util/NodeFn': { nativeTheme: {} },
    'lodash-es': { isEqual: () => false },
    '@/store/app': { AppStore: () => ({}) },
    '@/components/Setup/store': { SetupStore: () => ({}) },
    '@lang/index': { I18nT: (key: string) => key },
    '@/core/AppModules': { syncRendererPluginModules: () => Promise.resolve() },
    '@/components/Setup/WindowsElevationMethod/Controller': { default: {} },
    '@shared/WindowsHelperState': { WINDOWS_ELEVATION_CHOICE_VERSION: 1 }
  })
  notifications.init()
  const notify = callbacks.get('APP-FlyEnv-Helper-Notice')!
  notify('', { code: 1, status: 'needInstall', reason: 'helper_key_missing' })
  assert.deepEqual(prompts, ['helper_key_missing'])
  pending = true
  notify('', { code: 1, status: 'needInstall' })
  assert.equal(prompts.length, 1, 'installation in progress must suppress repeated prompts')
  pending = false
  notify('', { code: 1, status: 'installing' })
  assert.equal(prompts.length, 1, 'other status events must not request another installation')
  notify('', { code: 1, reason: 'helper_pipe_unreachable' })
  assert.deepEqual(prompts, ['helper_key_missing', 'helper_pipe_unreachable'])
})

await check('Linux repair releases entry loading without waiting for a dialog submit', async () => {
  let opened = 0
  let failOpen = false
  const errors: string[] = []
  const dependencies: Record<string, any> = {
    vue: { reactive: (value: any) => value, markRaw: (value: any) => value },
    '@/util/IPC': { default: {} },
    'element-plus': { ElMessage: { error: (msg: string) => errors.push(msg), success: () => {} } },
    '@lang/index': { I18nT: (key: string) => key },
    '@/util/Index': { reactiveBind: (value: any) => value },
    '@/util/Element': { MessageError: (msg: string) => errors.push(msg) },
    '@/util/XTerm': { default: class {} },
    '@/store/helper': { default: { isInstalling: () => false } },
    '@/util/AsyncComponent': {
      AsyncComponentShow: () => {
        opened++
        if (failOpen) return Promise.reject(new Error('dialog mount failed'))
        state.show = true
        // Closing this dialog never emits onSubmit: its promise remains pending.
        return new Promise(() => {})
      }
    }
  }
  const state = (await load('src/render/components/FlyEnvHelper/setup.ts', dependencies))
    .FlyEnvHelperSetup
  state.command = 'stale command'
  dependencies['@/components/FlyEnvHelper/setup'] = { FlyEnvHelperSetup: state }
  const { FlyEnvHelperFix: fix } = await load(
    'src/render/components/Setup/FlyEnvHelper/setup.ts',
    dependencies
  )
  fix.doFix()
  fix.doFix()
  assert.equal(fix.fixing, true)
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(opened, 1, 'double click must only open one installer')
  assert.equal(fix.fixing, false, 'dialog opening must terminate entry loading')
  assert.equal(state.command, '', 'explicit repair must refresh the installation command')
  fix.doFix()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(opened, 1, 'an open installer must be reused')
  state.show = false
  state.loading = true
  fix.doFix()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(opened, 1, 'a detached running installation must not be duplicated')
  state.loading = false
  fix.doFix()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(opened, 2, 'repair can run again after the previous operation ends')
  assert.equal(fix.fixing, false)
  state.show = false
  failOpen = true
  fix.doFix()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(fix.fixing, false, 'failed dialog opening must release the entry guard')
  assert.equal(errors.length, 1)
  assert.match(errors[0], /menu.helperInstallFailTips.*dialog mount failed/)
  failOpen = false
  fix.doFix()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(opened, 4, 'failed dialog opening must permit a retry')
})

if (failures.length) throw new AggregateError(failures, 'Linux helper UI regressions')
