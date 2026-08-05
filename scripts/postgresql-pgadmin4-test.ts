import assert from 'node:assert/strict'
import { createServer } from 'node:net'
import { once } from 'node:events'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { loopbackListeningPidsFromNetstat } from '../src/shared/Process.win'
import {
  completePgAdminInitialization,
  findPgAdminPort,
  PGADMIN4_DEFAULT_PORT,
  PGADMIN4_MAX_PORT,
  PGADMIN4_MAX_SERVER_PORT,
  PGADMIN4_PACKAGE,
  PGADMIN4_PORT_SCAN_COUNT,
  PgAdminSingleFlight,
  pgAdminCommandOwned,
  pgAdminCommandOwnedWithoutPackageMetadata,
  pgAdminConfigContent,
  pgAdminDesktopBootstrapContent,
  pgAdminDesktopInitializationVerificationContent,
  pgAdminDesktopServerIdentityContent,
  pgAdminDesktopServerReconciliationContent,
  pgAdminInitializationState,
  pgAdminInitialized,
  pgAdminOwnedPids,
  pgAdminOwnedPidsWithoutPackageMetadata,
  pgAdminPackageRootProbe,
  pgAdminPackageRootUnversionedProbe,
  pgAdminPaths,
  pgAdminPrivateDirectories,
  parsePgAdminServerIdentity,
  pgAdminServersContent,
  pgAdminUrl,
  postgresqlPortFromConfig,
  assertPgAdminRegistrationPort,
  startPgAdminWithPortRetry,
  stopPgAdminPidsWithVerification,
  validPgAdminRegistrationPort,
  validPgAdminPythonVersion,
  verifyPgAdminPidPersistence,
  waitForPgAdminHealth
} from '../src/fork/module/Postgresql/pgAdmin'

assert.equal(PGADMIN4_DEFAULT_PORT, 5050)
assert.equal(PGADMIN4_MAX_PORT, 65535)
assert.equal(PGADMIN4_MAX_SERVER_PORT, 65534)
assert.equal(PGADMIN4_PORT_SCAN_COUNT, 21)
assert.equal(PGADMIN4_PACKAGE, 'pgadmin4==9.17')
assert.equal(pgAdminUrl(5051), 'http://127.0.0.1:5051')
assert.equal(validPgAdminRegistrationPort(65534), true)
assert.equal(validPgAdminRegistrationPort(65535), false)
assert.throws(
  () => assertPgAdminRegistrationPort(65535),
  /pgAdmin 4 only supports PostgreSQL registration ports from 1 through 65534/
)

const postgreSqlDir = join('/tmp', 'flyenv-postgresql')
const unixPaths = pgAdminPaths(postgreSqlDir, false)
const packageRoot = join('/tmp', 'flyenv-pgadmin-package')
assert.deepEqual(unixPaths, {
  root: join(postgreSqlDir, 'pgadmin4'),
  data: join(postgreSqlDir, 'pgadmin4', 'data'),
  log: join(postgreSqlDir, 'pgadmin4', 'log'),
  pid: join(postgreSqlDir, 'pgadmin4', 'pgadmin4.pid'),
  port: join(postgreSqlDir, 'pgadmin4', 'pgadmin4.port'),
  servers: join(postgreSqlDir, 'pgadmin4', 'servers.json'),
  bootstrap: join(postgreSqlDir, 'pgadmin4', 'bootstrap-admin.py'),
  verification: join(postgreSqlDir, 'pgadmin4', 'verify-initialization.py'),
  identityScript: join(postgreSqlDir, 'pgadmin4', 'read-server-identity.py'),
  identity: join(postgreSqlDir, 'pgadmin4', 'server-identity.json'),
  reconciliation: join(postgreSqlDir, 'pgadmin4', 'reconcile-server.py'),
  initialized: join(postgreSqlDir, 'pgadmin4', 'initialized'),
  desktopMode: join(postgreSqlDir, 'pgadmin4', 'desktop-mode'),
  venv: join(postgreSqlDir, 'pgadmin4', 'venv'),
  python: join(postgreSqlDir, 'pgadmin4', 'venv', 'bin', 'python')
})
assert.equal(
  pgAdminPaths(postgreSqlDir, true).python,
  join(postgreSqlDir, 'pgadmin4', 'venv', 'Scripts', 'python.exe')
)
assert.deepEqual(pgAdminPrivateDirectories(unixPaths, false), [
  unixPaths.root,
  unixPaths.data,
  unixPaths.log
])
assert.deepEqual(pgAdminPrivateDirectories(unixPaths, true), [])

const initializationFiles = new Set([join(unixPaths.data, 'pgadmin4.db')])
assert.equal(
  pgAdminInitialized(unixPaths, (file) => initializationFiles.has(file)),
  false
)
initializationFiles.add(unixPaths.initialized)
assert.equal(
  pgAdminInitialized(unixPaths, (file) => initializationFiles.has(file)),
  false
)
initializationFiles.add(unixPaths.identity)
assert.equal(
  pgAdminInitialized(unixPaths, (file) => initializationFiles.has(file)),
  false
)
initializationFiles.add(unixPaths.desktopMode)
assert.equal(
  pgAdminInitialized(unixPaths, (file) => initializationFiles.has(file)),
  true
)
const validInitializationState = await pgAdminInitializationState(
  unixPaths,
  (file) => initializationFiles.has(file),
  async () => '{"userId": "9007199254740993", "serverId": "9007199254740994"}'
)
assert.deepEqual(validInitializationState, {
  initialized: true,
  identity: { userId: '9007199254740993', serverId: '9007199254740994' }
})
const malformedInitializationState = await pgAdminInitializationState(
  unixPaths,
  (file) => initializationFiles.has(file),
  async () => '{not json}'
)
assert.deepEqual(malformedInitializationState, { initialized: false })

const configDataDir = '/tmp/FlyEnv data'
const configLogDir = '/tmp/FlyEnv logs'
const config = pgAdminConfigContent(configDataDir, configLogDir, 5051)
assert.equal(config.split('\n').filter((line) => line === 'SERVER_MODE = False').length, 1)
assert.match(config, /DEFAULT_SERVER = "127\.0\.0\.1"/)
assert.match(config, /DEFAULT_SERVER_PORT = 5051/)
assert.match(config, /DATA_DIR = "\/tmp\/FlyEnv data"/)
assert.match(config, /SQLITE_PATH = "\/tmp\/FlyEnv data\/pgadmin4\.db"/)
assert.match(config, /SESSION_DB_PATH = "\/tmp\/FlyEnv data\/sessions"/)
assert.match(config, /STORAGE_DIR = "\/tmp\/FlyEnv data\/storage"/)
assert.match(config, /LOG_FILE = "\/tmp\/FlyEnv logs\/pgadmin4\.log"/)
assert.match(config, /KERBEROS_CCACHE_DIR = "\/tmp\/FlyEnv data\/kerberos"/)
assert.match(config, /AZURE_CREDENTIAL_CACHE_DIR = "\/tmp\/FlyEnv data\/azure"/)
assert.doesNotMatch(config, /0\.0\.0\.0/)

