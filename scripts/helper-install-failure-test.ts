import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { runInNewContext } from 'node:vm'
import { createAppHelper } from '../src/main/core/AppHelper'
import { AppHelperError, buildHelperCheckResponse } from '../src/shared/WindowsHelperState'

const diagnostic = 'code has no resources but signature indicates they must be present'
const stderr = `${diagnostic}\nFLYENV_HELPER_INSTALL_ERROR:helper_signature_invalid:FlyEnv application signature or resources are invalid. Use an officially signed build.`
const helper = createAppHelper({
  appHelperCheck: async () => {
    throw new AppHelperError('helper_key_missing', 'missing key')
  },
  sudo: async () => {
    throw Object.assign(new Error('Command failed: installer'), { stderr })
  }
})
helper.command = async () => ({ command: 'fixed installer', icns: '' })
const statuses: any[] = []
helper.onStatusMessage((status) => statuses.push(status))
let response: any
try {
  await helper.initHelper()
  assert.fail('a rejected signature cannot complete installation')
} catch (error) {
  response = buildHelperCheckResponse(error)
}
assert.equal(response.reason, 'helper_signature_invalid')
assert.equal(response.stderr, stderr, 'IPC must retain the original system diagnostic')
assert.match(response.msg, /officially signed build/)
assert.equal(statuses.at(-1).stderr, stderr, 'background failure notices must retain diagnostics')

// Run the real renderer failure routing with native dialogs/terminal opening
// replaced at the UI boundary; no system authorization or terminal is opened.
const dialogs: any[] = []
let terminals = 0
const bundled = await build({
  entryPoints: ['src/render/store/helper.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false,
  supported: { 'dynamic-import': false },
  plugins: [
    {
      name: 'ui-boundaries',
      setup(builder) {
        builder.onResolve({ filter: /./ }, (args) =>
          args.kind === 'entry-point' ? undefined : { path: args.path, external: true }
        )
      }
    }
  ]
})
const module = { exports: {} as any }
runInNewContext(bundled.outputFiles[0].text, {
  module,
  exports: module.exports,
  require: (name: string) => {
    if (name === '@/util/Index') return { reactiveBind: (value: any) => value }
    if (name === '@/util/NodeFn')
      return {
        dialog: {
          showMessageBox: async (value: any) => {
            dialogs.push(value)
          }
        }
      }
    if (name === '@lang/index') return { I18nT: (key: string) => key }
    if (name === '@/components/FlyEnvHelper/setup')
      return {
        FlyEnvHelperSetup: {
          open: async () => {
            terminals++
          }
        }
      }
    return {}
  },
  window: { Server: { isMacOS: true, isWindows: false, isLinux: false } },
  setTimeout,
  clearTimeout
})
const store = module.exports.default
for (const reason of [
  'helper_signature_invalid',
  'helper_version_mismatch',
  'helper_acl_invalid'
]) {
  store.showInstallFailDialog(reason, stderr)
  await new Promise((resolve) => setImmediate(resolve))
  assert.ok(dialogs.at(-1).message.includes(diagnostic), 'the UI must show the real failure')
}
assert.equal(dialogs.length, 3)
assert.equal(terminals, 0, 'deterministic installer rejection must not replay in XTerm')
store.showInstallFailDialog('elevation_cancelled', stderr)
assert.equal(dialogs.length, 3, 'cancelled authorization must remain silent')
store.showInstallFailDialog('helper_execution_failed', stderr)
await new Promise((resolve) => setImmediate(resolve))
assert.equal(terminals, 1, 'other failures retain the existing terminal installation path')
console.log('Helper installer failure diagnostics and macOS UI routing tests passed')
