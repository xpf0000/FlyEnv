import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import rabbitmq from '../src/fork/module/RabbitMQ'
import EnvSync from '../src/shared/EnvSync'
import { fetchStopProcessListLocal } from '../src/shared/StopProcessList'
import { ProcessKillStrict, ProcessListByExactPid, type PItem } from '../src/shared/Process'
import { waitForServiceProcessExit } from '../src/shared/ServiceStop'
import type { SoftInstalled } from '../src/shared/app'
import { rabbitMQServiceTargets } from '../src/fork/module/RabbitMQ/Process'

const identity = {
  pid: '101',
  created: '2026-10-25T00:00:00.000000Z',
  launchedAt: Date.parse('2026-10-24T23:59:59Z'),
  registeredAt: Date.parse('2026-10-25T00:00:01Z')
}
const broker: PItem = {
  PID: '101',
  PPID: '1',
  USER: '',
  CREATED: identity.created,
  EXECUTABLE: 'C:/Erlang/erts/bin/erl.exe',
  COMMAND: 'erl -s rabbit boot'
}
const worker = { ...broker, PID: '102', PPID: '101', COMMAND: 'inet_gethost.exe' }
const other = { ...broker, PID: '201' }
assert.deepEqual(rabbitMQServiceTargets(identity, [broker, worker, other]).pids, ['101', '102'])
assert.deepEqual(rabbitMQServiceTargets(identity, [{ ...broker, COMMAND: '' }, worker]).pids, [
  '101',
  '102'
])
assert.equal(rabbitMQServiceTargets(identity, []).reason, 'absent')
assert.equal(
  rabbitMQServiceTargets(identity, [{ ...broker, CREATED: '2026-10-25T01:00:00Z' }]).reason,
  'pid-reused'
)
assert.equal(rabbitMQServiceTargets(identity, [{ ...broker, CREATED: undefined }]).unknown, true)
assert.equal(rabbitMQServiceTargets({ ...identity, created: undefined }, [broker]).unknown, true)
assert.equal(rabbitMQServiceTargets(identity, [{ ...broker, EXECUTABLE: '' }]).unknown, true)
assert.deepEqual(
  rabbitMQServiceTargets(identity, [broker, { ...worker, CREATED: '2026-10-24T23:00:00Z' }]).pids,
  ['101']
)
console.log('RabbitMQ startup identity regression: 8 cases passed')