const bootstrap = pgAdminDesktopBootstrapContent()
assert.match(bootstrap, /from secrets import token_urlsafe/)
assert.match(bootstrap, /package_root = sys\.argv\[1\]/)
assert.match(bootstrap, /sys\.path\.insert\(0, package_root\)/)
assert.match(bootstrap, /postgresql_port = int\(sys\.argv\[2\]\) if len\(sys\.argv\) > 2 else None/)
assert.match(bootstrap, /from pgadmin import create_app/)
assert.match(bootstrap, /from pgadmin\.model import Role, Server, User, db/)
assert.match(bootstrap, /from pgadmin\.tools\.user_management import create_user/)
assert.match(bootstrap, /with app\.test_request_context\(\):/)
assert.match(
  bootstrap,
  /administrator_role = Role\.query\.filter_by\(name='Administrator'\)\.first\(\)/
)
assert.match(bootstrap, /raise RuntimeError\('pgAdmin Administrator role was not found'\)/)
assert.match(bootstrap, /raise RuntimeError\('pgAdmin administrator verification failed'\)/)
assert.match(bootstrap, /if user is None:/)
assert.match(
  bootstrap,
  /User\.query\.filter_by\(username=config\.DESKTOP_USER, auth_source=INTERNAL\)\.first\(\)/
)
assert.match(bootstrap, /desktop_password = token_urlsafe\(48\)/)
assert.match(bootstrap, /'email': config\.DESKTOP_USER/)
assert.match(bootstrap, /'role': administrator_role\.id/)
assert.match(bootstrap, /'newPassword': desktop_password/)
assert.match(bootstrap, /raise RuntimeError\('pgAdmin administrator creation failed'\)/)
assert.doesNotMatch(bootstrap, /str\(error\)/)
assert.match(bootstrap, /if postgresql_port is not None:/)
assert.match(bootstrap, /server\.save_password = 0/)
assert.match(bootstrap, /db\.session\.commit\(\)/)
assert.doesNotMatch(bootstrap, /PGADMIN_SETUP|os\.environ|email = sys\.argv|print\([^\n]*password/)

const initializationVerification = pgAdminDesktopInitializationVerificationContent()
assert.match(initializationVerification, /from pgadmin import create_app/)
assert.match(initializationVerification, /from pgadmin\.model import Server, User/)
assert.match(initializationVerification, /postgresql_port = int\(sys\.argv\[2\]\)/)
assert.match(
  initializationVerification,
  /User\.query\.filter_by\(username=config\.DESKTOP_USER, auth_source=INTERNAL\)\.first\(\)/
)
assert.match(
  initializationVerification,
  /any\(role\.name == 'Administrator' for role in user\.roles\)/
)
assert.match(initializationVerification, /Server\.query\.filter_by\(/)
assert.match(initializationVerification, /user_id=user\.id/)
assert.match(initializationVerification, /name='FlyEnv PostgreSQL'/)
assert.match(initializationVerification, /host='127\.0\.0\.1'/)
assert.match(initializationVerification, /port=postgresql_port/)
assert.match(initializationVerification, /maintenance_db='postgres'/)
assert.match(initializationVerification, /username='root'/)
assert.match(initializationVerification, /if server is None:/)
assert.doesNotMatch(initializationVerification, /server\.password|save_password=0/)
assert.match(
  initializationVerification,
  /server\.servergroup is None or server\.servergroup\.name != 'Servers'/
)
assert.match(initializationVerification, /connection_params = server\.connection_params or \{\}/)
assert.match(initializationVerification, /connection_params\.get\('sslmode'\) != 'prefer'/)
assert.match(
  initializationVerification,
  /raise RuntimeError\('pgAdmin server verification failed'\)/
)
assert.doesNotMatch(
  initializationVerification,
  /PGADMIN_SETUP|os\.environ|email = sys\.argv|password = /
)

const packageRootProbe = pgAdminPackageRootProbe()
assert.match(packageRootProbe, /from importlib\.metadata import distribution/)
assert.match(packageRootProbe, /d = distribution\('pgadmin4'\)/)
assert.match(packageRootProbe, /d\.version == '9\.17'/)
assert.match(packageRootProbe, /d\.locate_file\('pgadmin4'\)/)
assert.doesNotMatch(packageRootProbe, /import pgadmin/)
const unversionedPackageRootProbe = pgAdminPackageRootUnversionedProbe()
assert.match(unversionedPackageRootProbe, /from importlib\.metadata import distribution/)
assert.match(unversionedPackageRootProbe, /distribution\('pgadmin4'\)\.locate_file\('pgadmin4'\)/)
assert.doesNotMatch(unversionedPackageRootProbe, /d\.version/)

const reconciliation = pgAdminDesktopServerReconciliationContent()
assert.match(reconciliation, /user_id = int\(sys\.argv\[2\]\)/)
assert.match(reconciliation, /server_id = int\(sys\.argv\[3\]\)/)
assert.match(reconciliation, /postgresql_port = int\(sys\.argv\[4\]\)/)
assert.match(reconciliation, /Server\.query\.filter_by\(/)
assert.match(reconciliation, /id=server_id/)
assert.match(
  reconciliation,
  /User\.query\.filter_by\(id=user_id, username=config\.DESKTOP_USER, auth_source=INTERNAL\)\.first\(\)/
)
assert.match(reconciliation, /user_id=user\.id/)
assert.match(reconciliation, /server\.port = postgresql_port/)
assert.doesNotMatch(reconciliation, /server\.password|server\.save_password/)
assert.match(reconciliation, /connection_params\['sslmode'\] = 'prefer'/)
assert.match(reconciliation, /db\.session\.commit\(\)/)
assert.doesNotMatch(reconciliation, /PGADMIN_SETUP|os\.environ|email = sys\.argv/)
assert.doesNotMatch(reconciliation, /\.all\(\)|for server in servers/)

const identityScript = pgAdminDesktopServerIdentityContent()
assert.match(identityScript, /postgresql_port = int\(sys\.argv\[2\]\)/)
assert.match(
  identityScript,
  /User\.query\.filter_by\(username=config\.DESKTOP_USER, auth_source=INTERNAL\)\.first\(\)/
)
assert.match(identityScript, /Server\.query\.filter_by\(/)
assert.match(identityScript, /user_id=user\.id/)
assert.match(
  identityScript,
  /server\.servergroup is None or server\.servergroup\.name != 'Servers'/
)
assert.match(
  identityScript,
  /json\.dumps\(\{'userId': str\(user\.id\), 'serverId': str\(server\.id\)\}\)/
)
assert.doesNotMatch(identityScript, /PGADMIN_SETUP|os\.environ|email = sys\.argv|password = /)
assert.deepEqual(parsePgAdminServerIdentity('{"userId": "9007199254740993", "serverId": "29"}'), {
  userId: '9007199254740993',
  serverId: '29'
})
assert.deepEqual(
  parsePgAdminServerIdentity(
    '{"userId": "9223372036854775807", "serverId": "9223372036854775807"}'
  ),
  { userId: '9223372036854775807', serverId: '9223372036854775807' }
)
assert.throws(
  () => parsePgAdminServerIdentity('{"userId": "9223372036854775808", "serverId": "29"}'),
  /identity/
)
assert.throws(
  () => parsePgAdminServerIdentity('{"userId": "17", "serverId": "9223372036854775808"}'),
  /identity/
)
assert.throws(() => parsePgAdminServerIdentity('{"userId": 17, "serverId": 29}'), /identity/)
assert.throws(() => parsePgAdminServerIdentity('{"userId": "0", "serverId": "29"}'), /identity/)
assert.throws(() => parsePgAdminServerIdentity('{"userId": "017", "serverId": "29"}'), /identity/)
assert.throws(
  () =>
    parsePgAdminServerIdentity('{"userId": "17", "serverId": "29", "email": "root@example.test"}'),
  /identity/
)

const initializationGateEvents: string[] = []
await assert.rejects(
  completePgAdminInitialization({
    verify: async () => {
      initializationGateEvents.push('verify')
      throw new Error('server import verification failed')
    },
    markInitialized: async () => {
      initializationGateEvents.push('mark')
    }
  }),
  /server import verification failed/
)
assert.deepEqual(initializationGateEvents, ['verify'])
await completePgAdminInitialization({
  verify: async () => {
    initializationGateEvents.push('verify-success')
  },
  markInitialized: async () => {
    initializationGateEvents.push('mark-success')
  }
})
assert.deepEqual(initializationGateEvents, ['verify', 'verify-success', 'mark-success'])

assert.deepEqual(
  loopbackListeningPidsFromNetstat(
    [
      '  TCP    127.0.0.1:5050       0.0.0.0:0              LISTENING       101',
      '  TCP    0.0.0.0:5050         0.0.0.0:0              LISTENING       102',
      '  TCP    127.0.0.1:5050       127.0.0.1:61000        ESTABLISHED     103',
      '  TCP    [::1]:5050           [::]:0                 LISTENING       104'
    ].join('\n'),
    '5050'
  ),
  ['101']
)

assert.equal(
  pgAdminCommandOwned(
    `${unixPaths.python} ${join(packageRoot, 'pgAdmin4.py')}`,
    unixPaths,
    packageRoot,
    false
  ),
  true
)
assert.equal(
  pgAdminCommandOwned(
    `${unixPaths.python} ${join(packageRoot, 'pgAdmin4.py')} --normal-flag`,
    unixPaths,
    packageRoot,
    false
  ),
  true
)
assert.equal(
  pgAdminCommandOwned(
    `"${unixPaths.python}" '${join(packageRoot, 'pgAdmin4.py')}' --normal-flag`,
    unixPaths,
    packageRoot,
    false
  ),
  true
)
assert.equal(
  pgAdminCommandOwned(
    `${unixPaths.python} -c "print('${join(packageRoot, 'pgAdmin4.py')}')"`,
    unixPaths,
    packageRoot,
    false
  ),
  false
)
assert.equal(
  pgAdminCommandOwned(
    `${unixPaths.python} /other/script.py ${join(packageRoot, 'pgAdmin4.py')}`,
    unixPaths,
    packageRoot,
    false
  ),
  false
)
assert.deepEqual(
  pgAdminOwnedPids(
    [
      { PID: '101', COMMAND: `${unixPaths.python} ${join(packageRoot, 'pgAdmin4.py')}` },
      { PID: '102', COMMAND: `${unixPaths.root}/other-python ${join(packageRoot, 'pgAdmin4.py')}` },
      { PID: '103', COMMAND: `${unixPaths.python} /other/pgAdmin4.py` },
      { PID: '104', COMMAND: `${unixPaths.python} ${join(packageRoot, 'not-pgadmin.py')}` },
      { PID: '101', COMMAND: `${unixPaths.python} ${join(packageRoot, 'pgAdmin4.py')}` }
    ],
    unixPaths,
    packageRoot,
    false
  ),
  ['101']
)
const metadataIndependentScript = join(
  unixPaths.venv,
  'lib',
  'python3.13',
  'site-packages',
  'pgadmin4',
  'pgAdmin4.py'
)
assert.equal(
  pgAdminCommandOwnedWithoutPackageMetadata(
    `${unixPaths.python} ${metadataIndependentScript} --normal-flag`,
    unixPaths,
    false
  ),
  true
)
assert.equal(
  pgAdminCommandOwnedWithoutPackageMetadata(
    `${unixPaths.python} ${join(unixPaths.venv, 'site-packages', 'pgadmin4', 'pgAdmin4.py')}`,
    unixPaths,
    false
  ),
  false
)
assert.equal(
  pgAdminCommandOwnedWithoutPackageMetadata(
    `/other/python ${metadataIndependentScript}`,
    unixPaths,
    false
  ),
  false
)
assert.equal(
  pgAdminCommandOwnedWithoutPackageMetadata(
    'C:\\FLYENV\\POSTGRESQL\\PGADMIN4\\VENV\\SCRIPTS\\PYTHON.EXE C:\\FLYENV\\POSTGRESQL\\PGADMIN4\\VENV\\LIB\\SITE-PACKAGES\\PGADMIN4\\PGADMIN4.PY',
    pgAdminPaths('C:/FlyEnv/postgresql', true),
    true
  ),
  true
)
assert.deepEqual(
  pgAdminOwnedPidsWithoutPackageMetadata(
    [
      { PID: '105', COMMAND: `${unixPaths.python} ${metadataIndependentScript}` },
      { PID: '106', COMMAND: `/other/python ${metadataIndependentScript}` },
      { PID: '105', COMMAND: `${unixPaths.python} ${metadataIndependentScript}` }
    ],
    unixPaths,
    false
  ),
  ['105']
)

const singleFlight = new PgAdminSingleFlight<string>()
let singleFlightCalls = 0
let releaseSingleFlight!: () => void
const singleFlightGate = new Promise<void>((resolve) => {
  releaseSingleFlight = resolve
})
const firstFlight = singleFlight.run(async () => {
  singleFlightCalls += 1
  await singleFlightGate
  return 'ready'
})
const followerFlight = singleFlight.run(async () => {
  singleFlightCalls += 1
  return 'duplicate'
})
await Promise.resolve()
assert.equal(singleFlightCalls, 1)
releaseSingleFlight()
assert.deepEqual(await Promise.all([firstFlight, followerFlight]), ['ready', 'ready'])
assert.equal(
  await singleFlight.run(async () => {
    singleFlightCalls += 1
    return 'next'
  }),
  'next'
)
assert.equal(singleFlightCalls, 2)

const retriedPorts: number[] = []
const configuredPorts: number[] = []
let persistedPort: number | undefined = 5000
let retryStartCalls = 0
const retryResult = await startPgAdminWithPortRetry({
  findPort: async (excluded) => (excluded.includes(5050) ? 5051 : 5050),
  writeConfig: async (port) => {
    configuredPorts.push(port)
  },
  start: async (port) => {
    retriedPorts.push(port)
    retryStartCalls += 1
    if (retryStartCalls === 1) {
      throw new Error('port claimed after probe')
    }
    return `pid-${port}`
  },
  isHealthy: async () => true,
  persistPort: async (port) => {
    persistedPort = port
  },
  cleanupStarted: async () => {
    throw new Error('should not clean up a successfully persisted pgAdmin process')
  },
  clearPort: async () => {
    persistedPort = undefined
  }
})
assert.deepEqual(retriedPorts, [5050, 5051])
assert.deepEqual(configuredPorts, [5050, 5051])
assert.deepEqual(retryResult, { port: 5051, result: 'pid-5051' })
assert.equal(persistedPort, 5051)

const persistFailureStarts: number[] = []
const cleanedPersistFailureResults: string[] = []
await assert.rejects(
  startPgAdminWithPortRetry({
    findPort: async (excluded) => (excluded.includes(5050) ? 5051 : 5050),
    writeConfig: async () => {},
    start: async (port) => {
      persistFailureStarts.push(port)
      return `pid-${port}`
    },
    isHealthy: async () => true,
    persistPort: async () => {
      throw new Error('could not persist pgAdmin port')
    },
    cleanupStarted: async (result) => {
      cleanedPersistFailureResults.push(result)
    },
    clearPort: async () => {}
  }),
  /could not persist pgAdmin port/
)
assert.deepEqual(persistFailureStarts, [5050])
assert.deepEqual(cleanedPersistFailureResults, ['pid-5050'])

const failedPorts: number[] = []
let failedPersistedPort: number | undefined = 5000
await assert.rejects(
  startPgAdminWithPortRetry({
    findPort: async (excluded) => (excluded.includes(5050) ? 5051 : 5050),
    writeConfig: async () => {},
    start: async (port) => {
      failedPorts.push(port)
      throw new Error('port claimed')
    },
    isHealthy: async () => true,
    persistPort: async (port) => {
      failedPersistedPort = port
    },
    cleanupStarted: async () => {
      throw new Error('should not clean up a pgAdmin process that did not start')
    },
    clearPort: async () => {
      failedPersistedPort = undefined
    }
  }),
  /port claimed/
)
assert.deepEqual(failedPorts, [5050, 5051])
assert.equal(failedPersistedPort, undefined)

const failedStartCleanup: string[] = []
let failedStartAttempts = 0
const recoveredStart = await startPgAdminWithPortRetry({
  findPort: async (excluded) => (excluded.includes(5050) ? 5051 : 5050),
  writeConfig: async () => {},
  start: async (port) => {
    failedStartAttempts += 1
    if (port === 5050) throw new Error('PID verification failed after spawn')
    return `pid-${port}`
  },
  cleanupStartFailure: async (port) => {
    failedStartCleanup.push(`cleanup:${port}`)
  },
  isHealthy: async () => true,
  persistPort: async () => {},
  cleanupStarted: async () => {},
  clearPort: async () => {}
})
assert.equal(failedStartAttempts, 2)
assert.deepEqual(failedStartCleanup, ['cleanup:5050'])
assert.deepEqual(recoveredStart, { port: 5051, result: 'pid-5051' })

let failedStartCleanupAttempts = 0
await assert.rejects(
  startPgAdminWithPortRetry({
    findPort: async () => 5050,
    writeConfig: async () => {},
    start: async () => {
      failedStartCleanupAttempts += 1
      throw new Error('PID verification failed after spawn')
    },
    cleanupStartFailure: async () => {
      throw new Error('strict launch cleanup failed')
    },
    isHealthy: async () => true,
    persistPort: async () => {},
    cleanupStarted: async () => {},
    clearPort: async () => {}
  }),
  /strict launch cleanup failed/
)
assert.equal(failedStartCleanupAttempts, 1)

const stoppedSpawnedPids: string[] = []
let clearedPidFile = false
await assert.rejects(
  verifyPgAdminPidPersistence({
    spawnedPid: '3001',
    readPersistedPid: async () => 'unrelated-pid',
    stopPid: async (pid) => {
      stoppedSpawnedPids.push(pid)
    },
    clearPid: async () => {
      clearedPidFile = true
    }
  }),
  /PID file was not persisted/
)
assert.deepEqual(stoppedSpawnedPids, ['3001'])
assert.equal(clearedPidFile, true)
await verifyPgAdminPidPersistence({
  spawnedPid: '3002',
  readPersistedPid: async () => '3002',
  stopPid: async () => {
    throw new Error('should not stop persisted PID')
  },
  clearPid: async () => {
    throw new Error('should not clear persisted PID')
  }
})
assert.equal(
  pgAdminCommandOwned(
    `${unixPaths.python} ${join(packageRoot, 'not-pgadmin.py')}`,
    unixPaths,
    packageRoot,
    false
  ),
  false
)
assert.equal(
  pgAdminCommandOwned('python /package/pgAdmin4.py', unixPaths, packageRoot, false),
  false
)
assert.equal(
  pgAdminCommandOwned(
    'C:\\FLYENV\\POSTGRESQL\\PGADMIN4\\VENV\\SCRIPTS\\PYTHON.EXE C:\\Package\\PGADMIN4.PY',
    pgAdminPaths('C:/FlyEnv/postgresql', true),
    'C:/Package',
    true
  ),
  true
)
assert.equal(
  pgAdminCommandOwned(`${unixPaths.python} /other/pgAdmin4.py`, unixPaths, packageRoot, false),
  false
)

const healthEvents: string[] = []
let healthChecks = 0
assert.equal(
  await waitForPgAdminHealth({
    isPortOwned: async () => {
      healthEvents.push('port')
      return true
    },
    isHttpReachable: async () => {
      healthChecks += 1
      healthEvents.push('http')
      return healthChecks === 2
    },
    wait: async () => {
      healthEvents.push('wait')
    },
    attempts: 2
  }),
  true
)
assert.deepEqual(healthEvents, ['port', 'http', 'wait', 'port', 'http'])

const unhealthyStartPorts: number[] = []
const unhealthyCleaned: string[] = []
const healthyPersistedPorts: number[] = []
let healthStartCalls = 0
let healthyRetryPortClears = 0
const healthyRetryResult = await startPgAdminWithPortRetry({
  findPort: async (excluded) => (excluded.includes(5050) ? 5051 : 5050),
  writeConfig: async () => {},
  start: async (port) => {
    unhealthyStartPorts.push(port)
    healthStartCalls += 1
    return `pid-${port}`
  },
  isHealthy: async () => healthStartCalls === 2,
  persistPort: async (port) => {
    healthyPersistedPorts.push(port)
  },
  cleanupStarted: async (pid) => {
    unhealthyCleaned.push(pid)
  },
  clearPort: async () => {
    healthyRetryPortClears += 1
  }
})
assert.deepEqual(unhealthyStartPorts, [5050, 5051])
assert.deepEqual(unhealthyCleaned, ['pid-5050'])
assert.deepEqual(healthyPersistedPorts, [5051])
assert.equal(healthyRetryPortClears, 2)
assert.deepEqual(healthyRetryResult, { port: 5051, result: 'pid-5051' })

const thrownHealthCleanup: string[] = []
let thrownHealthStarts = 0
const thrownHealthResult = await startPgAdminWithPortRetry({
  findPort: async (excluded) => (excluded.includes(5050) ? 5051 : 5050),
  writeConfig: async () => {},
  start: async (port) => {
    thrownHealthStarts += 1
    return `pid-${port}`
  },
  isHealthy: async () => {
    if (thrownHealthStarts === 1) throw new Error('health probe failed')
    return true
  },
  persistPort: async () => {},
  cleanupStarted: async (pid) => {
    thrownHealthCleanup.push(pid)
  },
  clearPort: async () => {}
})
assert.deepEqual(thrownHealthCleanup, ['pid-5050'])
assert.deepEqual(thrownHealthResult, { port: 5051, result: 'pid-5051' })

const cleanupFailureStarts: number[] = []
await assert.rejects(
  startPgAdminWithPortRetry({
    findPort: async () => 5050,
    writeConfig: async () => {},
    start: async (port) => {
      cleanupFailureStarts.push(port)
      return `pid-${port}`
    },
    isHealthy: async () => false,
    persistPort: async () => {},
    cleanupStarted: async () => {
      throw new Error('strict cleanup failed')
    },
    clearPort: async () => {}
  }),
  /strict cleanup failed/
)
assert.deepEqual(cleanupFailureStarts, [5050])

const strictStopEvents: string[] = []
let remainingStopPids = ['7001']
await stopPgAdminPidsWithVerification({
  pids: ['7001'],
  kill: async (pids) => {
    strictStopEvents.push(`kill:${pids.join(',')}`)
  },
  remainingPids: async () => {
    strictStopEvents.push(`check:${remainingStopPids.join(',')}`)
    const result = remainingStopPids
    remainingStopPids = []
    return result
  },
  wait: async () => {
    strictStopEvents.push('wait')
  },
  attempts: 2
})
assert.deepEqual(strictStopEvents, ['kill:7001', 'check:7001', 'wait', 'check:'])
await assert.rejects(
  stopPgAdminPidsWithVerification({
    pids: ['7002'],
    kill: async () => {},
    remainingPids: async () => ['7002'],
    wait: async () => {},
    attempts: 1
  }),
  /did not exit/
)
assert.equal(postgresqlPortFromConfig('port = 15432'), 15432)
assert.equal(postgresqlPortFromConfig('port = "15433" # local port'), 15433)
assert.equal(postgresqlPortFromConfig("port = '15434'"), 15434)
assert.equal(postgresqlPortFromConfig('port = 0'), 5432)
assert.equal(postgresqlPortFromConfig('port = 65535'), 65535)
assert.equal(postgresqlPortFromConfig('port = invalid'), 5432)
assert.equal(postgresqlPortFromConfig('# port = 15432'), 5432)

const servers = JSON.parse(pgAdminServersContent(15432))
assert.deepEqual(servers, {
  Servers: {
    1: {
      Name: 'FlyEnv PostgreSQL',
      Group: 'Servers',
      Host: '127.0.0.1',
      Port: 15432,
      MaintenanceDB: 'postgres',
      Username: 'root',
      SSLMode: 'prefer'
    }
  }
})
assert.equal('Password' in servers.Servers[1], false)
assert.throws(
  () => pgAdminServersContent(65535),
  /pgAdmin 4 only supports PostgreSQL registration ports from 1 through 65534/
)

assert.equal(validPgAdminPythonVersion('3.8.18'), false)
assert.equal(validPgAdminPythonVersion('Python 3.9.0'), true)
assert.equal(validPgAdminPythonVersion('3.13.1'), true)
assert.equal(validPgAdminPythonVersion('not a version'), false)
assert.equal(validPgAdminPythonVersion(null), false)

await assert.rejects(
  findPgAdminPort(65536),
  /No pgAdmin 4 loopback port is available between 65536 and 65535/
)

const maxPort = PGADMIN4_MAX_PORT
const maxPortServer = createServer()
const maxPortAvailable = await new Promise<boolean>((resolve) => {
  maxPortServer.once('error', () => resolve(false))
  maxPortServer.listen({ host: '127.0.0.1', port: maxPort }, () => resolve(true))
})
if (maxPortAvailable) {
  try {
    await assert.rejects(
      findPgAdminPort(maxPort),
      /No pgAdmin 4 loopback port is available between 65535 and 65535/
    )
  } finally {
    maxPortServer.close()
    await once(maxPortServer, 'close')
  }
}

const occupied = createServer()
occupied.listen({ host: '127.0.0.1', port: 0 })
await once(occupied, 'listening')
const address = occupied.address()
assert.ok(address && typeof address !== 'string')
try {
  const selectedPort = await findPgAdminPort(address.port)
  assert.ok(selectedPort > address.port)
  assert.ok(selectedPort <= address.port + 20)
} finally {
  occupied.close()
  await once(occupied, 'close')
}

const postgresqlSource = readFileSync(
  join(process.cwd(), 'src', 'fork', 'module', 'Postgresql', 'index.ts'),
  'utf-8'
)
const pgAdminSource = readFileSync(
  join(process.cwd(), 'src', 'fork', 'module', 'Postgresql', 'pgAdmin.ts'),
  'utf-8'
)
const openPgAdminSource = postgresqlSource.slice(
  postgresqlSource.indexOf('private openPGAdminInternal'),
  postgresqlSource.indexOf('  _stopServer(')
)

assert.doesNotMatch(pgAdminSource, /PgAdminCredentials|validPgAdminCredentials/)
assert.match(
  postgresqlSource,
  /pgAdminInitializationState\(\s*paths,\s*existsSync,\s*\(file\) =>\s*readFile\(file, 'utf-8'\)\s*\)/s
)
assert.match(
  postgresqlSource,
  /openPGAdmin\(\s*version: SoftInstalled,\s*dataDir: string,\s*python: SoftInstalled\s*\)/s
)
assert.doesNotMatch(postgresqlSource, /pgAdminStatus\(/)
assert.match(postgresqlSource, /new PgAdminSingleFlight/)
assert.match(postgresqlSource, /writeFile\(paths\.initialized, '1'\)/)
assert.match(postgresqlSource, /pgAdminDesktopInitializationVerificationContent/)
assert.match(postgresqlSource, /pgAdminDesktopServerIdentityContent/)
assert.match(postgresqlSource, /parsePgAdminServerIdentity/)
assert.match(postgresqlSource, /pgAdminDesktopServerReconciliationContent/)
assert.match(postgresqlSource, /probe: \(\) => string = pgAdminPackageRootProbe/)
assert.doesNotMatch(postgresqlSource, /import os, pgadmin/)
assert.match(
  postgresqlSource,
  /writeFile\(\s*paths\.verification,\s*pgAdminDesktopInitializationVerificationContent\(\)\s*\)/s
)
assert.match(postgresqlSource, /completePgAdminInitialization\(/)
assert.match(postgresqlSource, /startPgAdminWithPortRetry/)
assert.match(postgresqlSource, /verifyPgAdminPidPersistence/)
assert.match(postgresqlSource, /pgAdminOwnedPids/)
assert.match(postgresqlSource, /validPgAdminPythonVersion\(python\.version\)/)
assert.match(postgresqlSource, /assertPgAdminRegistrationPort\(postgreSqlPort\)/)
assert.match(postgresqlSource, /postgresqlPortFromConfig/)
assert.match(
  postgresqlSource,
  /spawnPromiseWithEnv\(python\.bin, \['-m', 'venv', paths\.venv\], \{[\s\S]*?shell: false/
)
assert.match(postgresqlSource, /PGADMIN4_PACKAGE/)
assert.match(postgresqlSource, /'--upgrade', PGADMIN4_PACKAGE/)
assert.match(postgresqlSource, /let packageRepaired = false/)
assert.match(postgresqlSource, /packageRepaired = true/)
assert.match(
  postgresqlSource,
  /if \(packageRepaired\) \{\s*await this\._stopPGAdmin\(packageRoot\)\s*\}/s
)
assert.match(postgresqlSource, /setup\.py/)
assert.match(postgresqlSource, /setup-db/)
assert.match(postgresqlSource, /pgAdminDesktopBootstrapContent\(\)/)
assert.match(postgresqlSource, /load-servers/)
assert.match(postgresqlSource, /findPgAdminPort\(/)
assert.match(postgresqlSource, /ProcessKillStrict/)
assert.match(postgresqlSource, /ProcessPidListStrict/)
assert.match(postgresqlSource, /pgAdminCommandOwned\(command, paths, packageRoot, isWindows\(\)\)/)
assert.doesNotMatch(postgresqlSource, /await ProcessPidList\(\)/)
assert.match(
  postgresqlSource,
  /isWindows\(\) \? await ProcessPidListStrict\(\) : await ProcessListFetch\(\)/
)
assert.match(postgresqlSource, /fetchLoopbackListeningPids/)
assert.doesNotMatch(postgresqlSource, /fetchProcessPidByPort/)
assert.doesNotMatch(postgresqlSource, /fetchProcessPidByPortWindows/)
assert.match(postgresqlSource, /readFile\(paths\.port, 'utf-8'\)/)
assert.match(postgresqlSource, /writeFile\(paths\.port, `\$\{port\}`\)/)
assert.match(postgresqlSource, /isHealthy: async \(port, started\) =>/)
assert.match(postgresqlSource, /pgAdminHttpReachable\(port\)/)
assert.match(postgresqlSource, /if \(!runningPid && existsSync\(paths\.port\)\)/)
assert.match(postgresqlSource, /serviceStartSpawn\([\s\S]*?bin: paths\.python/)
assert.match(postgresqlSource, /_stopPGAdmin\(/)
assert.match(postgresqlSource, /pgAdminPackageRootUnversionedProbe/)
assert.match(postgresqlSource, /pgAdminOwnedPidsWithoutPackageMetadata/)
assert.match(postgresqlSource, /pgAdminFallbackOwnedProcessPids/)
assert.match(postgresqlSource, /pgAdminPrivateDirectories/)
assert.match(postgresqlSource, /chmod\(directory, 0o700\)/)
assert.match(postgresqlSource, /pgAdminPaths\(global\.Server\.PostgreSqlDir!, isWindows\(\)\)/)
assert.match(
  postgresqlSource,
  /writeFile\(paths\.identityScript, pgAdminDesktopServerIdentityContent\(\)\)/
)
assert.match(postgresqlSource, /writeFile\(paths\.identity, JSON\.stringify\(serverIdentity\)\)/)
assert.match(
  postgresqlSource,
  /spawnPromiseWithEnv\(\s*paths\.python,\s*\[join\(packageRoot, 'setup\.py'\), 'setup-db'\],\s*\{\s*shell: false\s*\}\s*\)/s
)
assert.ok(postgresqlSource.indexOf("'setup-db'") < postgresqlSource.indexOf('paths.bootstrap'))
assert.match(postgresqlSource, /writeFile\(paths\.bootstrap, pgAdminDesktopBootstrapContent\(\)\)/)
assert.match(
  postgresqlSource,
  /spawnPromiseWithEnv\(\s*paths\.python,\s*\[paths\.bootstrap, packageRoot\],\s*\{\s*shell: false,\s*cwd: packageRoot\s*\}\s*\)/s
)
assert.match(
  postgresqlSource,
  /spawnPromiseWithEnv\(\s*paths\.python,\s*\[paths\.bootstrap, packageRoot, `\$\{postgreSqlPort\}`\],\s*\{\s*shell: false, cwd: packageRoot\s*\}\s*\)/s
)
assert.match(
  postgresqlSource,
  /spawnPromiseWithEnv\(\s*paths\.python,\s*\[paths\.verification, packageRoot, `\$\{postgreSqlPort\}`\],\s*\{ shell: false, cwd: packageRoot \}\s*\)/s
)
const verificationSourceIndex = postgresqlSource.indexOf('paths.verification, packageRoot')
const identityWriteIndex = postgresqlSource.indexOf(
  'writeFile(paths.identity, JSON.stringify(serverIdentity))'
)
const desktopModeWriteIndex = postgresqlSource.indexOf("writeFile(paths.desktopMode, '1')")
const initializedWriteIndex = postgresqlSource.indexOf("writeFile(paths.initialized, '1')")
const completionGateIndex = postgresqlSource.lastIndexOf('completePgAdminInitialization')
assert.notEqual(verificationSourceIndex, -1)
assert.notEqual(identityWriteIndex, -1)
assert.notEqual(desktopModeWriteIndex, -1)
assert.notEqual(initializedWriteIndex, -1)
assert.notEqual(completionGateIndex, -1)
assert.ok(verificationSourceIndex < identityWriteIndex)
assert.ok(identityWriteIndex < desktopModeWriteIndex)
assert.ok(desktopModeWriteIndex < initializedWriteIndex)
assert.ok(postgresqlSource.indexOf("'load-servers'") < verificationSourceIndex)
const parsedPostgreSqlPortIndex = postgresqlSource.indexOf(
  'const postgreSqlPort = postgresqlPortFromConfig('
)
const registrationPortValidationIndex = postgresqlSource.indexOf(
  'assertPgAdminRegistrationPort(postgreSqlPort)'
)
const virtualEnvironmentIndex = postgresqlSource.indexOf("['-m', 'venv', paths.venv]")
assert.ok(parsedPostgreSqlPortIndex < registrationPortValidationIndex)
assert.ok(registrationPortValidationIndex < virtualEnvironmentIndex)
assert.match(
  postgresqlSource,
  /const postgreSqlPort = postgresqlPortFromConfig\(\s*await readFile\(join\(dataDir, 'postgresql\.conf'\), 'utf-8'\)\s*\)/s
)
assert.doesNotMatch(openPgAdminSource, /postmaster\.pid|ProcessPidListStrict|ProcessListFetch/)
const healthCheckIndex = postgresqlSource.indexOf('isHealthy: async (port, started) =>')
const persistPortIndex = postgresqlSource.indexOf('persistPort: async (port) =>')
assert.ok(healthCheckIndex < persistPortIndex)
const packageRepairStopIndex = postgresqlSource.indexOf('if (packageRepaired) {')
const runningPidIndex = postgresqlSource.indexOf(
  'const runningPid = await this.pgAdminRunningPid(packageRoot)'
)
const reconciliationBeforeReuseIndex = postgresqlSource.indexOf('await reconcilePgAdminServer()')
assert.ok(packageRepairStopIndex < runningPidIndex)
assert.ok(reconciliationBeforeReuseIndex < runningPidIndex)
assert.match(
  postgresqlSource,
  /\[\s*paths\.reconciliation,\s*packageRoot,\s*`\$\{serverIdentity\.userId\}`,\s*`\$\{serverIdentity\.serverId\}`,\s*`\$\{postgreSqlPort\}`\s*\]/s
)
assert.doesNotMatch(
  postgresqlSource,
  /PgAdminCredentials|validPgAdminCredentials|credentials|PGADMIN_SETUP|pgAdminBootstrapContent\(|pgAdminInitializationVerificationContent\(|pgAdminServerIdentityContent\(|pgAdminServerReconciliationContent\(/
)
assert.doesNotMatch(
  postgresqlSource,
  /\[\s*join\(packageRoot, 'setup\.py'\),\s*'load-servers',\s*paths\.servers,\s*'--user'/s
)
assert.doesNotMatch(postgresqlSource, /remove\(paths\.(?:root|data|log)\)/)
const packageRepairIndex = postgresqlSource.indexOf("['-m', 'pip', 'install'")
assert.ok(postgresqlSource.indexOf('await this._stopPGAdmin()', 0) < packageRepairIndex)
const serviceStartIndex = postgresqlSource.indexOf('started = await serviceStartSpawn')
const serviceStartEndIndex = postgresqlSource.indexOf('cleanupStartFailure:', serviceStartIndex)
assert.notEqual(serviceStartIndex, -1)
assert.notEqual(serviceStartEndIndex, -1)
const serviceStartSource = postgresqlSource.slice(serviceStartIndex, serviceStartEndIndex)
assert.doesNotMatch(serviceStartSource, /PGADMIN_SETUP_EMAIL|PGADMIN_SETUP_PASSWORD/)
assert.match(serviceStartSource, /await verifyPgAdminPidPersistence/)
assert.match(serviceStartSource, /await this\._stopPGAdmin\(packageRoot\)/)
assert.match(postgresqlSource, /paths\.log/)
const postgreSqlStartIndex = postgresqlSource.indexOf('  _startServer(')
const postgreSqlStartSource = postgresqlSource.slice(postgreSqlStartIndex)
const windowsPostgreSqlStart = postgreSqlStartSource.slice(
  postgreSqlStartSource.indexOf('if (isWindows())'),
  postgreSqlStartSource.indexOf('} else {')
)
const unixPostgreSqlStart = postgreSqlStartSource.slice(postgreSqlStartSource.indexOf('} else {'))
assert.match(windowsPostgreSqlStart, /const appPidFile = this\.appPidFile\(\)/)
assert.match(windowsPostgreSqlStart, /pidPath: appPidFile/)
assert.match(windowsPostgreSqlStart, /checkPidFile: false/)
assert.match(
  windowsPostgreSqlStart,
  /const readPostmasterPid = async \(attempt = 0\): Promise<string> =>/
)
assert.match(windowsPostgreSqlStart, /pid = await this\.readPidFromFile\(pidFile\)/)
assert.match(windowsPostgreSqlStart, /await waitTime\(500\)/)
assert.match(windowsPostgreSqlStart, /const pid = await readPostmasterPid\(\)/)
assert.doesNotMatch(windowsPostgreSqlStart, /pidPath: pidFile/)
assert.doesNotMatch(unixPostgreSqlStart, /pidPath: pidFile/)

const postgreSqlRendererSource = readFileSync(
  join(process.cwd(), 'src', 'render', 'components', 'PostgreSql', 'Index.vue'),
  'utf-8'
)
const postgreSqlSetupSource = readFileSync(
  join(process.cwd(), 'src', 'render', 'components', 'PostgreSql', 'setup.ts'),
  'utf-8'
)
const forkSource = readFileSync(join(process.cwd(), 'src', 'fork', 'index.ts'), 'utf-8')
const pgAdminIntegrationSource = readFileSync(
  join(process.cwd(), 'scripts', 'postgresql-pgadmin4-integration-test.ts'),
  'utf-8'
)

assert.equal(
  existsSync(join(process.cwd(), 'src', 'render', 'components', 'PostgreSql', 'PgAdminSetup.vue')),
  false
)
assert.doesNotMatch(pgAdminSource, /PgAdminCredentials|validPgAdminCredentials|PGADMIN_SETUP/)
assert.doesNotMatch(
  [pgAdminSource, postgresqlSource, postgreSqlRendererSource].join('\n'),
  /PgAdminSetup|pgAdminStatus|PgAdminCredentials|PGADMIN_SETUP|sendSensitive|credentials/
)

assert.match(postgreSqlRendererSource, /v-if="isRunning"/)
assert.match(postgreSqlRendererSource, /:disabled="pgAdminOpening \|\| !pgAdminDataDirReady"/)
assert.match(postgreSqlRendererSource, /@click\.stop="openPGAdmin"/)
assert.doesNotMatch(
  postgreSqlRendererSource,
  /PgAdminSetup|pgAdminSetup|PgAdminCredentials|pgAdminStatus|preparePGAdmin|sendSensitive|credentials/
)
assert.match(
  postgreSqlRendererSource,
  /module\('postgresql'\)\.installed\.find\(\(item\) => item\.run\)/
)
assert.match(postgreSqlRendererSource, /`postgresql\$\{versionTop\}`/)
assert.match(postgreSqlRendererSource, /const runningDataDir = ref\(''\)/)
assert.doesNotMatch(postgreSqlRendererSource, /const runningDataDir = computed/)
assert.match(
  postgreSqlRendererSource,
  /const updateRunningDataDir = \(version: typeof runningVersion\.value\) => \{[\s\S]*?runningDataDir\.value =\s*PostgreSqlSetup\.dir\[version\.bin\]/
)
assert.match(postgreSqlRendererSource, /watch\(runningVersion, updateRunningDataDir/)
assert.match(postgreSqlRendererSource, /const refreshRunningDataDir = \(\) => updateRunningDataDir/)
assert.match(postgreSqlRendererSource, /const pgAdminDataDirReady = ref\(false\)/)
assert.match(
  postgreSqlRendererSource,
  /PostgreSqlSetup\.init\(\)\s*\.then\(\(\) => \{[\s\S]*?refreshRunningDataDir\(\)[\s\S]*?pgAdminDataDirReady\.value = true/s
)
assert.match(
  postgreSqlRendererSource,
  /!pgAdminDataDirReady\.value\s*\|\|\s*!selectedPythonAvailable\(\)/
)
assert.match(
  postgreSqlRendererSource,
  /const chooseDir = \(\) => \{\s*if \(isRunning\.value\) \{\s*return/s
)
assert.match(
  postgreSqlRendererSource,
  /set\(v: string\) \{\s*if \(isRunning\.value \|\| !currentVersion\?\.value\?\.bin\) \{/s
)
assert.match(postgreSqlRendererSource, /MessageError\(I18nT\('base\.needSelectVersion'\)\)/)
assert.match(
  postgreSqlRendererSource,
  /const pgAdminVersion = JSON\.parse\(JSON\.stringify\(runningVersion\.value\)\)/
)
assert.match(
  postgreSqlRendererSource,
  /const pgAdminPython = JSON\.parse\(JSON\.stringify\(selectedPython\)\)/
)
assert.match(
  postgreSqlRendererSource,
  /IPC\.send\(\s*'app-fork:postgresql',\s*'openPGAdmin',\s*pgAdminVersion,\s*runningDataDir\.value,\s*pgAdminPython\s*\)/s
)
assert.match(postgreSqlRendererSource, /if \(res\?\.code === 200\) \{\s*return\s*\}/s)
assert.match(postgreSqlRendererSource, /IPC\.off\(key\)/)
assert.match(postgreSqlRendererSource, /pgAdminOpening\.value = false/)
assert.match(postgreSqlRendererSource, /res\?\.code === 0 && res\.data\?\.url/)
assert.match(postgreSqlRendererSource, /shell\.openExternal\(res\.data\.url\)/)
assert.doesNotMatch(postgreSqlRendererSource, /localForage|localStorage|sessionStorage/)

assert.match(postgreSqlSetupSource, /let initPromise: Promise<void> \| undefined/)
assert.match(postgreSqlSetupSource, /if \(initPromise\) \{\s*return initPromise\s*\}/s)
assert.match(
  postgreSqlSetupSource,
  /initPromise = localForage[\s\S]*?getItem[\s\S]*?return initPromise/s
)
assert.doesNotMatch(forkSource, /sanitizeForkExecArgs|\[REDACTED\]|fn !== 'openPGAdmin'/)
assert.match(forkSource, /const logArgs = Array\.isArray\(args\) \? args\.slice\(3\) : args/)
assert.match(forkSource, /args: logArgs,\s*error/)
assert.doesNotMatch(forkSource, /args,\s*error\s*\}\)\}/)
assert.match(pgAdminIntegrationSource, /pgAdminDesktopBootstrapContent/)
assert.match(pgAdminIntegrationSource, /pgAdminDesktopInitializationVerificationContent/)
assert.match(pgAdminIntegrationSource, /pgAdminDesktopServerIdentityContent/)
assert.match(pgAdminIntegrationSource, /pgAdminDesktopServerReconciliationContent/)
assert.match(pgAdminIntegrationSource, /test_client\(\)/)
assert.doesNotMatch(
  pgAdminIntegrationSource,
  /PGADMIN_SETUP|--user|pgAdminBootstrapContent|pgAdminInitializationVerificationContent|pgAdminServerIdentityContent|pgAdminServerReconciliationContent|setupEmail|setupPassword/
)

console.log('PostgreSQL pgAdmin 4 runtime contract test passed')
