import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { SoftInstalled } from '../src/shared/app'
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

const root = await mkdtemp(join(tmpdir(), 'flyenv-redis-commander-'))
const runtimePaths = redisCommanderPaths(root, false)
let installs = 0
let starts = 0
let running = false
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
await rm(root, { recursive: true, force: true })

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
