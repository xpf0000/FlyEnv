import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { existsSync } from 'node:fs'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CloudflareTunnel } from '../src/fork/module/CloudflareTunnel/CloudflareTunnel'
import { ServiceProcessExitTimeoutError } from '../src/shared/ServiceStop'

if (process.platform === 'win32') {
  console.log('Cloudflare Tunnel Unix graceful stop: skipped on Windows')
  process.exit(0)
}

const root = await mkdtemp(join(tmpdir(), 'flyenv-cloudflare-stop-'))
const previousServer = global.Server
const children: ChildProcess[] = []
const originalNow = Date.now
try {
  global.Server = { BaseDir: root } as typeof global.Server
  await mkdir(join(root, 'cloudflare-tunnel'))
  const fixture = async (id: string, delay: number) => {
    // Only test-owned Node children are signaled; no tunnel credentials or user services.
    const child = spawn(
      process.execPath,
      [
        '-e',
        `setInterval(() => {}, 1000);
         process.on('SIGINT', () => {
           console.log('stopping');
           if (${delay} >= 0) setTimeout(() => process.exit(0), ${delay});
         });
         console.log('ready');`
      ],
      { stdio: ['ignore', 'pipe', 'inherit'] }
    )
    children.push(child)
    await once(child.stdout!, 'data')
    const model = new CloudflareTunnel()
    Object.assign(model, { id, pid: `${child.pid}`, cloudflaredBin: process.execPath })
    const pidFile = join(root, 'cloudflare-tunnel', `${id}.pid`)
    await writeFile(pidFile, model.pid)
    return { model, child, pidFile }
  }

  // Exceed both the old ten-second deadline and cloudflared's default thirty-second drain.
  const delayed = await fixture('delayed', 31_000)
  const pid = delayed.model.pid
  const stopping = once(delayed.child.stdout!, 'data')
  const started = originalNow()
  const result = delayed.model.stop()
  await stopping
  assert.equal(delayed.model.pid, pid)
  assert.equal(await readFile(delayed.pidFile, 'utf8'), pid)
  assert.equal(await result, pid)
  assert.ok(originalNow() - started >= 31_000)
  assert.equal(delayed.model.pid, '')
  assert.equal(existsSync(delayed.pidFile), false)
  assert.equal(await delayed.model.stop(), '')
  console.log('Delayed graceful exit and repeated stop: passed')

  const fast = await fixture('fast', 0)
  const fastStarted = originalNow()
  assert.equal(await fast.model.stop(), `${fast.child.pid}`)
  assert.ok(originalNow() - fastStarted < 10_000, 'fast exit must not wait the entire deadline')
  assert.equal(existsSync(fast.pidFile), false)
  console.log('Fast exit completes immediately: passed')

  // Accelerate the deadline clock after the first fresh poll; the child really stays alive.
  const stuck = await fixture('stuck', -1)
  let clockReads = 0
  Date.now = () => originalNow() + (clockReads++ === 0 ? 0 : 40_001)
  await assert.rejects(stuck.model.stop(), ServiceProcessExitTimeoutError)
  Date.now = originalNow
  assert.equal(stuck.model.pid, `${stuck.child.pid}`)
  assert.equal(await readFile(stuck.pidFile, 'utf8'), stuck.model.pid)
  process.kill(stuck.child.pid!, 0)
  console.log('Actual timeout retains live PID and registration: passed')
} finally {
  Date.now = originalNow
  for (const child of children) {
    if (child.exitCode !== null || child.signalCode !== null) continue
    const exited = once(child, 'exit')
    child.kill('SIGKILL')
    await exited
  }
  global.Server = previousServer
  await rm(root, { recursive: true, force: true })
}
