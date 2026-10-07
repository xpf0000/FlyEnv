import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  dashboardsArtifactUrl,
  dashboardsPaths,
  OpenSearchDashboardsRuntime,
  parseOpenSearchBackendConfig,
  validateOpenSearchBackendResponse
} from '../plugins/opensearch/fork/OpenSearch/dashboards'

const parsed = parseOpenSearchBackendConfig(`
http.port: 9217
plugins.security.ssl.http.enabled: false
`)
assert.deepEqual(parsed, { port: 9217, tls: false })
assert.deepEqual(
  parseOpenSearchBackendConfig('http.port: 9200-9210\nplugins.security.ssl.http.enabled: true'),
  { port: 9200, tls: true }
)
assert.deepEqual(
  parseOpenSearchBackendConfig(
    'http:\n  port: 9200\nplugins:\n  security:\n    disabled: true\n    ssl:\n      http:\n        enabled: true'
  ),
  { port: 9200, tls: false },
  'disabled security plugin means its TLS setting is inactive'
)
assert.equal(
  dashboardsArtifactUrl('2.19.0', 'linux', 'x64'),
  'https://artifacts.opensearch.org/releases/bundle/opensearch-dashboards/2.19.0/opensearch-dashboards-2.19.0-linux-x64.tar.gz'
)
assert.equal(
  dashboardsArtifactUrl('2.19.0', 'windows', 'x64'),
  'https://artifacts.opensearch.org/releases/bundle/opensearch-dashboards/2.19.0/opensearch-dashboards-2.19.0-windows-x64.zip'
)
assert.throws(() => dashboardsArtifactUrl('2.19', 'linux', 'x64'), /version could not be verified/)
assert.throws(
  () => validateOpenSearchBackendResponse(401, { version: { number: '2.19.0' } }, '2.19.0'),
  /Authenticated/
)
assert.throws(
  () => validateOpenSearchBackendResponse(200, { version: { number: '2.18.0' } }, '2.19.0'),
  /does not match OpenSearch version/
)
assert.equal(
  validateOpenSearchBackendResponse(200, { version: { number: '2.19.0' } }, '2.19.0'),
  '2.19.0'
)

const root = await mkdtemp(join(tmpdir(), 'flyenv-opensearch-dashboards-'))
const backend = {
  typeFlag: 'opensearch',
  version: '2.19.0',
  bin: join(root, 'backend', 'bin', 'opensearch'),
  path: join(root, 'backend'),
  num: 2190,
  enable: true,
  run: false,
  running: true,
  pid: '900'
} as any
let installs = 0
let starts = 0
let stops = 0
let nextPid = 4102
let processList: any[] = []
const runtime = new OpenSearchDashboardsRuntime({
  baseDir: () => root,
  platform: () => 'linux',
  arch: () => 'x64',
  probeBackend: async () => ({ version: '2.19.0', port: 9200 }),
  install: async (_version, paths) => {
    installs++
    await mkdir(join(paths.install, 'node', 'bin'), { recursive: true })
    await mkdir(join(paths.install, 'src', 'cli'), { recursive: true })
    await writeFile(join(paths.install, 'node', 'bin', 'node'), '')
    await writeFile(join(paths.install, 'src', 'cli', 'dist.js'), '')
    return paths.install
  },
  findPort: async () => 5602,
  start: async (_node, entry, config, paths) => {
    starts++
    const pid = `${nextPid++}`
    await writeFile(entry, 'runtime test launcher')
    await writeFile(paths.pid, pid)
    processList = [{ PID: pid, PPID: '1', USER: 'tester', COMMAND: `node ${entry} -c ${config}` }]
    return pid
  },
  ready: async () => {},
  checkReady: async () => true,
  processes: async () => processList,
  stopOwned: async (item) => {
    stops++
    processList = []
    await rm(dashboardsPaths(root, item).pid, { force: true })
    return [item.pid!]
  }
})
const openEvents: unknown[] = []
assert.equal(typeof runtime.prepare, 'function', 'installation must have its own IPC phase')
const preparing = runtime.prepare(backend, () => {})
assert.equal(
  preparing,
  runtime.prepare(backend, () => {}),
  'duplicate preparations share work'
)
const preparationGeneration = await preparing
assert.equal(typeof preparationGeneration, 'string')
assert.equal(installs, 1)
assert.equal(starts, 0, 'preparation must never start a service')
const anotherWorker = new OpenSearchDashboardsRuntime({
  baseDir: () => root,
  processes: async () => [],
  stopOwned: async () => []
})
await anotherWorker.stopAll()
await assert.rejects(() => runtime.open(backend, () => {}, preparationGeneration), /cancelled/i)
assert.equal(starts, 0, 'a separate worker stopping must fence the prepared generation')
const firstOpen = runtime.open(backend, (event) => openEvents.push(event))
const duplicateOpen = runtime.open(backend, (event) => openEvents.push(event))
assert.equal(firstOpen, duplicateOpen, 'duplicate opens share one pending promise')
const opened = await firstOpen
assert.equal(opened.url, 'http://127.0.0.1:5602')
assert.equal(opened['APP-Service-Start-PID'], '4102')
assert.equal(opened['APP-Service-Start-Item'].pid, '4102')
assert.equal(installs, 1)
assert.equal(starts, 1)
assert.match(
  await readFile(opened['APP-Service-Start-Item'].dashboard.configPath, 'utf8'),
  /server\.host: "127\.0\.0\.1"/
)
assert.doesNotMatch(
  await readFile(opened['APP-Service-Start-Item'].dashboard.configPath, 'utf8'),
  /opensearch_security/
)
const reused = await runtime.open(backend, () => {})
assert.equal(reused['APP-Service-Start-PID'], '4102', 'a healthy owned panel is reused')
assert.equal(starts, 1)
assert.deepEqual(await runtime.stopInstance(opened['APP-Service-Start-Item']), ['4102'])
processList = []
const reopened = await runtime.open(backend, () => {})
assert.equal(
  reopened['APP-Service-Start-PID'],
  '4103',
  'opening after a completed stop starts a new panel'
)
assert.equal(starts, 2)
const reopenedConfig = await readFile(
  reopened['APP-Service-Start-Item'].dashboard.configPath,
  'utf8'
)
assert.equal(
  reopenedConfig.match(/^\s*logging\.dest:/gm)?.length,
  1,
  'reopen replaces generated logging.dest instead of duplicating it'
)

