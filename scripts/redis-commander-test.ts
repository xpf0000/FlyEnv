import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { SoftInstalled } from '../src/shared/app'
import type { ForkPromise } from '../src/shared/ForkPromise'
import {
  REDIS_COMMANDER_DEFAULT_PORT,
  REDIS_COMMANDER_LOGIN,
  REDIS_COMMANDER_PACKAGE,
  RedisCommanderRuntime,
  redisCommanderArgs,
  redisCommanderConfig,
  redisCommanderInstallManifest,
  redisCommanderPaths,
  redisCommanderUrl
} from '../src/fork/module/Redis/RedisCommander'
import { serviceStartSpawnLogParam } from '../src/fork/util/ServiceStart'

const forkPromiseToPromise = <T>(value: ForkPromise<T>) =>
  new Promise<T>((resolve, reject) => value.then(resolve, reject))

assert.equal(REDIS_COMMANDER_PACKAGE, 'redis-commander')
assert.equal(REDIS_COMMANDER_DEFAULT_PORT, 8081)
assert.equal(REDIS_COMMANDER_LOGIN, 'flyenv')
assert.deepEqual(redisCommanderConfig('port 6380\nrequirepass "secret value"\n'), {
  host: '127.0.0.1',
  port: 6380,
  password: 'secret value'
})
assert.deepEqual(redisCommanderConfig('# port 6390\nport invalid\nrequirepass\n'), {
  host: '127.0.0.1',
  port: 6379
})
assert.deepEqual(redisCommanderInstallManifest(), {
  name: 'flyenv-redis-commander',
  private: true,
  dependencies: { 'redis-commander': 'latest' }
})

const paths = redisCommanderPaths('/tmp/flyenv', false)
assert.equal(paths.root, '/tmp/flyenv/redis-commander')
assert.equal(
  paths.entry,
  '/tmp/flyenv/redis-commander/node_modules/redis-commander/bin/redis-commander.js'
)
assert.equal(
  redisCommanderUrl(8082, { login: 'flyenv', password: 'secret' }),
  'http://flyenv:secret@127.0.0.1:8082'
)
assert.deepEqual(
  redisCommanderArgs({ host: '127.0.0.1', port: 6380, password: 'redis-secret' }, 8082, {
    login: 'flyenv',
    password: 'panel-secret'
  }),
  [
    '--address',
    '127.0.0.1',
    '--port',
    '8082',
    '--redis-host',
    '127.0.0.1',
    '--redis-port',
    '6380',
    '--redis-password',
    'redis-secret',
    '--http-auth-username',
    'flyenv',
    '--http-auth-password',
    'panel-secret',
    '--nosave',
    '--no-log-data'
  ]
)
assert.deepEqual(
  redisCommanderArgs({ host: '127.0.0.1', port: 6379 }, 8082, {
    login: 'flyenv',
    password: 'panel-secret'
  }),
  [
    '--address',
    '127.0.0.1',
    '--port',
    '8082',
    '--redis-host',
    '127.0.0.1',
    '--redis-port',
    '6379',
    '--http-auth-username',
    'flyenv',
    '--http-auth-password',
    'panel-secret',
    '--nosave',
    '--no-log-data'
  ]
)
const redactedStartLog = serviceStartSpawnLogParam({
  version: { typeFlag: 'node', version: '22.0.0', bin: '/tmp/node' } as SoftInstalled,
  baseDir: '/tmp/redis-commander',
  bin: '/tmp/node',
  execArgs: ['--redis-password', 'redis-secret', '--http-auth-password', 'panel-secret'],
  execEnv: { REDIS_PASSWORD: 'redis-secret' },
  on: () => {},
  sensitive: true
})
assert.equal(redactedStartLog.execArgs, '[REDACTED]')
assert.equal(redactedStartLog.execEnv, '[REDACTED]')
assert.doesNotMatch(JSON.stringify(redactedStartLog), /redis-secret|panel-secret/)

