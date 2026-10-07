import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { build } from 'esbuild'
import { runInNewContext } from 'node:vm'
import { spawnSync } from 'node:child_process'

const source = 'src/render/components/Tools/ProcessControl/SudoKill.ts'
assert.ok(existsSync(source), 'sudo kill needs a Tools-owned terminal task')
const tick = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve()
}
let mountError = false
let mounting: (() => void) | undefined
let delayedMount = false
const terminals: Terminal[] = []
const warnings: string[] = []
const dialogs: any[] = []
const completionMessage = "Complete 'quote' $HOME $(printf injected)"
class Terminal {
  ptyKey = ''
  end = false
  sends: any[] = []
  stops = 0
  destroyed = 0
  resolve?: (value: boolean) => void
  reject?: (error: Error) => void
  constructor() {
    terminals.push(this)
  }
  async mount() {
    if (delayedMount) await new Promise<void>((resolve) => (mounting = resolve))
    if (mountError) throw new Error('terminal init failed')
    this.ptyKey = 'test-pty'
  }
  send(...args: any[]) {
    this.sends.push(args)
    return new Promise<boolean>((resolve, reject) => {
      this.resolve = resolve
      this.reject = reject
    })
  }
  async stop() {
    this.stops++
    // Real XTerm.stop resolves a pending send: that is NOT a successful kill.
    this.resolve?.(true)
  }
  destroy() {
    this.destroyed++
  }
  write() {}
  unmounted() {}
}
const bundled = await build({
  entryPoints: [source],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false,
  plugins: [
    {
      name: 'terminal-boundaries',
      setup(builder) {
        builder.onResolve({ filter: /./ }, (args) => {
          if (args.kind === 'entry-point') return
          if (args.path.endsWith('/XTermExecDialog/index.vue'))
            return { path: 'dialog', namespace: 'fixture' }
          return { path: args.path, external: true }
        })
        builder.onLoad({ filter: /./, namespace: 'fixture' }, () => ({
          contents: 'export default {}'
        }))
      }
    }
  ]
})
const dependencies: Record<string, any> = {
  vue: { markRaw: (value: any) => value },
  '@/util/Index': { reactiveBind: (value: any) => value },
  '@/util/XTerm': Terminal,
  '@/util/XTermExec': { XTermExec: class {} },
  '@/util/Element': { MessageWarning: (value: string) => warnings.push(value) },
  '@lang/index': { I18nT: (key: string) => (key === 'base.success' ? completionMessage : key) },
  '@/util/AsyncComponent': {
    AsyncComponentShow: (_: unknown, props: any) => {
      dialogs.push(props)
      return new Promise(() => {})
    }
  }
}
const module = { exports: {} as any }
const server = { isWindows: false }
runInNewContext(bundled.outputFiles[0].text, {
  module,
  exports: module.exports,
  require: (path: string) => {
    assert.ok(path in dependencies, path)
    return dependencies[path]
  },
  window: { Server: server }
})
const { SudoKillTask, runSudoKill } = module.exports
const open = async () => {
  const task = new SudoKillTask(['123', '123', '456'], 'kill')
  const outcome = task.wait().then(
    () => 'success',
    (error: Error) => error.message
  )
  const execution = task.exec({}, task.command)
  await tick()
  return { task, outcome, execution, terminal: terminals.at(-1)! }
}
{
  const { task, outcome, execution, terminal } = await open()
  const [commands, mode, reportExitCode] = terminal.sends[0]
  assert.equal(commands[0], '/usr/bin/sudo /bin/kill -9 -- 123 456')
  assert.equal(mode, 'direct')
  assert.equal(reportExitCode, true)
  // Execute only the completion tail, replacing sudo kill with a controlled exit.
  for (const code of [0, 7]) {
    const shell = spawnSync(
      '/bin/sh',
      ['-c', [`(exit ${code})`, ...commands.slice(1)].join('\n')],
      { encoding: 'utf8' }
    )
    assert.equal(shell.status, code, 'completion output must preserve the actual kill result')
    assert.equal(
      shell.stdout,
      code === 0 ? `\x1b[32m${completionMessage}\x1b[0m\n` : '',
      'only success prints a green completion message, with localized text preserved literally'
    )
  }
  const failedOutput = spawnSync('/bin/sh', [
    '-c',
    ['printf() { return 3; }', '(exit 0)', ...commands.slice(1)].join('\n')
  ])
  assert.equal(failedOutput.status, 0, 'supplementary output cannot change a completed kill result')
  terminal.end = true
  terminal.resolve!(true)
  await execution
  assert.equal(task.execEnd, true)
  await task.taskCancel()
  assert.equal(await outcome, 'success', 'closing a completed command preserves its result')
  await task.taskConfirm()
  assert.equal(terminal.destroyed, 1, 'close and unmount cleanup is idempotent')
}
{
  const { task, outcome, execution, terminal } = await open()
  terminal.end = true
  terminal.reject!(new Error('Terminal exited with code 1'))
  await execution
  await task.taskConfirm()
  assert.equal(await outcome, 'Terminal exited with code 1')
}
{
  const { task, outcome, execution, terminal } = await open()
  await task.taskCancel()
  await execution
  assert.equal(await outcome, 'base.cancel')
  assert.equal(terminal.stops, 1)
  assert.equal(terminal.destroyed, 1)
}
{
  delayedMount = true
  const { task, outcome, execution, terminal } = await open()
  const closing = task.taskCancel()
  mounting!()
  await closing
  await execution
  assert.equal(await outcome, 'base.cancel')
  assert.equal(terminal.sends.length, 0, 'close during mount cannot execute kill')
  assert.equal(terminal.stops, 1, 'a late-created PTY is stopped')
  assert.equal(terminal.destroyed, 1)
  delayedMount = false
}
{
  mountError = true
  const { task, outcome, execution, terminal } = await open()
  await execution
  await task.taskConfirm()
  assert.equal(await outcome, 'terminal init failed')
  assert.equal(terminal.sends.length, 0)
  assert.equal(terminal.destroyed, 1)
  mountError = false
}
{
  const task = new SudoKillTask(['1', '-10', '123; touch /tmp/injected', '456'], 'kill')
  assert.equal(task.command[0], '/usr/bin/sudo /bin/kill -9 -- 456')
  assert.equal(warnings.length, 3, 'invalid candidates are skipped individually')
  assert.throws(() => new SudoKillTask(['1'], 'kill'))
}
{
  const execution = runSudoKill(['789'], 'kill')
  const outcome = execution.then(
    () => 'success',
    (error: Error) => error.message
  )
  assert.equal(runSudoKill(['789'], 'kill'), execution, 'same request joins the terminal task')
  await assert.rejects(runSudoKill(['790'], 'kill'), /already/)
  await tick()
  assert.equal(dialogs.length, 1)
  const task = dialogs[0].item
  await task.taskCancel()
  assert.equal(await outcome, 'base.cancel', 'close before open releases the operation')
  const next = runSudoKill(['790'], 'kill').catch((error: Error) => error.message)
  await tick()
  assert.equal(dialogs.length, 2)
  await dialogs[1].item.taskCancel()
  assert.equal(await next, 'base.cancel')
  server.isWindows = true
  await assert.rejects(runSudoKill(['789'], 'kill'), /Unix/)
}
console.log(
  'sudo terminal: exit status, cancellation, late mount cleanup, PID validation and re-entry passed'
)
