import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { parseUnixProcessList } from '../src/shared/Process.unix'
import { collectProcessSnapshotTree, compareProcessCreation } from '../src/shared/ProcessSnapshot'
import {
  captureServiceProcessIdentity,
  stopRegisteredServiceProcesses,
  verifyServiceProcessIdentity
} from '../src/shared/ServiceProcessIdentity'
import { ProcessListFetch } from '../src/shared/Process'
import { withServiceStopContext } from '../src/shared/ServiceStopContext'
import { waitForServiceProcessExit } from '../src/shared/ServiceStop'

// Both BSD and procps pad single-digit days; commands may be empty or contain spaces.
const list = parseUnixProcessList(`
 user 4200 1 Tue Oct  6 08:09:10 2026 /Applications/My Service/bin/server --config /tmp/a b
 user 4201 4200 Tue Oct  6 08:09:11 2026 worker
 user 4202 4200 Tue Oct  6 08:09:09 2026 old worker
 root 4203 1 Tue Oct  6 08:09:10 2026
`)
assert.equal(list[0].CREATED, '2026-10-06T08:09:10.000Z')
assert.equal(list[0].COMMAND, '/Applications/My Service/bin/server --config /tmp/a b')
assert.equal(list[3].COMMAND, '')
assert.deepEqual(
  collectProcessSnapshotTree('4200', list).map(({ PID }) => PID),
  ['4200', '4201']
)
assert.equal(compareProcessCreation(list[2].CREATED, list[0].CREATED), -1)
assert.throws(() => parseUnixProcessList(''), /empty process list/)
assert.throws(() => parseUnixProcessList('user 4200 1 not a start time server'), /Invalid ps/)

// Observed startup evidence must be used directly: no per-PID OS query is available here.
const identity = {
  pid: '4200',
  launchedAt: Date.parse('2026-10-06T08:09:10Z'),
  registeredAt: Date.parse('2026-10-06T08:09:11Z'),
  created: list[0].CREATED
}
await verifyServiceProcessIdentity('4200', identity, '', list[0])
await assert.rejects(
  verifyServiceProcessIdentity('4200', identity, '', { ...list[0], CREATED: list[1].CREATED }),
  /identity changed/
)
await assert.rejects(
  verifyServiceProcessIdentity('4200', identity, '', { ...list[0], CREATED: undefined }),
  /identity changed/
)

// A reused PID is no longer the service; unknown identity must remain a failure.
const reused = [{ ...list[0], CREATED: list[1].CREATED }]
assert.strictEqual(
  await waitForServiceProcessExit(['4200'], 0, {
    initialList: list,
    fetchList: async () => reused
  }),
  reused
)
await assert.rejects(
  waitForServiceProcessExit(['4200'], 0, {
    initialList: list,
    fetchList: async () => [{ ...list[0], CREATED: undefined }]
  }),
  /still running/
)
if (process.platform !== 'win32') {
  const launchedAt = Date.now()
  // Model service preparation inside the launch request. WSL/procps can report
  // lstart behind the wall clock; keep the production startup window unchanged.
  await new Promise((resolve) => setTimeout(resolve, 2000))
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' })
  await once(child, 'spawn')
  const exited = once(child, 'exit')
  try {
    const pid = String(child.pid)
    const identity = await captureServiceProcessIdentity(pid, launchedAt)
    assert.ok(identity.created, 'startup sampling must capture Unix creation time')
    const liveList = await ProcessListFetch()
    const root = liveList.find((item) => item.PID === pid)!
    assert.equal(
      root.CREATED,
      identity.created,
      'list and startup sampling must use the same UTC time'
    )
    const changed = liveList.map((item) =>
      item.PID === pid ? { ...item, CREATED: '2000-01-01T00:00:00.000Z' } : item
    )
    assert.deepEqual(
      await withServiceStopContext({ processList: changed, reason: 'quit' }, () =>
        stopRegisteredServiceProcesses(pid, identity)
      ),
      [],
      'a reused PID must be filtered before signalling'
    )
    process.kill(Number(pid), 0)
    const stopped = await withServiceStopContext({ processList: liveList, reason: 'quit' }, () =>
      stopRegisteredServiceProcesses(pid, identity)
    )
    assert.ok(stopped.includes(pid))
    await exited
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
  }
}
console.log('Unix process list and identity tests passed')
