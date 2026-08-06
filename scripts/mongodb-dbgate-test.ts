import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  DBGATE_DEFAULT_PORT,
  DBGATE_PACKAGE,
  dbGateCommandOwned,
  dbGateCredentials,
  dbGateEnv,
  dbGateInstallManifest,
  dbGatePaths,
  dbGateUrl,
  mongodbPortFromConfig,
  DbGateRuntime
} from '../src/fork/module/DbGate'
import { findLoopbackPort } from '../src/shared/LoopbackPort'
import { isWebPanelInstallNotice, webPanelInstallNotice } from '../src/shared/WebPanelInstallNotice'

const unix = dbGatePaths('/tmp/FlyEnv/server', false)
assert.deepEqual(webPanelInstallNotice('pgAdmin 4'), {
  type: 'web-panel-install',
  service: 'pgAdmin 4'
})
assert.equal(isWebPanelInstallNotice(webPanelInstallNotice('DbGate')), true)
assert.equal(isWebPanelInstallNotice({ type: 'other', service: 'DbGate' }), false)
assert.equal(DBGATE_PACKAGE, 'dbgate-serve')
assert.deepEqual(dbGateInstallManifest(), {
  name: 'flyenv-dbgate',
  private: true,
  dependencies: { 'dbgate-serve': 'latest' },
  overrides: { 'dbgate-pg-dumper': '1.0.0' }
})
assert.equal(DBGATE_DEFAULT_PORT, 3000)
assert.equal(unix.root, '/tmp/FlyEnv/server/dbgate')
assert.equal(unix.workspace, '/tmp/FlyEnv/server/dbgate/workspace')
assert.equal(unix.pid, '/tmp/FlyEnv/server/dbgate/dbgate.pid')
assert.equal(unix.port, '/tmp/FlyEnv/server/dbgate/dbgate.port')
assert.equal(unix.entry, '/tmp/FlyEnv/server/dbgate/node_modules/dbgate-serve/bin/dbgate-serve.js')
const windows = dbGatePaths('C:\\FlyEnv\\server', true)
assert.equal(windows.root, 'C:\\FlyEnv\\server\\dbgate')
assert.equal(
  windows.entry,
  'C:\\FlyEnv\\server\\dbgate\\node_modules\\dbgate-serve\\bin\\dbgate-serve.js'
)

const credentials = { login: 'flyenv', password: 'test-password' }
const env = dbGateEnv(unix, 3001, credentials)
assert.equal(env.WORKSPACE_DIR, unix.workspace)
assert.equal(env.PORT, '3001')
assert.equal(env.BASIC_AUTH, '1')
assert.equal(env.LOGIN, 'flyenv')
assert.equal(env.PASSWORD, 'test-password')
assert.equal(env.SHELL_CONNECTION, '0')
assert.equal(env.SHELL_SCRIPTING, '0')
assert.equal(env.CONNECTIONS, undefined)
assert.equal(mongodbPortFromConfig('net:\n  port: 27019\n'), 27019)
assert.equal(mongodbPortFromConfig('net:\n  bindIp: 127.0.0.1\n'), 27017)
assert.equal(dbGateUrl(3001), 'http://127.0.0.1:3001')
assert.equal(dbGateUrl(3001, credentials), 'http://flyenv:test-password@127.0.0.1:3001')
assert.equal(
  dbGateUrl(3001, { login: 'fly env', password: 'p@ss:/?' }),
  'http://fly%20env:p%40ss%3A%2F%3F@127.0.0.1:3001'
)
assert.equal(
  dbGateUrl(3001, { login: 'fly env', password: 'p@ss:/?' }),
  'http://fly%20env:p%40ss%3A%2F%3F@127.0.0.1:3001'
)
assert.equal(dbGateCommandOwned('node ' + unix.entry, unix, false), true)
assert.equal(dbGateCommandOwned('node /tmp/other/dbgate-serve.js', unix, false), false)
assert.equal(dbGateCommandOwned('node ' + unix.entry.replaceAll('/', '\\'), unix, true), true)
assert.match(dbGateCredentials('a'.repeat(32)), /^flyenv:a{32}$/)

