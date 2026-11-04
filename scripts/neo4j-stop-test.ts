import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { existsSync } from 'node:fs'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import neo4j from '../src/fork/module/Neo4j'
import { ServiceProcessExitTimeoutError } from '../src/shared/ServiceStop'
import type { SoftInstalled } from '../src/shared/app'

if (process.platform === 'win32') {
  console.log('Neo4j Unix graceful stop regression: skipped on Windows')
  process.exit(0)
}

const root = await mkdtemp(join(tmpdir(), 'flyenv-neo4j-stop-'))
const previousServer = global.Server
const previousPidPath = neo4j.pidPath
const originalNow = Date.now
const children: ChildProcess[] = []
const workerPids = new Set<number>()
const killFixtureWorker = (pid: number) => {
  try {
    process.kill(pid, 'SIGKILL')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
  }
}
try {
  global.Server = { BaseDir: root, Neo4jDir: join(root, 'neo4j') } as typeof global.Server
  const install = join(root, 'install')
  const bin = join(install, 'fixture.cjs')
  await mkdir(install)
  await mkdir(join(root, 'pid'))
  await writeFile(
    bin,
    `const {spawn} = require('node:child_process');
     const worker = process.argv[2] === 'worker';
     const delay = Number(process.argv[3]);
     setInterval(() => {}, 1000);
     process.on('SIGTERM', () => {
       if (delay >= 0) setTimeout(() => process.exit(0), delay + (worker ? 1000 : 0));
     });
     if (worker) console.log('ready');
     else {
       const child = spawn(process.execPath, [__filename, 'worker', String(delay)], {
         stdio: ['ignore', 'pipe', 'inherit']
       });
       child.stdout.once('data', () => console.log(child.pid));
     }`
  )
  const fixture = async (id: string, delay: number) => {
    const child = spawn(process.execPath, [bin, 'root', `${delay}`], {
      stdio: ['ignore', 'pipe', 'inherit']
    })
    children.push(child)
    const [output] = await once(child.stdout!, 'data')
    const workerPid = Number(`${output}`.trim())
    assert.ok(Number.isSafeInteger(workerPid) && workerPid > 1)
    workerPids.add(workerPid)
    const instanceDir = join(root, id)
    await mkdir(instanceDir)
    const pidFile = join(instanceDir, 'neo4j.pid')
    await writeFile(pidFile, `${child.pid}`)
    neo4j.pidPath = pidFile
    const version = { bin, path: install, version: '2026.10.1' } as SoftInstalled
    return { child, workerPid, pidFile, version, params: { neo4jInstanceDir: instanceDir } }
  }

  // Both processes outlive the old deadline; the worker also outlives its parent.
  const delayed = await fixture('delayed', 11_000)
  const started = originalNow()
  const stopped: any = await neo4j._stopServer(delayed.version, delayed.params)
  assert.deepEqual(
    new Set(stopped['APP-Service-Stop-PID']),
    new Set([`${delayed.child.pid}`, `${delayed.workerPid}`])
  )
  assert.ok(originalNow() - started >= 12_000)
  assert.equal(existsSync(delayed.pidFile), false)
  workerPids.delete(delayed.workerPid)
  console.log('Delayed parent/worker exit beyond ten seconds: passed')

  const fast = await fixture('fast', 0)
  const fastStarted = originalNow()
  await neo4j._stopServer(fast.version, fast.params)
  assert.ok(originalNow() - fastStarted < 10_000)
  assert.equal(existsSync(fast.pidFile), false)
  workerPids.delete(fast.workerPid)
  console.log('Fast exit does not wait the entire deadline: passed')

  const stuck = await fixture('stuck', -1)
  let clockReads = 0
  Date.now = () => originalNow() + (clockReads++ === 0 ? 0 : 120_001)
  await assert.rejects(
    Promise.resolve(neo4j._stopServer(stuck.version, stuck.params)),
    ServiceProcessExitTimeoutError
  )
  Date.now = originalNow
  assert.equal(await readFile(stuck.pidFile, 'utf8'), `${stuck.child.pid}`)
  for (const pid of [stuck.child.pid!, stuck.workerPid]) process.kill(pid, 0)
  console.log('Timeout retains the live process registration: passed')
} finally {
  Date.now = originalNow
  // Only test-owned roots and their explicitly reported workers are ever signaled.
  for (const pid of workerPids) killFixtureWorker(pid)
  for (const child of children) {
    if (child.exitCode !== null || child.signalCode !== null) continue
    const exited = once(child, 'exit')
    child.kill('SIGKILL')
    await exited
  }
  neo4j.pidPath = previousPidPath
  global.Server = previousServer
  await rm(root, { recursive: true, force: true })
}
