import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { existsSync } from 'node:fs'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Base } from '../src/fork/module/Base'
import consul from '../src/fork/module/Consul'
import { ServiceProcessExitTimeoutError } from '../src/shared/ServiceStop'
import type { SoftInstalled } from '../src/shared/app'

if (process.platform === 'win32') {
  console.log('Consul Unix graceful stop regression: skipped on Windows')
  process.exit(0)
}

const root = await mkdtemp(join(tmpdir(), 'flyenv-consul-stop-'))
const previousServer = global.Server
const previousPidPath = consul.pidPath
const originalNow = Date.now
const children: ChildProcess[] = []
try {
  global.Server = { BaseDir: root } as typeof global.Server
  consul.init()
  await mkdir(join(root, 'consul'))
  await mkdir(join(root, 'pid'))
  const appPidFile = join(root, 'pid/consul.pid')
  const bin = join(root, 'fixture.cjs')
  await writeFile(
    bin,
    `setInterval(() => {}, 1000);
     process.on('SIGINT', () => {
       const delay = Number(process.argv[2]);
       if (delay >= 0) setTimeout(() => process.exit(0), delay);
     });
     console.log('ready');`
  )
  assert.equal((new Base() as any)._stopTimeoutMs(), 10_000)
  assert.equal((consul as any)._stopTimeoutMs(), 60_000)
  for (const delay of [16_000, 0, -1]) {
    const child = spawn(process.execPath, [bin, `${delay}`], {
      stdio: ['ignore', 'pipe', 'inherit']
    })
    children.push(child)
    await once(child.stdout!, 'data')
    const pid = `${child.pid}`
    for (const file of [appPidFile, consul.pidPath]) await writeFile(file, pid)
    const version = { bin, path: root, version: '1.22.0', pid } as SoftInstalled
    const started = originalNow()
    if (delay < 0) {
      let clockReads = 0
      Date.now = () => originalNow() + (clockReads++ === 0 ? 0 : 60_001)
      await assert.rejects(
        Promise.resolve(consul._stopServer(version)),
        ServiceProcessExitTimeoutError
      )
      Date.now = originalNow
      for (const file of [appPidFile, consul.pidPath]) {
        assert.equal(await readFile(file, 'utf8'), pid)
      }
      process.kill(child.pid!, 0)
      console.log('Timeout retains live PID and both registrations: passed')
    } else {
      const result: any = await consul._stopServer(version)
      assert.deepEqual(result['APP-Service-Stop-PID'], [pid])
      assert.ok(delay ? originalNow() - started >= delay : originalNow() - started < 10_000)
      for (const file of [appPidFile, consul.pidPath]) assert.equal(existsSync(file), false)
      console.log(`${delay ? 'Sixteen-second graceful' : 'Fast'} exit: passed`)
    }
  }
} finally {
  Date.now = originalNow
  for (const child of children) {
    if (child.exitCode !== null || child.signalCode !== null) continue
    const exited = once(child, 'exit')
    child.kill('SIGKILL')
    await exited
  }
  consul.pidPath = previousPidPath
  global.Server = previousServer
  await rm(root, { recursive: true, force: true })
}
