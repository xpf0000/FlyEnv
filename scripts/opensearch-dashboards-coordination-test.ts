import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { OpenSearchDashboardsCoordination } from '../plugins/opensearch/fork/OpenSearch/coordination'

const delay = (ms: number) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms))
const scriptPath = resolve(process.argv[1])
const childMode = process.argv[2] === '--coord-worker'

if (childMode) {
  const [root, action, marker, msText] = process.argv.slice(3)
  const coordination = new OpenSearchDashboardsCoordination(root)
  const release = await coordination.acquire('cross-process')
  if (action === 'crash') {
    process.stdout.write(`LOCKED ${process.pid}\n`)
    process.exit(0)
  }
  try {
    const fs = await import('node:fs/promises')
    await fs.writeFile(marker, `${process.pid}`, { flag: 'wx' })
    process.stdout.write(`ENTER ${process.pid}\n`)
    await delay(Number(msText))
  } catch (error: any) {
    if (error?.code === 'EEXIST') process.exitCode = 9
    else throw error
  } finally {
    await rm(marker, { force: true })
    await release()
  }
  process.exit(process.exitCode ?? 0)
}

const runChild = (...args: string[]) => {
  const child = spawn(
    process.execPath,
    ['--import', 'tsx', scriptPath, '--coord-worker', ...args],
    {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    }
  )
  let stdout = ''
  let stderr = ''
  child.stdout?.on('data', (chunk) => {
    stdout += chunk
  })
  child.stderr?.on('data', (chunk) => {
    stderr += chunk
  })
  const closed = new Promise<number>((resolveClose, rejectClose) => {
    child.once('error', rejectClose)
    child.once('close', (code) =>
      code === 0 ? resolveClose(code) : rejectClose(new Error(stderr || `worker exit ${code}`))
    )
  })
  return { child, closed, output: () => stdout, error: () => stderr }
}

const waitOutput = async (
  child: ReturnType<typeof runChild>,
  pattern: RegExp,
  timeoutMs = 5000
) => {
  const until = Date.now() + timeoutMs
  while (Date.now() < until) {
    if (pattern.test(child.output())) return child.output()
    if (child.child.exitCode !== null) break
    await delay(20)
  }
  throw new Error(`Child did not emit ${pattern}; stdout=${child.output()} stderr=${child.error()}`)
}

const root = await mkdtemp(join(tmpdir(), 'flyenv-dashboards-coordination-'))
try {
  const coordination = new OpenSearchDashboardsCoordination(root)
  assert.equal(await coordination.readGeneration(), '')
  const firstEpoch = await coordination.invalidate()
  assert.equal(await coordination.readGeneration(), firstEpoch)
  const concurrentEpochs = await Promise.all(
    Array.from({ length: 30 }, () => coordination.invalidate())
  )
  const currentEpoch = await coordination.readGeneration()
  assert.equal(new Set(concurrentEpochs).size, concurrentEpochs.length)
  assert.ok(concurrentEpochs.includes(currentEpoch), 'final epoch is one of the concurrent writes')
  const stale = coordination.assertCurrent('')
  await assert.rejects(stale, /generation/i)
  await assert.rejects(coordination.assertCurrent(firstEpoch), /generation/i)
  await coordination.assertCurrent(currentEpoch)

  const observerController = new AbortController()
  const stopObserving = coordination.observe(observerController, currentEpoch)
  const secondEpoch = await coordination.invalidate()
  for (let attempt = 0; attempt < 50 && !observerController.signal.aborted; attempt++)
    await delay(20)
  stopObserving()
  assert.equal(
    observerController.signal.aborted,
    true,
    'generation observer aborts a stale operation'
  )
  assert.match(`${observerController.signal.reason}`, /generation/i)
  assert.notEqual(secondEpoch, currentEpoch)

  const release = await coordination.acquire('single-process')
  const waiterAbort = new AbortController()
  const waiting = coordination.acquire('single-process', waiterAbort.signal, 5000)
  await delay(120)
  waiterAbort.abort(new Error('waiter cancelled'))
  await assert.rejects(waiting, /cancel/i)
  await release()

  const marker = join(root, 'exclusive.marker')
  const childOne = runChild(root, 'hold', marker, '220')
  await waitOutput(childOne, /ENTER/)
  const childTwo = runChild(root, 'hold', marker, '50')
  await waitOutput(childTwo, /ENTER/)
  await Promise.all([childOne.closed, childTwo.closed])

  const crashChild = runChild(root, 'crash', marker, '0')
  const crashOutput = await waitOutput(crashChild, /LOCKED (\d+)/)
  const crashedPid = crashOutput.match(/LOCKED (\d+)/)?.[1]
  assert.ok(crashedPid)
  await crashChild.closed
  const afterCrashRelease = await coordination.acquire('cross-process', undefined, 5000)
  await afterCrashRelease()
  assert.equal(existsSync(marker), false)

  const unknownLock = join(root, 'opensearch-dashboards', '.coordination', 'locks', 'unknown-owner')
  await mkdir(unknownLock, { recursive: true })
  await writeFile(join(unknownLock, 'owner.json'), '{malformed')
  await assert.rejects(
    coordination.acquire('unknown-owner', undefined, 10_000),
    /owner is unverifiable/i
  )

  const staleLock = join(root, 'opensearch-dashboards', '.coordination', 'locks', 'stale-reaper')
  const staleReaper = `${staleLock}.reaping`
  await mkdir(staleLock, { recursive: true })
  await mkdir(staleReaper, { recursive: true })
  await writeFile(
    join(staleLock, 'owner.json'),
    JSON.stringify({ pid: Number(crashedPid), token: randomUUID() })
  )
  await writeFile(
    join(staleReaper, 'owner.json'),
    JSON.stringify({ pid: Number(crashedPid), token: randomUUID() })
  )
  await assert.rejects(
    coordination.acquire('stale-reaper', undefined, 100),
    /recovery owner is dead/i,
    'a dead reaper record fails safely instead of spinning past the lock timeout'
  )
  assert.equal(existsSync(join(staleLock, 'owner.json')), true)

  const directory = join(root, 'opensearch-dashboards', '.coordination')
  await mkdir(directory, { recursive: true })
  const generationFile = join(directory, 'generation')
  assert.equal(await readFile(generationFile, 'utf8'), secondEpoch)
} finally {
  await rm(root, { recursive: true, force: true })
}

console.log('OpenSearch Dashboards coordination tests passed')