const ordinaryStartLog = serviceStartSpawnLogParam({
  version: { typeFlag: 'node', version: '22.0.0', bin: '/tmp/node' } as SoftInstalled,
  baseDir: '/tmp/redis-commander',
  bin: '/tmp/node',
  execArgs: ['--port', '8081'],
  on: () => {}
})
assert.deepEqual(ordinaryStartLog.execArgs, ['--port', '8081'])
const serviceStartSource = readFileSync(
  join(import.meta.dirname, '../src/fork/util/ServiceStart.ts'),
  'utf8'
)
assert.match(serviceStartSource, /serviceStartSpawnLogParam\(param\)/)
const redisCommanderSource = readFileSync(
  join(import.meta.dirname, '../src/fork/module/Redis/RedisCommander.ts'),
  'utf8'
)
assert.match(redisCommanderSource, /sensitive:\s*true/)

const root = await mkdtemp(join(tmpdir(), 'flyenv-redis-commander-'))
const runtimePaths = redisCommanderPaths(root, false)
let installs = 0
let starts = 0
let running = false
const stalePidAtStart: boolean[] = []
let releaseStart: (() => void) | undefined
let startedResolver: (() => void) | undefined
const started = new Promise<void>((resolve) => {
  startedResolver = resolve
})
const startGate = new Promise<void>((resolve) => {
  releaseStart = resolve
})
const kills: string[] = []
const notices: unknown[] = []
const node = { typeFlag: 'node', version: '22.0.0', bin: '/tmp/node' } as SoftInstalled
const redis = { typeFlag: 'redis', version: '7.4.0', bin: '/tmp/redis-server' } as SoftInstalled
const runtime = new RedisCommanderRuntime(root, {
  paths: runtimePaths,
  config: async () => ({ host: '127.0.0.1', port: 6380, password: 'redis-secret' }),
  installer: async (_nodeBin, currentPaths) => {
    installs += 1
    await mkdir(dirname(currentPaths.entry), { recursive: true })
    await writeFile(currentPaths.entry, '')
  },
  starter: async (_node, currentPaths) => {
    starts += 1
    stalePidAtStart.push(existsSync(currentPaths.pid))
    startedResolver?.()
    await startGate
    running = true
    await writeFile(currentPaths.pid, '1234')
    return { 'APP-Service-Start-PID': '1234' }
  },
  processList: async () =>
    running ? [{ PID: '1234', PPID: '', COMMAND: `node ${runtimePaths.entry}`, USER: '' }] : [],
  listeningPids: async () => (running ? ['1234'] : []),
  health: async () => running,
  portFinder: async () => 8082,
  kill: async (pids) => {
    kills.push(...pids)
    running = false
  }
})

const first = runtime.open(node, redis, (notice) => notices.push(notice))
await started
const second = runtime.open(node, redis)
releaseStart?.()
const [firstResult, secondResult] = await Promise.all([first, second])
assert.match(firstResult.url, /^http:\/\/flyenv:.+@127\.0\.0\.1:8082$/)
assert.equal(secondResult.url, firstResult.url)
assert.equal(installs, 1)
assert.equal(starts, 1)
assert.deepEqual(notices, [{ type: 'web-panel-install', service: 'Redis Commander' }])
assert.equal(existsSync(runtimePaths.port), true)

const thirdResult = await runtime.open(node, redis)
assert.equal(thirdResult.url, firstResult.url)
assert.equal(starts, 1)
assert.deepEqual(await runtime.stop(), ['1234'])
assert.deepEqual(kills, ['1234'])
assert.equal(existsSync(runtimePaths.pid), false)
assert.equal(existsSync(runtimePaths.port), false)

await writeFile(runtimePaths.pid, '9999')
await runtime.open(node, redis)
assert.equal(starts, 2)
assert.deepEqual(stalePidAtStart, [false, false])
assert.deepEqual(await runtime.stop(), ['1234'])
assert.deepEqual(kills, ['1234', '1234'])
await rm(root, { recursive: true, force: true })

