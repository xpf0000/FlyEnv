import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdtemp, readFile, rm, readdir, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, win32 } from 'node:path'
import { Readable } from 'node:stream'
import {
  downloadMssqlFile,
  spawnMssqlCommand,
  windowsSetupArgs,
  windowsMediaDownloadArgs,
  linuxMssqlLayout,
  linuxMssqlLaunch,
  waitForMssqlReady
} from '../plugins/mssql/fork/Mssql/runtime'

const root = await mkdtemp(join(tmpdir(), 'mssql-runtime-'))
try {
  const target = join(root, 'package.deb')
  await assert.rejects(
    downloadMssqlFile(target, async () => ({
      data: Readable.from(['partial']),
      headers: { 'content-length': '100' }
    })),
    /incomplete/i
  )
  assert.deepEqual(await readdir(root), [])
  await assert.rejects(
    downloadMssqlFile(target, async () => ({
      data: Readable.from(
        (async function* () {
          yield 'data'
          throw Error('connection reset')
        })()
      ),
      headers: {}
    })),
    /connection reset/
  )
  assert.deepEqual(await readdir(root), [])
  await downloadMssqlFile(target, async () => ({
    data: Readable.from(['complete']),
    headers: { 'content-length': '8' }
  }))
  assert.equal(await readFile(target, 'utf8'), 'complete')
  const failedSpawn = () => {
    const child = new EventEmitter() as any
    child.stdout = null
    child.stderr = null
    child.kill = () => {}
    queueMicrotask(() => child.emit('error', Error('cannot execute')))
    return child
  }
  await assert.rejects(spawnMssqlCommand('installer', [], 1000, failedSpawn), /cannot execute/)
  const exitSpawn = () => {
    const child = new EventEmitter() as any
    child.stdout = null
    child.stderr = null
    child.kill = () => {}
    queueMicrotask(() => child.emit('close', 5, null))
    return child
  }
  await assert.rejects(spawnMssqlCommand('installer', [], 1000, exitSpawn), /5/)
  let timeoutClosed = false
  const delayedStop = () => {
    const child = new EventEmitter() as any
    child.stdout = null
    child.stderr = null
    child.kill = () => {
      setTimeout(() => {
        timeoutClosed = true
        child.emit('close', null, 'SIGTERM')
      }, 20)
      return true
    }
    return child
  }
  await assert.rejects(spawnMssqlCommand('installer', [], 5, delayedStop), /timed out/)
  assert.equal(timeoutClosed, true, 'timeout must retain ownership until the command closes')
  const args = windowsSetupArgs('2022-express', 'C:\\Fly Env\\app', 'C:\\Fly Env\\server')
  assert.ok(args.includes('/ACTION=Install'))
  assert.ok(args.includes('/UIMODE=Normal'))
  assert.ok(args.includes(`/INSTANCEDIR=${win32.join('C:\\Fly Env\\app', 'mssql/2022-express')}`))
  assert.ok(args.some((arg) => arg.startsWith('/SQLUSERDBDIR=')))
  assert.ok(args.every((arg) => !/^\/(Q|QS|QUIET|IACCEPT)/i.test(arg)))
  assert.ok(windowsMediaDownloadArgs('Developer', 'C:\\media').includes('/MEDIATYPE=ISO'))
  assert.ok(windowsMediaDownloadArgs('Express', 'C:\\media').includes('/MEDIATYPE=Core'))
  const layout = linuxMssqlLayout('/server/mssql/data-16')
  assert.equal(layout.masterDataFile, '/server/mssql/data-16/data/master.mdf')
  const launch = linuxMssqlLaunch('/app/mssql/16/opt/mssql/bin/sqlservr', layout, 1433, 'Express')
  assert.equal(launch.bin, '/usr/bin/bwrap')
  assert.ok(launch.args.includes('/var/opt/mssql'))
  assert.equal(launch.env.MSSQL_MASTER_DATA_FILE, '/var/opt/mssql/data/master.mdf')
  assert.equal(launch.env.MSSQL_ERROR_LOG_FILE, '/var/opt/mssql/log/errorlog')
  let probes = 0
  await waitForMssqlReady({
    alive: () => true,
    ready: async () => ++probes === 3,
    wait: async () => {},
    attempts: 4
  })
  assert.equal(probes, 3)
  await assert.rejects(
    waitForMssqlReady({
      alive: () => false,
      ready: async () => true,
      wait: async () => {},
      attempts: 4
    }),
    /exited/
  )
  await assert.rejects(
    waitForMssqlReady({
      alive: () => true,
      ready: async () => false,
      wait: async () => {},
      attempts: 2
    }),
    /ready/i
  )
  assert.equal((await stat(target)).size, 8)
  console.log('MSSQL download, media, layout and readiness tests passed')
} finally {
  await rm(root, { recursive: true, force: true })
}
