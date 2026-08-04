import assert from 'node:assert/strict'
import { createServer } from 'node:net'
import { once } from 'node:events'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  completePgAdminInitialization,
  findPgAdminPort,
  PGADMIN4_DEFAULT_PORT,
  PGADMIN4_MAX_PORT,
  PGADMIN4_MAX_SERVER_PORT,
  PGADMIN4_PACKAGE,
  PGADMIN4_PORT_SCAN_COUNT,
  PgAdminSingleFlight,
  pgAdminBootstrapContent,
  pgAdminCommandOwned,
  pgAdminConfigContent,
  pgAdminInitializationVerificationContent,
  pgAdminInitialized,
  pgAdminOwnedPids,
  pgAdminPackageRootProbe,
  pgAdminPaths,
  pgAdminServersContent,
  pgAdminUrl,
  postgresqlPortFromPostmasterPid,
  postgresqlPortFromConfig,
  assertPgAdminRegistrationPort,
  startPgAdminWithPortRetry,
  validPgAdminCredentials,
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
  initialized: join(postgreSqlDir, 'pgadmin4', 'initialized'),
  venv: join(postgreSqlDir, 'pgadmin4', 'venv'),
  python: join(postgreSqlDir, 'pgadmin4', 'venv', 'bin', 'python')
})
assert.equal(
  pgAdminPaths(postgreSqlDir, true).python,
  join(postgreSqlDir, 'pgadmin4', 'venv', 'Scripts', 'python.exe')
)

const initializationFiles = new Set([join(unixPaths.data, 'pgadmin4.db')])
assert.equal(
  pgAdminInitialized(unixPaths, (file) => initializationFiles.has(file)),
  false
)
initializationFiles.add(unixPaths.initialized)
assert.equal(
  pgAdminInitialized(unixPaths, (file) => initializationFiles.has(file)),
  true
)

const configDataDir = '/tmp/FlyEnv data'
const configLogDir = '/tmp/FlyEnv logs'
const config = pgAdminConfigContent(configDataDir, configLogDir, 5051)
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

const bootstrap = pgAdminBootstrapContent()
assert.match(bootstrap, /import os/)
assert.match(bootstrap, /package_root = sys\.argv\[1\]/)
assert.match(bootstrap, /sys\.path\.insert\(0, package_root\)/)
assert.match(bootstrap, /email = sys\.argv\[2\]/)
assert.match(bootstrap, /password = os\.environ\.get\('PGADMIN_SETUP_PASSWORD'\)/)
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
assert.match(bootstrap, /if not password:/)
assert.match(bootstrap, /raise RuntimeError\('pgAdmin administrator credentials are required'\)/)
assert.match(bootstrap, /'role': administrator_role\.id/)
assert.match(bootstrap, /'newPassword': password/)
assert.match(bootstrap, /raise RuntimeError\('pgAdmin administrator creation failed'\)/)
assert.doesNotMatch(bootstrap, /str\(error\)/)
assert.match(bootstrap, /postgresql_port = int\(sys\.argv\[3\]\) if len\(sys\.argv\) > 3 else None/)
assert.match(bootstrap, /if postgresql_port is not None:/)
assert.match(bootstrap, /server\.save_password = 0/)
assert.match(bootstrap, /db\.session\.commit\(\)/)
assert.doesNotMatch(bootstrap, /PGADMIN_SETUP_EMAIL/)