const restoredWorker = new OpenSearchDashboardsRuntime({
  baseDir: () => root,
  platform: () => 'linux',
  arch: () => 'x64',
  probeBackend: async () => ({ version: '2.19.0', port: 9200 }),
  findPort: async () => 5603,
  processes: async () => processList,
  checkReady: async () => true,
  stopOwned: async (item) => {
    stops++
    processList = []
    await rm(dashboardsPaths(root, item).pid, { force: true })
    return [item.pid!]
  }
})
assert.deepEqual(
  await restoredWorker.stopAll(),
  ['4103'],
  'a fresh worker stops persisted companion metadata'
)
assert.equal(stops, 2)
let enterReadiness!: () => void
const readinessEntered = new Promise<void>((resolve) => {
  enterReadiness = resolve
})
let racedCleanup = 0
const startingWorker = new OpenSearchDashboardsRuntime({
  baseDir: () => root,
  platform: () => 'linux',
  probeBackend: async () => ({ version: '2.19.0', port: 9200 }),
  findPort: async () => 5604,
  processes: async () => processList,
  start: async (_node, entry, config, paths) => {
    await writeFile(entry, 'race launcher')
    await writeFile(paths.pid, '4400')
    processList = [{ PID: '4400', COMMAND: `node ${entry} -c ${config}` }]
    return '4400'
  },
  ready: async (_url, _pid, _paths, signal) => {
    enterReadiness()
    await new Promise<void>((resolve) =>
      signal.addEventListener('abort', () => resolve(), { once: true })
    )
  },
  stopOwned: async (item) => {
    racedCleanup++
    processList = []
    await rm(item.dashboard.pidPath, { force: true })
    return [item.pid!]
  }
})
const racingOpen = startingWorker.open(backend, () => {}).catch((error) => error)
await readinessEntered
assert.deepEqual(await restoredWorker.stopAll(), [])
assert.match(`${await racingOpen}`, /cancelled/i)
assert.equal(racedCleanup, 1, 'peer stop waits for the starting worker to clean its unready child')
assert.deepEqual(processList, [], 'a separate worker stop cannot leave a late companion')
await rm(root, { recursive: true, force: true })

const macRoot = await mkdtemp(join(tmpdir(), 'flyenv-opensearch-dashboards-mac-reuse-'))
const macPaths = dashboardsPaths(macRoot, { ...backend, path: join(macRoot, 'backend') } as any)
await mkdir(macPaths.instance, { recursive: true })
await writeFile(macPaths.pid, '4199')
await writeFile(macPaths.entry, 'launcher')
await writeFile(macPaths.config, 'server.port: 5610\n')
let checkedVersion = ''
const macRuntime = new OpenSearchDashboardsRuntime({
  baseDir: () => macRoot,
  platform: () => 'macos',
  arch: () => 'arm64',
  probeBackend: async () => ({ version: '2.19.0', port: 9200 }),
  processes: async () => [
    {
      PID: '4199',
      PPID: '1',
      USER: 'tester',
      COMMAND: `node ${macPaths.entry} -c ${macPaths.config}`
    }
  ],
  checkReady: async (_url, _pid, _paths, expectedVersion) => {
    checkedVersion = expectedVersion
    return true
  }
})
const macReused = await macRuntime.open(
  { ...backend, path: join(macRoot, 'backend') } as any,
  () => {}
)
assert.equal(macReused['APP-Service-Start-PID'], '4199')
assert.equal(
  checkedVersion,
  '2.19.0',
  'Homebrew reuse checks API version without archive package.json'
)
await rm(macRoot, { recursive: true, force: true })

