import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { spawnSync } from 'node:child_process'

const require = createRequire(import.meta.url)
const exits = new Set<(event: { exitCode: number }) => void>()
let writes = 0
let failWrite = false
let callbacks = 0
let fileWrites = 0
let sent = ''
const pty = {
  onData() {},
  onExit(callback: (event: { exitCode: number }) => void) {
    exits.add(callback)
    return { dispose: () => exits.delete(callback) }
  },
  write(command: string) {
    if (failWrite) throw new Error('PTY write denied')
    writes++
    sent = command
  },
  kill() {}
}
const bundled = await build({
  entryPoints: ['src/main/core/NodePTY.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false,
  plugins: [
    {
      name: 'pty-boundaries',
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
    if (name === 'node-pty')
      return {
        spawn: () => {
          exits.clear()
          return pty
        }
      }
    if (name === '../utils')
      return {
        uuid: () => 'terminal',
        writeFile: async () => {
          fileWrites++
        },
        chmod: async () => {},
        remove: async () => {}
      }
    if (name === '@shared/utils')
      return { isMacOS: () => true, isWindows: () => false, isLinux: () => false }
    if (name === '@shared/EnvSync') return { sync: async () => ({}) }
    if (name === 'fs') return { existsSync: () => false }
    return require(name)
  },
  process: { cwd: () => '/tmp', kill() {} },
  global: { Server: { Cache: '/tmp' } },
  console: { log() {} }
})
const nodePty = module.exports.default
nodePty.onSendCommand(() => callbacks++)
const key = await nodePty.initNodePty()
let settled = false
const pending = nodePty.execAndWait(key, ['false', 'exit $?']).finally(() => {
  settled = true
})
await new Promise((resolve) => setImmediate(resolve))
assert.equal(writes, 1)
assert.equal(fileWrites, 0, 'fixed installer must not cross a user-writable command file')
assert.equal(settled, false, 'sending commands does not prove the terminal has exited')
nodePty.stop(key)
assert.equal(settled, false, 'a stop request must await the actual exit acknowledgement')
for (const callback of [...exits]) callback({ exitCode: 1 })
await assert.rejects(pending, /code 1/)
assert.equal(callbacks, 0, 'internally owned installation must not emit a second terminal result')
await assert.rejects(nodePty.execAndWait('missing', ['true']), /unavailable/)

await nodePty.initNodePty()
failWrite = true
await assert.rejects(nodePty.execAndWait(key, ['true']), /PTY write denied/)
failWrite = false
const successful = nodePty.execAndWait(key, ['true', 'exit $?'])
await new Promise((resolve) => setImmediate(resolve))
for (const callback of [...exits]) callback({ exitCode: 0 })
await successful
for (const [command, output] of [
  ["printf '%s' \"quote' backslash \\\\ literal \\$HOME\"", "quote' backslash \\ literal $HOME"],
  ["printf '%s\\n' 'one'; printf '%s' 'two'", 'one\ntwo']
]) {
  await nodePty.initNodePty()
  const result = nodePty.execAndWait(key, [command, 'exit $?'])
  const shell = process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash'
  const executed = spawnSync(shell, ['-c', sent.trimEnd()], { encoding: 'utf8' })
  assert.equal(executed.status, 0, executed.stderr)
  assert.equal(executed.stdout, output, 'direct PTY wrapper preserves literal shell input')
  for (const callback of [...exits]) callback({ exitCode: executed.status! })
  await result
}
console.log(
  'Helper terminal PTY: actual exit, cancellation, scheduling failure and missing process passed'
)
await nodePty.initNodePty()
await nodePty.exec(
  key,
  ['/usr/bin/sudo /bin/kill -9 -- 123'],
  'direct',
  'NodePty:exec',
  'exec-key',
  true
)
assert.equal(fileWrites, 0, 'direct sudo commands must never generate a script')
assert.ok(sent.includes('/usr/bin/sudo /bin/kill -9 -- 123'))
const responses: any[] = []
nodePty.onSendCommand((_command: string, _key: string, result: any) => responses.push(result))
for (const callback of [...exits]) callback({ exitCode: 1 })
assert.equal(responses[0].code, 1, 'direct execution must retain the real exit code')
assert.equal(responses[0].data.exitCode, 1)
await nodePty.initNodePty()
await nodePty.exec(key, ['true'], 'direct', 'NodePty:exec', 'success-key', true)
for (const callback of [...exits]) callback({ exitCode: 0 })
assert.equal(responses[1].code, 0)
assert.equal(fileWrites, 0)
console.log(
  'Direct terminal execution: no generated files and actual success/failure exit codes passed'
)
