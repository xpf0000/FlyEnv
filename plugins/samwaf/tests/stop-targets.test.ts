import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { PItem } from '@shared/Process'
import { supervisedSamWafTreePids } from '../fork/SamWaf/stopTargets'

// Live process shape captured from SamWaf v1.3.24 on Windows (2026-… probe):
// the supervisor is launched via `start "" /B ./SamWaf64.exe`, so its command
// line stays relative and never carries the absolute install markers Base's
// ownership check requires; only the worker does.
const BIN = 'D:\\Program Files\\PhpWebStudy-Data\\app\\samwaf\\v1.3.24\\SamWaf64.exe'
const APP_DIR = 'D:\\Program Files\\PhpWebStudy-Data\\app\\samwaf\\v1.3.24'
const MARKERS = [BIN, APP_DIR]

const supervisor: PItem = {
  PID: '21128',
  PPID: '26180',
  USER: '',
  COMMAND: './SamWaf64.exe  ',
  CREATED: '2026-01-01T10:00:00.000000000Z',
  EXECUTABLE: BIN
}
const worker: PItem = {
  PID: '26052',
  PPID: '21128',
  USER: '',
  COMMAND: `"${BIN}" --worker --ctrl-addr=127.0.0.1:60770 --token=b5787d93e6b4f17259ca0d9173b141c1`,
  CREATED: '2026-01-01T10:00:01.000000000Z',
  EXECUTABLE: BIN
}

// A foreign install of the same binary in another directory: never ours.
const foreignBin = 'C:\\tools\\samwaf\\v1.3.24\\SamWaf64.exe'
const foreignSupervisor: PItem = {
  PID: '30001',
  PPID: '1',
  USER: '',
  COMMAND: './SamWaf64.exe',
  CREATED: '2026-01-01T09:00:00.000000000Z',
  EXECUTABLE: foreignBin
}
const foreignWorker: PItem = {
  PID: '30002',
  PPID: '30001',
  USER: '',
  COMMAND: `"${foreignBin}" --worker --ctrl-addr=127.0.0.1:60771 --token=aaaa`,
  CREATED: '2026-01-01T09:00:01.000000000Z',
  EXECUTABLE: foreignBin
}

const list = [supervisor, worker, foreignSupervisor, foreignWorker]

test('recovers the supervisor root through its owned worker descendant', () => {
  // Base already selected the worker (registered pid); the supervisor must be
  // added so taskkill does not leave it alive to respawn the worker.
  const extra = supervisedSamWafTreePids(list, MARKERS, new Set([worker.PID]))
  assert.deepEqual(extra, [supervisor.PID])
})

test('selects the whole tree when nothing is pre-selected', () => {
  const extra = supervisedSamWafTreePids(list, MARKERS, new Set())
  assert.ok(extra.includes(supervisor.PID))
  assert.ok(extra.includes(worker.PID))
  // Parent first: the supervisor dies before the worker it would restart.
  assert.ok(extra.indexOf(supervisor.PID) < extra.indexOf(worker.PID))
})

test('never claims a foreign SamWaf instance', () => {
  const extra = supervisedSamWafTreePids(list, MARKERS, new Set())
  assert.equal(extra.includes(foreignSupervisor.PID), false)
  assert.equal(extra.includes(foreignWorker.PID), false)
})

test('a lone samwaf-named root without an owned descendant is not claimed', () => {
  const lone: PItem = {
    PID: '40001',
    PPID: '1',
    USER: '',
    COMMAND: './SamWaf64.exe',
    CREATED: '2026-01-01T08:00:00.000000000Z',
    EXECUTABLE: 'C:\\elsewhere\\SamWaf64.exe'
  }
  const extra = supervisedSamWafTreePids([...list, lone], MARKERS, new Set())
  assert.equal(extra.includes(lone.PID), false)
})