const stopDuringInstallRoot = await mkdtemp(join(tmpdir(), 'flyenv-redis-commander-stop-'))
const stopDuringInstallPaths = redisCommanderPaths(stopDuringInstallRoot, false)
let releaseInstall: (() => void) | undefined
let installStartedResolver: (() => void) | undefined
const installStarted = new Promise<void>((resolve) => {
  installStartedResolver = resolve
})
const installGate = new Promise<void>((resolve) => {
  releaseInstall = resolve
})
let stopDuringInstallStarts = 0
let stopDuringInstallRunning = false
const stopDuringInstallRuntime = new RedisCommanderRuntime(stopDuringInstallRoot, {
  paths: stopDuringInstallPaths,
  config: async () => ({ host: '127.0.0.1', port: 6380 }),
  installer: async (_nodeBin, currentPaths) => {
    installStartedResolver?.()
    await installGate
    await mkdir(dirname(currentPaths.entry), { recursive: true })
    await writeFile(currentPaths.entry, '')
  },
  starter: async (_node, currentPaths) => {
    stopDuringInstallStarts += 1
    stopDuringInstallRunning = true
    await writeFile(currentPaths.pid, '4321')
    return { 'APP-Service-Start-PID': '4321' }
  },
  processList: async () =>
    stopDuringInstallRunning
      ? [
          {
            PID: '4321',
            PPID: '',
            COMMAND: `node ${stopDuringInstallPaths.entry}`,
            USER: ''
          }
        ]
      : [],
  listeningPids: async () => (stopDuringInstallRunning ? ['4321'] : []),
  health: async () => stopDuringInstallRunning,
  portFinder: async () => 8082,
  kill: async () => {
    stopDuringInstallRunning = false
  }
})

let stopDuringInstallSettled = false
const pendingOpen = stopDuringInstallRuntime.open(node, redis)
await installStarted
const pendingStop = stopDuringInstallRuntime.stop().then((pids) => {
  stopDuringInstallSettled = true
  return pids
})

try {
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.equal(stopDuringInstallSettled, false)
  releaseInstall?.()
  await assert.rejects(forkPromiseToPromise(pendingOpen), /opening was canceled/)
  assert.deepEqual(await pendingStop, [])
  assert.equal(stopDuringInstallStarts, 0)
  assert.equal(existsSync(stopDuringInstallPaths.pid), false)
  assert.equal(existsSync(stopDuringInstallPaths.port), false)
} finally {
  releaseInstall?.()
  await pendingOpen.catch(() => {})
  await pendingStop.catch(() => {})
  await stopDuringInstallRuntime.stop()
  await rm(stopDuringInstallRoot, { recursive: true, force: true })
}

const stopDuringStartupRoot = await mkdtemp(join(tmpdir(), 'flyenv-redis-commander-startup-'))
const stopDuringStartupPaths = redisCommanderPaths(stopDuringStartupRoot, false)
await mkdir(dirname(stopDuringStartupPaths.entry), { recursive: true })
await writeFile(stopDuringStartupPaths.entry, '')
let releaseListenerCheck: (() => void) | undefined
let listenerCheckStartedResolver: (() => void) | undefined
const listenerCheckStarted = new Promise<void>((resolve) => {
  listenerCheckStartedResolver = resolve
})
const listenerCheckGate = new Promise<void>((resolve) => {
  releaseListenerCheck = resolve
})
let stopDuringStartupRunning = false
const stopDuringStartupKills: string[] = []
const stopDuringStartupRuntime = new RedisCommanderRuntime(stopDuringStartupRoot, {
  paths: stopDuringStartupPaths,
  config: async () => ({ host: '127.0.0.1', port: 6380 }),
  starter: async (_node, currentPaths) => {
    stopDuringStartupRunning = true
    await writeFile(currentPaths.pid, '2468')
    return { 'APP-Service-Start-PID': '2468' }
  },
  processList: async () =>
    stopDuringStartupRunning
      ? [
          {
            PID: '2468',
            PPID: '',
            COMMAND: `node ${stopDuringStartupPaths.entry}`,
            USER: ''
          }
        ]
      : [],
  listeningPids: async () => {
    listenerCheckStartedResolver?.()
    await listenerCheckGate
    return stopDuringStartupRunning ? ['2468'] : []
  },
  health: async () => true,
  portFinder: async () => 8083,
  kill: async (pids) => {
    stopDuringStartupKills.push(...pids)
    stopDuringStartupRunning = false
  }
})