const initializationVerification = pgAdminInitializationVerificationContent()
assert.match(initializationVerification, /from pgadmin import create_app/)
assert.match(initializationVerification, /from pgadmin\.model import Server, User/)
assert.match(initializationVerification, /email = sys\.argv\[2\]/)
assert.match(initializationVerification, /postgresql_port = int\(sys\.argv\[3\]\)/)
assert.match(
  initializationVerification,
  /User\.query\.filter_by\(username=email, auth_source=INTERNAL\)\.first\(\)/
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
assert.match(initializationVerification, /save_password=0/)
assert.match(initializationVerification, /if server is None or server\.password:/)
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
assert.doesNotMatch(initializationVerification, /PGADMIN_SETUP_PASSWORD/)

const packageRootProbe = pgAdminPackageRootProbe()
assert.match(packageRootProbe, /from importlib\.metadata import distribution/)
assert.match(packageRootProbe, /d = distribution\('pgadmin4'\)/)
assert.match(packageRootProbe, /d\.version == '9\.17'/)
assert.match(packageRootProbe, /d\.locate_file\('pgadmin4'\)/)
assert.doesNotMatch(packageRootProbe, /import pgadmin/)

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

assert.equal(
  pgAdminCommandOwned(
    `${unixPaths.python} ${join(packageRoot, 'pgAdmin4.py')}`,
    unixPaths,
    packageRoot,
    false
  ),
  true
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

assert.equal(
  postgresqlPortFromPostmasterPid('12345\n/data/flyenv/postgresql\n1710000000\n15432\n'),
  15432
)
assert.equal(
  postgresqlPortFromPostmasterPid('12345\n/data/flyenv/postgresql\n1710000000\n5432\n'),
  5432
)
assert.throws(() => postgresqlPortFromPostmasterPid('12345\n/data\n1710000000\n'), /line 4/)
assert.throws(
  () => postgresqlPortFromPostmasterPid('12345\n/data\n1710000000\ninvalid\n'),
  /line 4/
)
assert.throws(() => postgresqlPortFromPostmasterPid('12345\n/data\n1710000000\n0\n'), /line 4/)
assert.throws(
  () =>
    assertPgAdminRegistrationPort(
      postgresqlPortFromPostmasterPid('12345\n/data\n1710000000\n65535\n')
    ),
  /1 through 65534/
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

assert.equal(validPgAdminCredentials({ email: 'root@example.test', password: 'password' }), true)
assert.equal(validPgAdminCredentials({ email: 'not-an-email', password: 'password' }), false)
assert.equal(validPgAdminCredentials({ email: 'root@example.test', password: 'short' }), false)
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

assert.match(postgresqlSource, /pgAdminStatus\(\): ForkPromise<\{ initialized: boolean \}>/)
assert.match(postgresqlSource, /openPGAdmin\([\s\S]*?credentials\?: PgAdminCredentials/)
assert.match(postgresqlSource, /new PgAdminSingleFlight/)
assert.match(postgresqlSource, /pgAdminInitialized\(paths, existsSync\)/)
assert.match(postgresqlSource, /writeFile\(paths\.initialized, '1'\)/)
assert.match(postgresqlSource, /pgAdminInitializationVerificationContent/)
assert.match(postgresqlSource, /pgAdminPackageRootProbe\(\)/)
assert.doesNotMatch(postgresqlSource, /import os, pgadmin/)
assert.match(
  postgresqlSource,
  /writeFile\(\s*paths\.verification,\s*pgAdminInitializationVerificationContent\(\)\s*\)/s
)
assert.match(postgresqlSource, /completePgAdminInitialization\(/)
assert.match(postgresqlSource, /startPgAdminWithPortRetry/)
assert.match(postgresqlSource, /verifyPgAdminPidPersistence/)
assert.match(postgresqlSource, /pgAdminOwnedPids/)
assert.match(postgresqlSource, /validPgAdminCredentials\(credentials\)/)
assert.match(postgresqlSource, /validPgAdminPythonVersion\(python\.version\)/)
assert.match(postgresqlSource, /assertPgAdminRegistrationPort\(postgreSqlPort\)/)
assert.match(postgresqlSource, /postgresqlPortFromPostmasterPid/)
assert.match(
  postgresqlSource,
  /spawnPromiseWithEnv\(python\.bin, \['-m', 'venv', paths\.venv\], \{[\s\S]*?shell: false/
)
assert.match(postgresqlSource, /PGADMIN4_PACKAGE/)
assert.match(postgresqlSource, /'--upgrade', PGADMIN4_PACKAGE/)
assert.match(postgresqlSource, /setup\.py/)
assert.match(postgresqlSource, /setup-db/)
assert.match(postgresqlSource, /pgAdminBootstrapContent\(\)/)
assert.match(postgresqlSource, /load-servers/)
assert.match(postgresqlSource, /findPgAdminPort\(/)
assert.match(postgresqlSource, /ProcessKill\('-INT', pids\)/)
assert.match(postgresqlSource, /pgAdminCommandOwned\(command, paths, packageRoot, isWindows\(\)\)/)
assert.match(
  postgresqlSource,
  /isWindows\(\) \? await ProcessPidList\(\) : await ProcessListFetch\(\)/
)
assert.match(postgresqlSource, /fetchProcessPidByPort/)
assert.match(postgresqlSource, /fetchProcessPidByPortWindows/)
assert.match(postgresqlSource, /readFile\(paths\.port, 'utf-8'\)/)
assert.match(postgresqlSource, /writeFile\(paths\.port, `\$\{port\}`\)/)
assert.match(postgresqlSource, /isHealthy: async \(port, started\) =>/)
assert.match(postgresqlSource, /pgAdminHttpReachable\(port\)/)
assert.match(postgresqlSource, /if \(!runningPid && existsSync\(paths\.port\)\)/)
assert.match(postgresqlSource, /serviceStartSpawn\([\s\S]*?bin: paths\.python/)
assert.match(postgresqlSource, /_stopPGAdmin\(/)
assert.match(postgresqlSource, /pgAdminPaths\(global\.Server\.PostgreSqlDir!, isWindows\(\)\)/)
assert.match(
  postgresqlSource,
  /spawnPromiseWithEnv\(\s*paths\.python,\s*\[join\(packageRoot, 'setup\.py'\), 'setup-db'\],\s*\{[\s\S]*?env:\s*\{[\s\S]*?PGADMIN_SETUP_EMAIL:\s*admin\.email,[\s\S]*?PGADMIN_SETUP_PASSWORD:\s*admin\.password[\s\S]*?shell: false[\s\S]*?\}\s*\)/s
)
assert.ok(postgresqlSource.indexOf("'setup-db'") < postgresqlSource.indexOf('paths.bootstrap'))
assert.match(postgresqlSource, /writeFile\(paths\.bootstrap, pgAdminBootstrapContent\(\)\)/)
assert.match(
  postgresqlSource,
  /spawnPromiseWithEnv\(\s*paths\.python,\s*\[paths\.bootstrap, packageRoot, admin\.email\],\s*\{[\s\S]*?env:\s*\{\s*PGADMIN_SETUP_PASSWORD:\s*admin\.password\s*\}[\s\S]*?shell: false,[\s\S]*?cwd: packageRoot[\s\S]*?\}\s*\)/s
)
assert.match(
  postgresqlSource,
  /spawnPromiseWithEnv\(\s*paths\.python,\s*\[paths\.bootstrap, packageRoot, admin\.email, `\$\{postgreSqlPort\}`\],\s*\{\s*shell: false, cwd: packageRoot\s*\}\s*\)/s
)
assert.ok(
  postgresqlSource.indexOf("'load-servers'") <
    postgresqlSource.lastIndexOf('admin.email, `${postgreSqlPort}`')
)
assert.match(
  postgresqlSource,
  /spawnPromiseWithEnv\(\s*paths\.python,\s*\[paths\.verification, packageRoot, admin\.email, `\$\{postgreSqlPort\}`\],\s*\{ shell: false, cwd: packageRoot \}\s*\)/s
)
const verificationSourceIndex = postgresqlSource.indexOf('paths.verification, packageRoot')
const completionGateIndex = postgresqlSource.lastIndexOf('completePgAdminInitialization')
assert.notEqual(verificationSourceIndex, -1)
assert.notEqual(completionGateIndex, -1)
assert.doesNotMatch(
  postgresqlSource.slice(verificationSourceIndex, completionGateIndex),
  /PGADMIN_SETUP_EMAIL|PGADMIN_SETUP_PASSWORD/
)
assert.ok(postgresqlSource.indexOf("'load-servers'") < completionGateIndex)
const parsedPostgreSqlPortIndex = postgresqlSource.indexOf(
  'const postgreSqlPort = postgresqlPortFromPostmasterPid'
)
const registrationPortValidationIndex = postgresqlSource.indexOf(
  'assertPgAdminRegistrationPort(postgreSqlPort)'
)
const virtualEnvironmentIndex = postgresqlSource.indexOf("['-m', 'venv', paths.venv]")
assert.ok(parsedPostgreSqlPortIndex < registrationPortValidationIndex)
assert.ok(registrationPortValidationIndex < virtualEnvironmentIndex)
assert.doesNotMatch(
  postgresqlSource.slice(parsedPostgreSqlPortIndex, virtualEnvironmentIndex),
  /postgresqlPortFromConfig/
)
assert.notEqual(
  postgresqlPortFromPostmasterPid('12345\n/data\n1710000000\n15432\n'),
  postgresqlPortFromConfig('port = 5432')
)
const healthCheckIndex = postgresqlSource.indexOf('isHealthy: async (port, started) =>')
const persistPortIndex = postgresqlSource.indexOf('persistPort: async (port) =>')
assert.ok(healthCheckIndex < persistPortIndex)
const serviceStartIndex = postgresqlSource.indexOf('started = await serviceStartSpawn')
const serviceStartEndIndex = postgresqlSource.indexOf('const startedPid', serviceStartIndex)
assert.notEqual(serviceStartIndex, -1)
assert.notEqual(serviceStartEndIndex, -1)
const serviceStartSource = postgresqlSource.slice(serviceStartIndex, serviceStartEndIndex)
assert.doesNotMatch(serviceStartSource, /PGADMIN_SETUP_EMAIL|PGADMIN_SETUP_PASSWORD/)
assert.match(postgresqlSource, /paths\.log/)

console.log('PostgreSQL pgAdmin 4 runtime contract test passed')
