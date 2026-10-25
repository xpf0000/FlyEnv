import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import mariadb from '../src/fork/module/Mariadb'
import type { SoftInstalled } from '../src/shared/app'
import type { PItem } from '../src/shared/Process'
import { currentServiceStopContext } from '../src/shared/ServiceStopContext'
import { fetchStopProcessListLocal } from '../src/shared/StopProcessList'

if (process.platform !== 'win32') {
  console.log('MariaDB Windows stop regression: skipped on this platform')
  process.exit(0)
}

const root = await mkdtemp(join(tmpdir(), "FlyEnv MariaDB 测试 ' & [path] "))
const previousServer = global.Server
const previousPidPath = mariadb.pidPath
const runtime = mariadb as unknown as {
  stopWindowsServiceProcessesAfterNativeShutdown: (
    pids: string[],
    list: PItem[],
    nativeSucceeded: boolean
  ) => Promise<PItem[]>
}
const originalStop = runtime.stopWindowsServiceProcessesAfterNativeShutdown
try {
  global.Server = { BaseDir: root, MariaDBDir: join(root, 'mariadb') } as typeof global.Server
  await mkdir(global.Server.MariaDBDir!, { recursive: true })
  await mkdir(join(root, 'pid'))
  mariadb.init()
  const appPidFile = join(root, 'pid/mariadb.pid')
  const config = join(global.Server.MariaDBDir!, 'my-13.0.cnf')
  // Disable the protocol branch: these cases exercise real discovery and PID cleanup,
  // replacing only the process execution/confirmation boundary.
  await writeFile(config, '[mariadbd]\nport=0\n')
  const version = {
    version: '13.0.1',
    path: join(root, 'app/mariadb'),
    bin: join(root, 'app/mariadb/bin/mariadbd.exe'),
    pid: '101'
  } as SoftInstalled
  const row = (pid: string, argument: string, extra: Partial<PItem> = {}): PItem => ({
    PID: pid,
    PPID: '1',
    USER: '',
    CREATED: '2026-10-25T00:00:00.000000Z',
    EXECUTABLE: version.bin,
    COMMAND: `"${version.bin}" ${argument}`,
    ...extra
  })
  const unixConfig = config.replaceAll('\\', '/')
  const validArguments = [
    `"--defaults-file=${unixConfig}"`,
    `--defaults-file="${config}"`,
    `--defaults-file "${config}"`,
    `"--defaults-file" "${config}"`,
    `"--DEFAULTS-FILE=${unixConfig.toUpperCase()}"`,
    `"--defaults-file=${join(global.Server.MariaDBDir!, 'nested/../my-13.0.cnf')}"`
  ]
  const group = row('201', `"--defaults-file=${config}.group"`)
  const unreadable = row('301', '', { COMMAND: '', EXECUTABLE: '' })
  let count = 0
  for (const reason of ['quit', 'stop'] as const) {
    for (const argument of validArguments) {
      await writeFile(appPidFile, '301') // A bad PID-file candidate must not abort a valid root.
      await writeFile(mariadb.pidPath, '101')
      const list = [group, unreadable, row('101', argument), row('102', '', { PPID: '101' })]
      let calls = 0
      runtime.stopWindowsServiceProcessesAfterNativeShutdown = async (pids, initial, native) => {
        calls += 1
        assert.equal(currentServiceStopContext()?.reason, reason)
        assert.equal(initial, list)
        assert.equal(native, false)
        assert.deepEqual(pids, ['101', '102'])
        return [group, unreadable]
      }
      const result = await mariadb.stopService(version, { processList: list, reason })
      assert.equal(calls, 1, `must stop the owned tree: ${argument}`)
      assert.deepEqual(result['APP-Service-Stop-PID'], [101, 102])
      assert.equal(existsSync(mariadb.pidPath), false)
      assert.equal(await readFile(appPidFile, 'utf8'), '301')
      count += 1
    }
  }

  for (const argument of [
    `"--defaults-file=${config}.other"`,
    `"--defaults-file=${join(root, 'group/my-13.0.cnf')}"`,
    `"--log-error=${config}"`,
    `"--description=prefix --defaults-file=${config}"`,
    `"--description=prefix --defaults-file=${config}" --standalone`,
    `"--defaults-file=${config}"suffix`,
    '--defaults-file'
  ]) {
    await writeFile(mariadb.pidPath, '101')
    runtime.stopWindowsServiceProcessesAfterNativeShutdown = async () => {
      assert.fail(`must not stop a different/unproven instance: ${argument}`)
    }
    await mariadb.stopService(version, { processList: [row('101', argument)], reason: 'quit' })
    assert.equal(await readFile(mariadb.pidPath, 'utf8'), '101')
    count += 1
  }

  const list = [row('101', validArguments[0])]
  runtime.stopWindowsServiceProcessesAfterNativeShutdown = async () => {
    throw new Error('simulated stop failure')
  }
  await assert.rejects(
    Promise.resolve(mariadb.stopService(version, { processList: list, reason: 'quit' })),
    /simulated stop failure/
  )
  assert.equal(await readFile(mariadb.pidPath, 'utf8'), '101')
  runtime.stopWindowsServiceProcessesAfterNativeShutdown = async () => list
  await assert.rejects(
    Promise.resolve(mariadb.stopService(version, { processList: list, reason: 'quit' })),
    /MariaDB is still running/
  )
  assert.equal(await readFile(mariadb.pidPath, 'utf8'), '101')
  console.log(`MariaDB Windows stop regression: ${count + 2} cases passed`)

  // Opt in with a local MariaDB binary; initialize and stop only this temporary instance.
  if (process.env.FLYENV_MARIADB_TEST_BIN) {
    runtime.stopWindowsServiceProcessesAfterNativeShutdown = originalStop
    const exec = promisify(execFile)
    const bin = resolve(process.env.FLYENV_MARIADB_TEST_BIN)
    const dataDir = join(root, 'isolated data')
    const listener = createServer()
    await new Promise<void>((done, fail) => {
      listener.once('error', fail)
      listener.listen(0, '127.0.0.1', done)
    })
    const port = (listener.address() as { port: number }).port
    await new Promise<void>((done) => listener.close(() => done()))
    await exec(
      join(dirname(bin), 'mariadb-install-db.exe'),
      [`--datadir=${dataDir}`, '--password=root', `--port=${port}`],
      { windowsHide: true, timeout: 60_000 }
    )
    await writeFile(
      config,
      `[mariadbd]\nport=${port}\ndatadir=${dataDir.replaceAll('\\', '/')}\nbind-address=127.0.0.1\n`
    )
    const child = spawn(
      bin,
      [`--defaults-file=${config}`, `--pid-file=${mariadb.pidPath}`, '--skip-ssl', '--standalone'],
      { windowsHide: true, stdio: 'ignore' }
    )
    const exited = new Promise<void>((done) => child.once('exit', () => done()))
    let spawnError: Error | undefined
    child.once('error', (error) => (spawnError = error))
    try {
      const deadline = Date.now() + 20_000
      while (true) {
        if (spawnError) throw spawnError
        assert.equal(child.exitCode, null, 'isolated MariaDB must start')
        try {
          await exec(
            join(dirname(bin), 'mariadb-admin.exe'),
            [
              '--no-defaults',
              '--host=127.0.0.1',
              `--port=${port}`,
              '-uroot',
              '-proot',
              '--skip-ssl',
              'ping'
            ],
            { windowsHide: true, timeout: 2000 }
          )
          break
        } catch {
          assert.ok(Date.now() < deadline, 'isolated MariaDB must become ready')
          await new Promise((done) => setTimeout(done, 200))
        }
      }
      const pid = `${child.pid}`
      await writeFile(appPidFile, pid)
      const processList = await fetchStopProcessListLocal()
      const observed = processList.find((item) => item.PID === pid)
      assert.ok(observed?.COMMAND.includes(`"--defaults-file=${config}"`))
      const liveVersion = { ...version, bin, path: dirname(dirname(bin)), pid }
      const stopped = await mariadb.stopService(liveVersion, { processList, reason: 'quit' })
      assert.ok(stopped['APP-Service-Stop-PID'].map(String).includes(pid))
      await exited
      const finalList = await fetchStopProcessListLocal()
      assert.equal(
        finalList.some((item) => item.PID === pid),
        false
      )
      assert.equal(existsSync(appPidFile), false)
      assert.equal(existsSync(mariadb.pidPath), false)
      const otherInstances = processList.filter(
        (item) => item.PID !== pid && item.EXECUTABLE === bin
      )
      for (const other of otherInstances) {
        assert.ok(
          finalList.some((item) => item.PID === other.PID && item.CREATED === other.CREATED),
          'other MariaDB instances must remain running'
        )
      }
      console.log('MariaDB live quit stop: passed; other instances preserved')
    } finally {
      // Only the child created above is eligible for emergency test cleanup.
      if (child.pid && child.exitCode === null && !spawnError) {
        child.kill()
        await exited
      }
    }
  }
} finally {
  runtime.stopWindowsServiceProcessesAfterNativeShutdown = originalStop
  mariadb.pidPath = previousPidPath
  global.Server = previousServer
  await rm(root, { recursive: true, force: true })
}
