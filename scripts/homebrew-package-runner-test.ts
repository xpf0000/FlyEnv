import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtemp, writeFile, chmod, rm } from 'node:fs/promises'
import { tmpdir, constants } from 'node:os'
import { join } from 'node:path'
import { quotePosixShell } from '../src/shared/Gvm'
import { formulaName } from '../src/fork/module/Brew/UpgradeCatalog'
import { loadIsolated } from './helpers/load-isolated'

const root = await mkdtemp(join(tmpdir(), 'brew terminal '))
const { default: terminal } = await loadIsolated('src/main/core/NodePTY.ts', {
  '@shared/Process': await import('../src/shared/Process'),
  '@shared/ServiceStop': await import('../src/shared/ServiceStop'),
  '../utils': { uuid: randomUUID, chmod, remove: rm, writeFile },
  '@shared/EnvSync': { sync: async () => ({ ...process.env, ZDOTDIR: root }) },
  '@shared/utils': {
    isMacOS: () => process.platform === 'darwin',
    isLinux: () => process.platform === 'linux',
    isWindows: () => false,
    waitTime: (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
  }
})
try {
  const bin = join(root, "fake 'brew'")
  await writeFile(
    bin,
    `#!${process.execPath}
const formula = process.argv.at(-1);
console.log(JSON.stringify(process.argv.slice(2)));
console.log('TTY', !!process.stdin.isTTY, !!process.stdout.isTTY, !!process.stderr.isTTY);
if (formula.endsWith('-interactive')) {
  console.log('waiting for input');
  process.stdin.once('data', value => {
    const size = require('node:child_process').execFileSync('stty', ['size'], { stdio: [0, 'pipe', 'pipe'] }).toString().trim();
    console.log('received', value.toString().trim(), size);
    process.stdin.pause();
  });
} else if (formula.endsWith('-fail')) {
  console.error('failure');
  process.exitCode = 7;
} else if (formula.endsWith('-signal')) {
  process.kill(process.pid, 'SIGTERM');
} else if (formula.endsWith('-group') || formula.endsWith('-detached')) {
  const source = "process.on('SIGTERM',()=>{});process.on('SIGHUP',()=>{});process.send(process.pid);setInterval(()=>{},1000)";
  const child = require('node:child_process').spawn(process.execPath, ['-e', source], {
    stdio:['ignore','ignore','ignore','ipc'], detached:formula.endsWith('-detached')
  });
  child.once('message', pid => console.log('group child', pid));
} else if (formula.endsWith('-slow')) {
  process.on('SIGTERM', () => setTimeout(() => process.exit(3), 100));
  setInterval(() => console.log('working'), 20);
}`
  )
  await chmod(bin, 0o755)
  const run = async (formula: string, onOutput?: (key: string, logs: string) => void) => {
    const command = `exec ${[bin, 'upgrade', '--formula', '--verbose', formulaName(formula)].map(quotePosixShell).join(' ')}`
    const key = await terminal.initNodePty()
    let logs = ''
    let started = false
    const done = terminal.execAndWait(key, [command], {
      onStarted: () => {
        started = true
      },
      onOutput: (output: string) => {
        logs += output
        onOutput?.(key, logs)
      }
    })
    assert.equal(started, true)
    return { key, done: done.then((exit: any) => ({ ...exit, logs })) }
  }
  let streamed = ''
  terminal.onSendCommand((channel: string, key: string, data: string) => {
    assert.equal(channel, key)
    assert.match(channel, /^NodePty:data:/)
    streamed += data
  })
  const ok = await (await run('php')).done
  assert.equal(ok.exitCode, 0)
  assert.match(ok.logs, /\["upgrade","--formula","--verbose","homebrew\/core\/php"\]/)
  assert.match(streamed, /TTY true true true/)
  let answered = false
  const interactive = await run('php-interactive', (key, output) => {
    if (answered || !output.includes('waiting for input')) return
    answered = true
    terminal.resize(key, { cols: 64, rows: 21 })
    terminal.write(key, 'answer\r')
  })
  assert.match((await interactive.done).logs, /received answer 21 64/)
  assert.equal((await (await run('php-fail')).done).exitCode, 7)
  assert.equal((await (await run('php-signal')).done).signal, constants.signals.SIGTERM)
  await assert.rejects(run('php;invalid command'))
  let active!: () => void
  const ready = new Promise<void>((resolve) => {
    active = resolve
  })
  const slow = await run('php-slow', (_key, output) => {
    if (output.includes('working')) active()
  })
  await ready
  await assert.rejects(terminal.exec(slow.key, ['echo second'], 'direct', '', ''), /unavailable/)
  const stoppedAt = Date.now()
  terminal.stop(slow.key)
  assert(terminal.pty[slow.key])
  const canceled = await slow.done
  assert.equal(canceled.canceled, true)
  assert.equal(canceled.exitCode, 3)
  assert(Date.now() - stoppedAt >= 90)
  assert.equal(terminal.pty[slow.key], undefined)
  for (const [formula, keyboard] of [
    ['php-group', false],
    ['php-detached', false],
    ['php-detached', true]
  ] as const) {
    let childReady!: (pid: number) => void
    const childStarted = new Promise<number>((resolve) => {
      childReady = resolve
    })
    const group = await run(formula, (_key, output) => {
      const pid = /group child (\d+)/.exec(output)?.[1]
      if (pid) childReady(Number(pid))
    })
    const childPid = await childStarted
    try {
      if (keyboard) terminal.write(group.key, '\x03')
      else terminal.stop(group.key)
      assert.equal((await group.done).canceled, true)
      assert.throws(() => process.kill(childPid, 0), { code: 'ESRCH' })
    } finally {
      try {
        process.kill(childPid, 'SIGKILL')
      } catch {}
    }
  }
  console.log(
    'PASS shared NodePTY: native TTY, output channel, argv, input, resize, exit code and signal, cancel waits for exit'
  )
} finally {
  terminal.exitAllPty()
  await rm(root, { recursive: true, force: true })
}
