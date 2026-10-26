import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, rmdir, symlink, unlink, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import numa from '../src/fork/module/Numa'
import { windowsNumaRootMatcher } from '../src/fork/module/Numa/Process'
import EnvSync from '../src/shared/EnvSync'
import { fetchStopProcessListLocal } from '../src/shared/StopProcessList'
import { ProcessKillStrict, ProcessListByExactPid, type PItem } from '../src/shared/Process'
import { waitForServiceProcessExit } from '../src/shared/ServiceStop'
import type { SoftInstalled } from '../src/shared/app'

if (process.platform !== 'win32') process.exit(0)
const root = await mkdtemp(join(tmpdir(), "FlyEnv Numa 测试 ' "))
const previousServer = global.Server
const previousEnv = EnvSync.AppEnv
const previousCwd = process.cwd()
const previousPidPath = numa.pidPath
let startedPid = ''
try {
  global.Server = { BaseDir: root, Static: resolve('static') } as typeof global.Server
  await mkdir(join(root, 'pid'))
  await mkdir(join(root, 'numa'))
  numa.init()
  const config = join(root, 'numa/numa.toml')
  const fakeBin = join(root, 'install/numa.exe')
  await mkdir(dirname(fakeBin))
  await writeFile(fakeBin, '')
  await writeFile(config, '')
  await symlink(dirname(fakeBin), join(root, 'alias-install'), 'junction')
  await symlink(dirname(config), join(root, 'alias-config'), 'junction')
  const version = (bin = fakeBin) =>
    ({ bin, path: dirname(bin), version: '0.21.0', typeFlag: 'numa' }) as SoftInstalled
  const processRow = (command: string, extra: Partial<PItem> = {}): PItem => ({
    PID: '101',
    PPID: '1',
    USER: '',
    CREATED: '2026-10-25T00:00:00.000000Z',
    EXECUTABLE: fakeBin,
    COMMAND: command,
    ...extra
  })
  const matches = windowsNumaRootMatcher(version(), config)
  let count = 0
  for (const argument of [
    config,
    config.replaceAll('\\', '/'),
    config.toUpperCase(),
    join(root, 'alias-config/numa.toml')
  ]) {
    assert.equal(matches(processRow(`./numa.exe "${argument}"`)), true)
    count += 1
  }
  assert.equal(
    matches(
      processRow(`numa.exe "${config}"`, {
        EXECUTABLE: join(root, 'alias-install/numa.exe')
      })
    ),
    true
  )
  for (const command of [
    `numa.exe "${config}.other"`,
    `numa.exe "${join(root, 'other/numa.toml')}"`,
    `numa.exe install "${config}"`,
    `numa.exe service start "${config}"`,
    `numa.exe --description="${config}"`,
    `numa.exe "${config}"suffix`,
    'numa.exe numa.toml',
    ''
  ]) {
    assert.equal(matches(processRow(command)), false)
    count += 1
  }
  for (const extra of [
    { EXECUTABLE: join(root, 'other/numa.exe') },
    { EXECUTABLE: 'C:/Windows/System32/cmd.exe' },
    { EXECUTABLE: '' },
    { CREATED: undefined }
  ]) {
    assert.equal(matches(processRow(`numa.exe "${config}"`, extra)), false)
    count += 1
  }
  const appPidFile = join(root, 'pid/numa.pid')
  await writeFile(appPidFile, '101')
  await assert.rejects(
    Promise.resolve(
      numa.stopService(
        { ...version(), pid: '101' },
        {
          processList: [processRow('', { EXECUTABLE: '' })],
          reason: 'quit'
        }
      )
    ),
    /Cannot verify Numa process identity/
  )
  assert.equal(await readFile(appPidFile, 'utf8'), '101')
  await unlink(appPidFile)
  console.log(`Numa process identity/failure regression: ${count + 2} cases passed`)

  if (process.env.FLYENV_NUMA_TEST_BIN) {
    EnvSync.AppEnv = Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined
      )
    )
    const installed = version(resolve(process.env.FLYENV_NUMA_TEST_BIN))
    const listeners = [createServer(), createServer()]
    const ports: number[] = []
    for (const listener of listeners) {
      await new Promise<void>((done) => listener.listen(0, '127.0.0.1', done))
      ports.push((listener.address() as { port: number }).port)
    }
    await Promise.all(
      listeners.map((listener) => new Promise<void>((done) => listener.close(() => done())))
    )
    await writeFile(
      config,
      [
        '[server]',
        `bind_addr = "127.0.0.1:${ports[0]}"`,
        `api_port = ${ports[1]}`,
        'api_bind_addr = "127.0.0.1"',
        `data_dir = "${join(root, 'data').replaceAll('\\', '/')}"`,
        '[blocking]',
        'enabled = false',
        '[proxy]',
        'enabled = false',
        '[dot]',
        'enabled = false',
        '[mobile]',
        'enabled = false'
      ].join('\n')
    )
    const before = await fetchStopProcessListLocal()
    const peers = before.filter(
      (item) => item.EXECUTABLE?.toLowerCase() === installed.bin.toLowerCase()
    )
    const validConfig = await readFile(config, 'utf8')
    await writeFile(config, 'invalid configuration = [')
    await assert.rejects(
      Promise.resolve(numa.startService(installed)),
      /Numa exited during startup/
    )
    assert.equal(existsSync(numa.pidPath), false)
    assert.equal(existsSync(appPidFile), false)
    await writeFile(config, validConfig)
    const errorLog = join(root, `numa/numa-${installed.version}-start-error.log`)
    for (const reason of ['stop', 'quit'] as const) {
      const previousLogSize = (await readFile(errorLog)).length
      const started: any = await numa.startService(installed)
      startedPid = `${started['APP-Service-Start-PID']}`
      const processList = await fetchStopProcessListLocal()
      const broker = processList.find((item) => item.PID === startedPid)
      assert.ok(broker && windowsNumaRootMatcher(installed, config)(broker))
      assert.equal(
        processList.some((item) => item.PID === broker.PPID),
        false,
        'temporary launcher has exited'
      )
      assert.ok(
        (await readFile(errorLog)).length > previousLogSize,
        'native Numa logs are still captured'
      )
      const health = await fetch(`http://127.0.0.1:${ports[1]}/health`, {
        signal: AbortSignal.timeout(3000)
      })
      assert.equal(health.status, 200)
      assert.ok(
        broker.COMMAND.trim().startsWith(`"${installed.bin}"`),
        'starts the complete executable path'
      )
      assert.equal(await readFile(numa.pidPath, 'utf8'), startedPid)
      const targets = ProcessListByExactPid(startedPid, processList).map((item) => item.PID)
      await unlink(appPidFile)
      await mkdir(appPidFile)
      await assert.rejects(
        Promise.resolve(
          numa.stopService(
            { ...installed, pid: startedPid },
            {
              processList,
              reason
            }
          )
        )
      )
      process.kill(Number(startedPid), 0)
      await rmdir(appPidFile)
      await writeFile(appPidFile, startedPid)
      const result: any = await numa.stopService(
        { ...installed, pid: startedPid },
        { processList, reason }
      )
      assert.ok(result['APP-Service-Stop-PID'].map(String).includes(startedPid))
      const after = await fetchStopProcessListLocal()
      assert.equal(
        after.some((item) => targets.includes(item.PID)),
        false
      )
      assert.ok(
        peers.every((peer) =>
          after.some((item) => item.PID === peer.PID && item.CREATED === peer.CREATED)
        )
      )
      assert.equal(existsSync(appPidFile), false)
      assert.equal(existsSync(numa.pidPath), false)
      console.log(`Numa live ${reason}/retry: passed; other Numa configurations preserved`)
      startedPid = ''
    }
  }
} finally {
  process.chdir(previousCwd)
  if (startedPid) {
    const list = await fetchStopProcessListLocal()
    const pids = ProcessListByExactPid(startedPid, list).map((item) => item.PID)
    if (pids.length) {
      await ProcessKillStrict('-INT', pids)
      await waitForServiceProcessExit(pids, 10_000, { initialList: list })
    }
  }
  numa.pidPath = previousPidPath
  EnvSync.AppEnv = previousEnv
  global.Server = previousServer
  assert.ok(root.startsWith(join(tmpdir(), "FlyEnv Numa 测试 ' ")))
  await rm(root, { recursive: true, force: true })
}