if (process.platform !== 'win32' || !process.env.FLYENV_RABBITMQ_TEST_BIN) {
  console.log('RabbitMQ live stop test: set FLYENV_RABBITMQ_TEST_BIN on Windows to run')
  process.exit(0)
}
const root = await mkdtemp(join(tmpdir(), 'FlyEnv RabbitMQ stop '))
const previousServer = global.Server
const previousEnv = EnvSync.AppEnv
const previousCwd = process.cwd()
const previousBaseDir = rabbitmq.baseDir
const previousPidPath = rabbitmq.pidPath
let startedPid = ''
let foreignPid = ''
try {
  global.Server = { BaseDir: root, AppDir: join(root, 'app') } as typeof global.Server
  await mkdir(join(root, 'pid'))
  await mkdir(join(root, 'home'))
  EnvSync.AppEnv = {
    ...Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== undefined)),
    ERLANG_HOME: process.env.FLYENV_RABBITMQ_TEST_ERLANG_HOME!,
    HOME: join(root, 'home'),
    USERPROFILE: join(root, 'home')
  }
  rabbitmq.init()
  await mkdir(rabbitmq.baseDir)
  const listeners = [createServer(), createServer()]
  const ports: number[] = []
  for (const listener of listeners) {
    await new Promise<void>((done) => listener.listen(0, '127.0.0.1', done))
    ports.push((listener.address() as { port: number }).port)
  }
  await Promise.all(
    listeners.map((listener) => new Promise<void>((done) => listener.close(() => done())))
  )
  const version = {
    version: '4.3.4',
    bin: process.env.FLYENV_RABBITMQ_TEST_BIN!,
    path: dirname(dirname(process.env.FLYENV_RABBITMQ_TEST_BIN!)),
    typeFlag: 'rabbitmq'
  } as SoftInstalled
  const foreign = spawn(
    join(process.env.FLYENV_RABBITMQ_TEST_ERLANG_HOME!, 'bin/erl.exe'),
    [
      '-noshell',
      '-noinput',
      '+S',
      '1:1',
      '-eval',
      'io:format("FIXTURE_PID=~s~n",[os:getpid()]),timer:sleep(infinity).'
    ],
    { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }
  )
  await once(foreign, 'spawn')
  foreignPid = await new Promise<string>((done, fail) => {
    let output = ''
    const timer = setTimeout(() => fail(new Error('foreign Erlang fixture did not start')), 15_000)
    foreign.stdout.on('data', (chunk) => {
      output += chunk
      const match = /FIXTURE_PID=(\d+)/.exec(output)
      if (match) {
        clearTimeout(timer)
        done(match[1])
      }
    })
    foreign.once('error', (error) => {
      clearTimeout(timer)
      fail(error)
    })
  })
  const mnesia = join(rabbitmq.baseDir, 'mnesia-4')
  const brokerConfig = join(rabbitmq.baseDir, 'broker.conf')
  await writeFile(join(rabbitmq.baseDir, 'enabled_plugins-4'), '[] .')
  await writeFile(brokerConfig, `listeners.tcp.1 = 127.0.0.1:${ports[0]}\n`)
  await writeFile(
    join(rabbitmq.baseDir, 'rabbitmq-4.bat'),
    [
      `set "RABBITMQ_NODENAME=flyenv_test_${process.pid}@localhost"`,
      `set "RABBITMQ_DIST_PORT=${ports[1]}"`,
      `set "MNESIA_BASE=${mnesia}"`,
      `set "RABBITMQ_PID_FILE=${join(mnesia, 'fixture.pid')}"`,
      `set "RABBITMQ_LOG_BASE=${join(rabbitmq.baseDir, 'logs')}"`,
      `set "RABBITMQ_CONFIG_FILE=${brokerConfig}"`,
      `set "RABBITMQ_ENABLED_PLUGINS_FILE=${join(rabbitmq.baseDir, 'enabled_plugins-4')}"`,
      `set "RABBITMQ_SERVER_ADDITIONAL_ERL_ARGS=+S 2:2 +A 2 -setcookie flyenv_fixture_${process.pid}"`
    ].join('\r\n')
  )
  for (const reason of ['stop', 'quit'] as const) {
    const started: any = await rabbitmq.startService(version)
    startedPid = `${started['APP-Service-Start-PID']}`
    const processList = await fetchStopProcessListLocal()
    const broker = processList.find((item) => item.PID === startedPid)
    assert.ok(broker)
    assert.equal(
      broker.COMMAND.includes(version.path),
      false,
      'the real VM has no RabbitMQ installation marker'
    )
    const targets = ProcessListByExactPid(startedPid, processList).map((item) => item.PID)
    const [stopVersion, params] = started['APP-Service-Stop-Args']
    assert.ok(params.processIdentity.created, 'startup records the process creation identity')
    await assert.rejects(
      Promise.resolve(
        rabbitmq.stopService(
          stopVersion,
          { processList, reason },
          {
            processIdentity: { ...params.processIdentity, created: undefined }
          }
        )
      ),
      /Cannot verify RabbitMQ startup process identity/
    )
    assert.equal(await readFile(join(root, 'pid/rabbitmq.pid'), 'utf8'), startedPid)
    assert.equal(await readFile(join(mnesia, 'fixture.pid'), 'utf8'), startedPid)
    process.kill(Number(startedPid), 0)
    if (reason === 'quit') {
      // Main carries the proof in stopArgs even when the original fork-local map is gone.
      ;(rabbitmq as any).windowsInstances.clear()
    }
    const result: any = await rabbitmq.stopService(
      stopVersion,
      { processList, reason },
      ...(reason === 'quit' ? [params] : [])
    )
    assert.ok(result['APP-Service-Stop-PID'].map(String).includes(startedPid))
    const after = await fetchStopProcessListLocal()
    assert.equal(
      after.some((item) => targets.includes(item.PID)),
      false
    )
    process.kill(Number(foreignPid), 0)
    const epmd = processList.filter((item) => item.EXECUTABLE?.toLowerCase().endsWith('epmd.exe'))
    assert.ok(
      epmd.every((item) =>
        after.some((current) => current.PID === item.PID && current.CREATED === item.CREATED)
      )
    )
    await assert.rejects(readFile(join(root, 'pid/rabbitmq.pid')), { code: 'ENOENT' })
    await assert.rejects(readFile(join(mnesia, 'fixture.pid')), { code: 'ENOENT' })
    console.log(
      `RabbitMQ live ${reason}/retry: passed; Erlang tree stopped, other Erlang processes preserved`
    )
    startedPid = ''
  }
} finally {
  process.chdir(previousCwd)
  if (!startedPid) {
    startedPid = await readFile(join(root, 'rabbitmq/mnesia-4/fixture.pid'), 'utf8').catch(() => '')
  }
  for (const pid of [startedPid, foreignPid].filter(Boolean)) {
    const list = await fetchStopProcessListLocal()
    const pids = ProcessListByExactPid(pid.trim(), list).map((item) => item.PID)
    if (pids.length) {
      await ProcessKillStrict('-INT', pids)
      await waitForServiceProcessExit(pids, 10_000, { initialList: list })
    }
  }
  rabbitmq.baseDir = previousBaseDir
  rabbitmq.pidPath = previousPidPath
  EnvSync.AppEnv = previousEnv
  global.Server = previousServer
  assert.ok(root.startsWith(join(tmpdir(), 'FlyEnv RabbitMQ stop ')))
  await rm(root, { recursive: true, force: true })
}
