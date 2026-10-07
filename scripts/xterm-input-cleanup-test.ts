import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { runInNewContext } from 'node:vm'

const logs: unknown[][] = []
const commands: { command: string; key: string; args: any[] }[] = []
let receive: (...args: any[]) => void
let input: (data: string) => void
let id = 0
const window = {
  Server: { isWindows: false },
  addEventListener() {},
  removeEventListener() {},
  FlyEnvNodeAPI: {
    ipcReceiveFromMain: (callback: any) => (receive = callback),
    ipcSendToMain: (command: string, key: string, ...args: any[]) =>
      commands.push({ command, key, args })
  }
}
async function load(file: string, dependencies: Record<string, any>) {
  const bundled = await build({
    entryPoints: [file],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    write: false,
    plugins: [
      {
        name: 'xterm-integration',
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
    window,
    require: (path: string) => dependencies[path] ?? {},
    console: { log: (...args: any[]) => logs.push(args) }
  })
  return module.exports
}
const ipc = (await load('src/render/util/IPC.ts', { './Index': { uuid: () => String(++id) } }))
  .default
const { XTerm } = await load('src/render/util/XTerm.ts', { './IPC': ipc })
const terminal = new XTerm()
terminal.ptyKey = 'test-terminal'
terminal.xterm = {
  attachCustomKeyEventHandler() {},
  onData: (callback: any) => (input = callback),
  dispose() {}
}
terminal.initEvent()
input!('a-password-fragment')
assert.ok(
  !JSON.stringify(logs).includes('a-password-fragment'),
  'real IPC must not log terminal keyboard input'
)
assert.equal(
  Object.keys(ipc.listens).length,
  0,
  'fire-and-forget keyboard writes must not retain a callback'
)
assert.equal(ipc.sensitiveKeys.size, 0, 'fire-and-forget keyboard writes must not retain a key')

const execution = terminal.send(['/usr/bin/sudo /bin/kill -9 -- 123'], true, true)
const execRequest = commands.at(-1)!
assert.ok(ipc.listens[execRequest.key])
const stopped = terminal.stop()
const stopRequest = commands.at(-1)!
receive!(undefined, stopRequest.command, stopRequest.key, { code: 0 })
await stopped
await execution
assert.equal(
  Object.keys(ipc.listens).length,
  0,
  'canceled exec callback must be removed even without a main exec reply'
)
terminal.destroy()
console.log(
  'XTerm real IPC: private keyboard input, fire-and-forget writes and canceled execution listener cleanup passed'
)