const runtimeRoot = await mkdtemp(join(tmpdir(), 'flyenv-dbgate-test-'))
const runtimePaths = dbGatePaths(runtimeRoot, false)
let installs = 0
let starts = 0
let kills: string[] = []
let alive = true
const notices: unknown[] = []
await mkdir(join(runtimePaths.root, 'node_modules', 'dbgate-serve', 'bin'), { recursive: true })
const node = {
  typeFlag: 'node',
  version: '22.0.0',
  bin: '/tmp/node/bin/node',
  path: '/tmp/node',
  num: 2200,
  enable: true,
  run: false,
  running: false
} as any
const runtime = new DbGateRuntime(runtimeRoot, {
  paths: runtimePaths,
  processList: async () =>
    alive ? [{ PID: '1234', PPID: '1', USER: 'test', COMMAND: `node ${runtimePaths.entry}` }] : [],
  listeningPids: async (port) => (port === '3001' ? ['1234'] : []),
  health: async () => true,
  portFinder: async () => 3001,
  installer: async () => {
    installs += 1
    await writeFile(runtimePaths.entry, '')
  },
  starter: async (_node, paths) => {
    starts += 1
    await writeFile(paths.pid, '1234')
    return { 'APP-Service-Start-PID': '1234' }
  },
  kill: async (pids) => {
    kills = pids
    alive = false
  }
})
const firstOpen = await runtime.open(node, (message) => notices.push(message))
assert.equal(installs, 1)
assert.deepEqual(notices, [webPanelInstallNotice('DbGate')])
assert.equal(starts, 1)
assert.equal(firstOpen['APP-Service-Start-PID'], '1234')
assert.match(firstOpen.url, /^http:\/\/flyenv:.+@127\.0\.0\.1:3001$/)
const secondOpen = await runtime.open(node)
assert.equal(installs, 1)
assert.deepEqual(notices, [webPanelInstallNotice('DbGate')])
assert.equal(starts, 1)
assert.equal(secondOpen.url, firstOpen.url)
assert.deepEqual(await runtime.stop(), ['1234'])
assert.deepEqual(kills, ['1234'])
assert.equal(existsSync(runtimePaths.pid), false)
assert.equal(existsSync(runtimePaths.port), false)
await rm(runtimeRoot, { recursive: true, force: true })

assert.equal(await findLoopbackPort(3000, 3, 3002, [3000], async (port) => port === 3001), 3001)
await assert.rejects(
  () => findLoopbackPort(3000, 2, 3001, [], async () => false),
  /No loopback port is available/
)

const root = join(import.meta.dirname, '..')
const forkSource = readFileSync(join(root, 'src/fork/module/Mongodb/index.ts'), 'utf8')
const pageSource = readFileSync(join(root, 'src/render/components/MongoDB/Index.vue'), 'utf8')
const ipcSource = readFileSync(join(root, 'src/render/util/IPC.ts'), 'utf8')
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const licenseSource = readFileSync(join(root, 'docs/third-party-licenses.md'), 'utf8')
assert.match(forkSource, /openDbGate\(/)
assert.match(forkSource, /dbGateRuntime\.stop\(/)
assert.match(pageSource, /openDbGate/)
assert.match(pageSource, /BrewStore\(\)/)
assert.match(pageSource, /shell\.openExternal\(res\.data\.url\)/)
assert.match(pageSource, /IPC\.sendSensitive\(/)
assert.match(pageSource, /ElMessage/)
assert.match(pageSource, /isWebPanelInstallNotice/)
assert.match(pageSource, /base\.webPanelFirstInstall/)
assert.match(pageSource, /webPanelOpeningState\('dbgate'\)/)
assert.match(pageSource, /dbGateOpeningState\.finish\(\)/)
assert.doesNotMatch(pageSource, /password|credentials/i)
assert.match(ipcSource, /sensitive/i)
assert.equal(packageJson.dependencies?.['dbgate-serve'], undefined)
assert.match(licenseSource, /dbgate-serve/)
assert.match(licenseSource, /GPL-3\.0/)
assert.match(licenseSource, /https:\/\/github\.com\/dbgate\/dbgate/)

console.log('MongoDB DbGate contract tests passed')