const failedRoot = await mkdtemp(join(tmpdir(), 'flyenv-opensearch-dashboards-failed-'))
let healthCleanup = 0
const failedRuntime = new OpenSearchDashboardsRuntime({
  baseDir: () => failedRoot,
  platform: () => 'linux',
  arch: () => 'x64',
  probeBackend: async () => ({ version: '2.19.0', port: 9200 }),
  install: async (_version, paths) => {
    await mkdir(join(paths.install, 'node', 'bin'), { recursive: true })
    await mkdir(join(paths.install, 'src', 'cli'), { recursive: true })
    await writeFile(join(paths.install, 'node', 'bin', 'node'), '')
    await writeFile(join(paths.install, 'src', 'cli', 'dist.js'), '')
    return paths.install
  },
  findPort: async () => 5602,
  start: async (_node, entry, _config, paths) => {
    await writeFile(entry, 'launcher')
    await writeFile(paths.pid, '5501')
    return '5501'
  },
  ready: async () => {
    throw new Error('health failed')
  },
  processes: async () => [
    { PID: '5501', PPID: '1', USER: 'tester', COMMAND: 'owned-launch.js --config owned.yml' }
  ],
  stopOwned: async (item) => {
    healthCleanup++
    await rm(item.dashboard.pidPath, { force: true })
    return ['5501']
  }
})
await assert.rejects(() => failedRuntime.open(backend, () => {}), /health failed/)
assert.equal(healthCleanup, 1, 'failed readiness cleans up the newly spawned companion')
await rm(failedRoot, { recursive: true, force: true })

const cancelRoot = await mkdtemp(join(tmpdir(), 'flyenv-opensearch-dashboards-cancel-'))
let cancelStarts = 0
let installEntered!: () => void
const enteredInstall = new Promise<void>((resolve) => {
  installEntered = resolve
})
const cancelRuntime = new OpenSearchDashboardsRuntime({
  baseDir: () => cancelRoot,
  platform: () => 'linux',
  arch: () => 'x64',
  probeBackend: async () => ({ version: '2.19.0', port: 9200 }),
  install: async (_version, _paths, signal) => {
    installEntered()
    return new Promise((_resolve, reject) =>
      signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true })
    )
  },
  findPort: async () => 5602,
  start: async () => {
    cancelStarts++
    return '1'
  },
  processes: async () => [],
  stopOwned: async () => []
})
const cancelledOpen = cancelRuntime.open(backend, () => {}).catch((error) => error)
await enteredInstall
const stopping = cancelRuntime.stopAll()
const lateOpen = cancelRuntime.open(backend, () => {}).catch((error) => error)
assert.deepEqual(await stopping, [])
assert.match(`${await cancelledOpen}`, /cancelled|cancel/i)
assert.match(`${await lateOpen}`, /cancelled|cancel/i)
assert.equal(cancelStarts, 0, 'stop prevents a cancelled install from launching later')
await rm(cancelRoot, { recursive: true, force: true })

let preparationEntered!: () => void
const enteredPreparation = new Promise<void>((resolve) => {
  preparationEntered = resolve
})
const cancelPreparation = new OpenSearchDashboardsRuntime({
  baseDir: () => root,
  probeBackend: async (_version, signal) => {
    preparationEntered()
    return new Promise((_resolve, reject) => {
      signal!.addEventListener('abort', () => reject(new Error('preparation cancelled')), {
        once: true
      })
    })
  },
  install: async () => {
    throw new Error('must not install after cancelled prerequisite')
  },
  processes: async () => [],
  stopOwned: async () => []
})
const preparingCancelled = cancelPreparation.prepare(backend, () => {}).catch((error) => error)
await enteredPreparation
const preparationStop = new OpenSearchDashboardsRuntime({
  baseDir: () => root,
  processes: async () => [],
  stopOwned: async () => []
}).stopAll()
const fencedPreparation = cancelPreparation.prepare(backend, () => {}).catch((error) => error)
assert.deepEqual(await preparationStop, [])
assert.match(`${await preparingCancelled}`, /preparation cancelled/)
assert.match(`${await fencedPreparation}`, /cancelled/i)
await rm(root, { recursive: true, force: true })

console.log('OpenSearch Dashboards runtime tests passed')
