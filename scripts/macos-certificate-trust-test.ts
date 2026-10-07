import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { ForkPromise } from '../src/shared/ForkPromise'

const require = createRequire(import.meta.url)
const bundled = await build({
  entryPoints: ['src/fork/module/Host/SSL.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false,
  plugins: [
    {
      name: 'boundaries',
      setup(builder) {
        builder.onResolve({ filter: /./ }, (args) =>
          args.kind === 'entry-point' ? undefined : { path: args.path, external: true }
        )
      }
    }
  ]
})
const module = { exports: {} as any }
const calls: any[][] = []
const commands: string[] = []
const logs: string[] = []
let installed = false
let rootExists = false
let importError: Error | undefined
let queryError: Error | undefined
let windows = false
runInNewContext(bundled.outputFiles[0].text, {
  module,
  exports: module.exports,
  require: (name: string) => {
    if (name === '@shared/ForkPromise') return { ForkPromise }
    if (name === 'fs')
      return {
        existsSync: (path: string) => (path.endsWith('FlyEnv-Root-CA.crt') ? rootExists : true)
      }
    if (name === '../../Fn')
      return {
        hostAlias: () => ['example.test'],
        mkdirp: async () => {},
        remove: async () => {},
        writeFile: async () => {},
        copyFile: async () => {},
        zipUnpack: async () => {},
        execPromiseWithEnv: async (command: string) => {
          commands.push(command)
          if (command.includes('genrsa')) rootExists = true
        }
      }
    if (name === '../../Helper')
      return {
        send: async (...args: any[]) => {
          calls.push(args)
          if (args[1] === 'sslFindCertificate') {
            if (queryError) throw queryError
            return { stdout: installed ? 'FlyEnv-Root-CA' : '', stderr: '' }
          }
          assert.equal(args[1], 'sslAddTrustedCert')
          if (importError) throw importError
          installed = true
          return true
        }
      }
    if (name === '@shared/utils')
      return {
        isWindows: () => windows,
        appDebugLog: async (_label: string, message: string) => {
          logs.push(message)
        }
      }
    if (name === '@shared/WindowsHelperState') return { isAppHelperError: () => false }
    return require(name)
  },
  global: { Server: { BaseDir: '/data/server', AppDir: '/data/app', Static: '/static' } },
  console: { log: () => {} }
})
const host = { id: 'site', name: 'example.test' }
for (windows of [false, true]) {
  installed = false
  rootExists = false
  calls.length = 0
  commands.length = 0
  importError = new Error('system CA import failed')
  const first = Promise.resolve(module.exports.makeAutoSSL(host))
  if (windows) assert.equal(await first, false)
  else await assert.rejects(first, (error) => error === importError)
  assert.equal(rootExists, true, 'generation is retained after an import failure')
  assert.equal(
    commands.some((command) => command.includes('CA-site')),
    false,
    'failed import must stop dependent site issuance'
  )
  const generations = commands.filter((command) => command.includes('genrsa')).length
  importError = undefined
  assert.ok(await module.exports.makeAutoSSL(host), 'the existing SSL queue must permit retry')
  assert.equal(commands.filter((command) => command.includes('genrsa')).length, generations)
  assert.equal(calls.filter((call) => call[1] === 'sslAddTrustedCert').length, 2)
  assert.deepEqual(calls[1], ['host', 'sslAddTrustedCert', '/data/server/CA', 'FlyEnv-Root-CA.crt'])
  await module.exports.makeAutoSSL(host)
  assert.equal(
    calls.filter((call) => call[1] === 'sslAddTrustedCert').length,
    2,
    'a CA found by the fixed name must not be imported again'
  )
}
windows = false
queryError = new Error('system certificate query failed')
const imports = calls.filter((call) => call[1] === 'sslAddTrustedCert').length
await assert.rejects(
  Promise.resolve(module.exports.makeAutoSSL(host)),
  (error) => error === queryError
)
assert.equal(calls.filter((call) => call[1] === 'sslAddTrustedCert').length, imports)
queryError = undefined
assert.ok(await module.exports.makeAutoSSL(host), 'query failure must leave the SSL queue usable')
assert.ok(logs.some((line) => line.includes('system CA import failed')))
assert.ok(logs.some((line) => line.includes('system certificate query failed')))
console.log(
  'Existing auto SSL generation, fixed-name lookup, import failure, retry and debug logging passed'
)
