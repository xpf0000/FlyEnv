import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fork } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { setTimeout as delay } from 'node:timers/promises'
import { DataRootLease } from '../src/fork/runtime/DataRootLease'

test('a surviving child retains its kernel lease after the owner host dies', async () => {
  const root = await mkdtemp(join(tmpdir(), 'flyenv-orphan-test-'))
  const host = fork(
    fileURLToPath(new URL('./fixtures/plugin-memory-orphan.ts', import.meta.url)),
    [root],
    {
      execArgv: ['--import', 'tsx'],
      stdio: ['ignore', 'ignore', 'inherit', 'ipc']
    }
  )
  let workerPid: number | undefined
  try {
    workerPid = await new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('orphan readiness timeout')), 5000)
      host.once('message', (message) => {
        clearTimeout(timer)
        resolve((message as { pid: number }).pid)
      })
    })
    const exited = new Promise<void>((resolve) => host.once('exit', () => resolve()))
    host.kill('SIGKILL')
    await exited
    await assert.rejects(DataRootLease.acquire(root), (error: any) => error.code === 'owner_busy')
    process.kill(workerPid, 'SIGKILL')
    workerPid = undefined
    let acquired = false
    for (let i = 0; i < 50; i++) {
      try {
        const lease = await DataRootLease.acquire(root)
        await lease.release()
        acquired = true
        break
      } catch (error) {
        if ((error as { code: string }).code !== 'owner_busy') throw error
        await delay(10)
      }
    }
    assert.equal(acquired, true)
  } finally {
    host.kill('SIGKILL')
    if (workerPid) {
      try {
        process.kill(workerPid, 'SIGKILL')
      } catch {}
    }
    await rm(root, { recursive: true, force: true })
  }
})