const startupOpen = stopDuringStartupRuntime.open(node, redis)
await listenerCheckStarted
const startupStop = stopDuringStartupRuntime.stop()

try {
  releaseListenerCheck?.()
  await assert.rejects(forkPromiseToPromise(startupOpen), /opening was canceled/)
  assert.deepEqual(await startupStop, ['2468'])
  assert.deepEqual(stopDuringStartupKills, ['2468'])
  assert.equal(existsSync(stopDuringStartupPaths.pid), false)
  assert.equal(existsSync(stopDuringStartupPaths.port), false)
} finally {
  releaseListenerCheck?.()
  await startupOpen.catch(() => {})
  await startupStop.catch(() => {})
  await stopDuringStartupRuntime.stop()
  await rm(stopDuringStartupRoot, { recursive: true, force: true })
}

const foreignListenerRoot = await mkdtemp(join(tmpdir(), 'flyenv-redis-commander-listener-'))
const foreignListenerPaths = redisCommanderPaths(foreignListenerRoot, false)
let foreignListenerRunning = false
const foreignListenerKills: string[] = []
const foreignListenerRuntime = new RedisCommanderRuntime(foreignListenerRoot, {
  paths: foreignListenerPaths,
  config: async () => ({ host: '127.0.0.1', port: 6380 }),
  installer: async (_nodeBin, currentPaths) => {
    await mkdir(dirname(currentPaths.entry), { recursive: true })
    await writeFile(currentPaths.entry, '')
  },
  starter: async (_node, currentPaths) => {
    foreignListenerRunning = true
    await writeFile(currentPaths.pid, '5678')
    return { 'APP-Service-Start-PID': '5678' }
  },
  processList: async () =>
    foreignListenerRunning
      ? [
          {
            PID: '5678',
            PPID: '',
            COMMAND: `node ${foreignListenerPaths.entry}`,
            USER: ''
          }
        ]
      : [],
  listeningPids: async () => ['9876'],
  health: async () => true,
  portFinder: async () => 8083,
  kill: async (pids) => {
    foreignListenerKills.push(...pids)
    foreignListenerRunning = false
  }
})

try {
  await assert.rejects(
    forkPromiseToPromise(foreignListenerRuntime.open(node, redis)),
    /Redis Commander does not own its allocated loopback port/
  )
  assert.deepEqual(foreignListenerKills, ['5678'])
  assert.equal(existsSync(foreignListenerPaths.pid), false)
  assert.equal(existsSync(foreignListenerPaths.port), false)
} finally {
  await foreignListenerRuntime.stop()
  await rm(foreignListenerRoot, { recursive: true, force: true })
}

const projectRoot = join(import.meta.dirname, '..')
const redisModule = readFileSync(join(projectRoot, 'src/fork/module/Redis/index.ts'), 'utf8')
assert.match(redisModule, /RedisCommanderRuntime/)
assert.match(redisModule, /openRedisCommander\(\s*node: SoftInstalled,\s*redis: SoftInstalled\s*\)/)
assert.match(redisModule, /this\.redisCommanderRuntime\.open\(node, redis, on\)/)
assert.match(redisModule, /const redisCommanderPids = await this\.redisCommanderRuntime\.stop\(\)/)
assert.match(
  redisModule,
  /\[\.\.\.\(result\['APP-Service-Stop-PID'\] \?\? \[\]\), \.\.\.redisCommanderPids\]/
)

console.log('Redis Commander contract tests passed')
