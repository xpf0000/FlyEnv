import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { buildWindowsCronWrapperScript } from '../src/fork/module/Cron/WindowsSystemScheduler'

if (process.platform !== 'win32') {
  console.log('windows cron wrapper runtime tests skipped: Windows required')
  process.exit(0)
}

const waitForExit = (child: ReturnType<typeof spawn>) => {
  if (child.exitCode !== null) return Promise.resolve(child.exitCode)
  if (child.signalCode !== null) return Promise.resolve(1)
  return new Promise<number>((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', (code) => resolve(code ?? 1))
  })
}

const waitForFile = async (file: string) => {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const content = await readFile(file, 'utf8').catch(() => '')
    if (content.trim()) return content
    await delay(100)
  }
  throw new Error(`Timed out waiting for ${file}`)
}

const root = await mkdtemp(join(tmpdir(), 'flyenv-windows-cron-runtime-'))
try {
  const counter = join(root, 'counter.txt')
  const logFile = join(root, 'runs', 'runtime.jsonl')
  const wrapper = join(root, 'runtime.ps1')
  const command = `echo run>>"${counter}" & echo FlyEnv Cron output & ping 127.0.0.1 -n 3 >nul`
  await writeFile(
    wrapper,
    buildWindowsCronWrapperScript({
      jobId: 'runtime',
      scope: 'global',
      command,
      workDir: root,
      runDir: join(root, 'tmp'),
      logFile,
      cmdExe: process.env.ComSpec || 'cmd.exe',
      envPath: process.env.Path || ''
    })
  )

  const run = () =>
    spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', wrapper],
      { windowsHide: true }
    )

  const first = run()
  await waitForFile(counter)
  const second = run()
  assert.equal(await waitForExit(second), 0)
  assert.equal(await waitForExit(first), 0)
  assert.equal((await readFile(counter, 'utf8')).trim().split(/\r?\n/).length, 1)

  await writeFile(counter, '')
  const interrupted = run()
  await waitForFile(counter)
  assert.ok(interrupted.pid)
  const killer = spawn('taskkill.exe', ['/PID', `${interrupted.pid}`, '/T', '/F'], {
    windowsHide: true
  })
  assert.equal(await waitForExit(killer), 0)
  await waitForExit(interrupted)
  assert.equal(await waitForExit(run()), 0)
  assert.equal((await readFile(counter, 'utf8')).trim().split(/\r?\n/).length, 2)

  const records = (await readFile(logFile, 'utf8')).trim().split(/\r?\n/)
  assert.ok(records.length >= 2)
  assert.ok(records.some((line) => JSON.parse(line).output.includes('FlyEnv Cron output')))
} finally {
  await rm(root, { recursive: true, force: true })
}

console.log('windows cron wrapper runtime tests passed')
