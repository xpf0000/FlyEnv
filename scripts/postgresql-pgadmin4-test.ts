import assert from 'node:assert/strict'
import { createServer } from 'node:net'
import { once } from 'node:events'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  findPgAdminPort,
  PGADMIN4_DEFAULT_PORT,
  PGADMIN4_MAX_PORT,
  PGADMIN4_PACKAGE,
  PGADMIN4_PORT_SCAN_COUNT,
  pgAdminConfigContent,
  pgAdminPaths,
  pgAdminServersContent,
  pgAdminUrl,
  postgresqlPortFromConfig,
  validPgAdminCredentials,
  validPgAdminPythonVersion
} from '../src/fork/module/Postgresql/pgAdmin'

assert.equal(PGADMIN4_DEFAULT_PORT, 5050)
assert.equal(PGADMIN4_MAX_PORT, 65535)
assert.equal(PGADMIN4_PORT_SCAN_COUNT, 21)
assert.equal(PGADMIN4_PACKAGE, 'pgadmin4==9.17')
assert.equal(pgAdminUrl(5051), 'http://127.0.0.1:5051')

const postgreSqlDir = join('/tmp', 'flyenv-postgresql')
const unixPaths = pgAdminPaths(postgreSqlDir, false)
assert.deepEqual(unixPaths, {
  root: join(postgreSqlDir, 'pgadmin4'),
  data: join(postgreSqlDir, 'pgadmin4', 'data'),
  log: join(postgreSqlDir, 'pgadmin4', 'pgadmin4.log'),
  pid: join(postgreSqlDir, 'pgadmin4', 'pgadmin4.pid'),
  port: join(postgreSqlDir, 'pgadmin4', 'pgadmin4.port'),
  servers: join(postgreSqlDir, 'pgadmin4', 'servers.json'),
  venv: join(postgreSqlDir, 'pgadmin4', 'venv'),
  python: join(postgreSqlDir, 'pgadmin4', 'venv', 'bin', 'python')
})
assert.equal(
  pgAdminPaths(postgreSqlDir, true).python,
  join(postgreSqlDir, 'pgadmin4', 'venv', 'Scripts', 'python.exe')
)

assert.equal(
  pgAdminConfigContent('/tmp/FlyEnv data', 5051),
  'DEFAULT_SERVER = "127.0.0.1"\nDEFAULT_SERVER_PORT = 5051\nDATA_DIR = "/tmp/FlyEnv data"\n'
)
assert.equal(postgresqlPortFromConfig('port = 15432'), 15432)
assert.equal(postgresqlPortFromConfig('port = "15433" # local port'), 15433)
assert.equal(postgresqlPortFromConfig("port = '15434'"), 15434)
assert.equal(postgresqlPortFromConfig('port = 0'), 5432)
assert.equal(postgresqlPortFromConfig('port = invalid'), 5432)
assert.equal(postgresqlPortFromConfig('# port = 15432'), 5432)

const servers = JSON.parse(pgAdminServersContent(15432))
assert.deepEqual(servers, {
  Servers: {
    1: {
      Name: 'FlyEnv PostgreSQL',
      Host: '127.0.0.1',
      Port: 15432,
      MaintenanceDB: 'postgres',
      Username: 'root',
      SSLMode: 'prefer'
    }
  }
})
assert.equal('Password' in servers.Servers[1], false)

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
assert.match(postgresqlSource, /validPgAdminCredentials\(credentials\)/)
assert.match(postgresqlSource, /validPgAdminPythonVersion\(python\.version\)/)
assert.match(
  postgresqlSource,
  /spawnPromiseWithEnv\(python\.bin, \['-m', 'venv', paths\.venv\], \{[\s\S]*?shell: false/
)
assert.match(postgresqlSource, /PGADMIN4_PACKAGE/)
assert.match(postgresqlSource, /setup\.py/)
assert.match(postgresqlSource, /setup-db/)
assert.match(postgresqlSource, /load-servers/)
assert.match(postgresqlSource, /findPgAdminPort\(/)
assert.match(postgresqlSource, /ProcessKill\('-INT', \[pid\]\)/)
assert.match(postgresqlSource, /command\.includes\(paths\.root\)/)
assert.match(postgresqlSource, /readFile\(paths\.port, 'utf-8'\)/)
assert.match(postgresqlSource, /writeFile\(paths\.port, `\$\{port\}`\)/)
assert.match(postgresqlSource, /serviceStartSpawn\([\s\S]*?bin: paths\.python/)
assert.match(postgresqlSource, /_stopPGAdmin\(/)
assert.match(postgresqlSource, /pgAdminPaths\(global\.Server\.PostgreSqlDir!, isWindows\(\)\)/)
assert.equal((postgresqlSource.match(/PGADMIN_SETUP_EMAIL/g) ?? []).length, 1)
assert.equal((postgresqlSource.match(/PGADMIN_SETUP_PASSWORD/g) ?? []).length, 1)
assert.ok(postgresqlSource.indexOf("'config_local.py'") < postgresqlSource.indexOf("'setup-db'"))

console.log('PostgreSQL pgAdmin 4 runtime contract test passed')
