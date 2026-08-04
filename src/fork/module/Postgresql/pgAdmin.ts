import { createServer } from 'node:net'
import { join } from 'node:path'

export const PGADMIN4_PACKAGE = 'pgadmin4==9.17'
export const PGADMIN4_PACKAGE_VERSION = '9.17'
export const PGADMIN4_DEFAULT_PORT = 5050
export const PGADMIN4_MAX_PORT = 65535
export const PGADMIN4_MAX_SERVER_PORT = 65534
export const PGADMIN4_PORT_SCAN_COUNT = 21

export interface PgAdminCredentials {
  email: string
  password: string
}

export interface PgAdminPaths {
  root: string
  data: string
  log: string
  pid: string
  port: string
  servers: string
  bootstrap: string
  verification: string
  reconciliation: string
  initialized: string
  venv: string
  python: string
}

export function pgAdminPaths(postgreSqlDir: string, windows: boolean): PgAdminPaths {
  const root = join(postgreSqlDir, 'pgadmin4')
  const venv = join(root, 'venv')

  return {
    root,
    data: join(root, 'data'),
    log: join(root, 'log'),
    pid: join(root, 'pgadmin4.pid'),
    port: join(root, 'pgadmin4.port'),
    servers: join(root, 'servers.json'),
    bootstrap: join(root, 'bootstrap-admin.py'),
    verification: join(root, 'verify-initialization.py'),
    reconciliation: join(root, 'reconcile-server.py'),
    initialized: join(root, 'initialized'),
    venv,
    python: windows ? join(venv, 'Scripts', 'python.exe') : join(venv, 'bin', 'python')
  }
}

export function pgAdminPrivateDirectories(paths: PgAdminPaths, windows: boolean): string[] {
  return windows ? [] : [paths.root, paths.data, paths.log]
}

export function pgAdminInitialized(
  paths: PgAdminPaths,
  fileExists: (file: string) => boolean
): boolean {
  return fileExists(paths.initialized)
}

export interface PgAdminInitializationOptions {
  verify: () => Promise<void>
  markInitialized: () => Promise<void>
}

export async function completePgAdminInitialization(
  options: PgAdminInitializationOptions
): Promise<void> {
  await options.verify()
  await options.markInitialized()
}

export class PgAdminSingleFlight<T> {
  private inFlight?: Promise<T>

  run(operation: () => PromiseLike<T>): Promise<T> {
    if (this.inFlight) {
      return this.inFlight
    }

    const running = Promise.resolve().then(operation)
    this.inFlight = running
    void running
      .finally(() => {
        if (this.inFlight === running) {
          this.inFlight = undefined
        }
      })
      .catch(() => {})
    return running
  }
}

export interface PgAdminPortStartOptions<T> {
  findPort: (excluded: readonly number[]) => Promise<number>
  writeConfig: (port: number) => Promise<void>
  start: (port: number) => Promise<T>
  cleanupStartFailure?: (port: number, error: unknown) => Promise<void>
  isHealthy: (port: number, result: T) => Promise<boolean>
  persistPort: (port: number) => Promise<void>
  cleanupStarted: (result: T) => Promise<void>
  clearPort: () => Promise<void>
}

export async function startPgAdminWithPortRetry<T>(
  options: PgAdminPortStartOptions<T>
): Promise<{ port: number; result: T }> {
  const attempted: number[] = []
  await options.clearPort()

  try {
    let lastError: unknown
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const port = await options.findPort(attempted)
      if (attempted.includes(port)) {
        throw new Error(`pgAdmin 4 selected port ${port} was already attempted`)
      }
      attempted.push(port)
      await options.writeConfig(port)
      let result: T
      try {
        result = await options.start(port)
      } catch (error) {
        await options.cleanupStartFailure?.(port, error)
        await options.clearPort()
        lastError = error
        continue
      }
      let healthy: boolean
      try {
        healthy = await options.isHealthy(port, result)
      } catch (error) {
        await options.cleanupStarted(result)
        await options.clearPort()
        lastError = error
        continue
      }
      if (!healthy) {
        await options.cleanupStarted(result)
        await options.clearPort()
        lastError = new Error(`pgAdmin 4 did not become healthy on port ${port}`)
        continue
      }
      try {
        await options.persistPort(port)
        return { port, result }
      } catch (error) {
        await options.cleanupStarted(result)
        throw error
      }
    }
    throw lastError ?? new Error('pgAdmin 4 failed to start')
  } catch (error) {
    await options.clearPort()
    throw error
  }
}

export interface PgAdminStrictStopOptions {
  pids: string[]
  kill: (pids: string[]) => Promise<void>
  remainingPids: () => Promise<string[]>
  wait: (milliseconds: number) => Promise<unknown>
  attempts?: number
  intervalMilliseconds?: number
}

export async function stopPgAdminPidsWithVerification(
  options: PgAdminStrictStopOptions
): Promise<void> {
  const pids = Array.from(new Set(options.pids.map((pid) => pid.trim()).filter(Boolean)))
  if (pids.length === 0) return

  await options.kill(pids)
  const attempts = Math.max(1, options.attempts ?? 10)
  const intervalMilliseconds = options.intervalMilliseconds ?? 250
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const remaining = await options.remainingPids()
    if (remaining.length === 0) return
    if (attempt + 1 < attempts) {
      await options.wait(intervalMilliseconds)
    }
  }
  throw new Error(`pgAdmin 4 process did not exit: ${pids.join(', ')}`)
}

export interface PgAdminPidPersistenceOptions {
  spawnedPid: string
  readPersistedPid: () => Promise<string>
  stopPid: (pid: string) => Promise<void>
  clearPid: () => Promise<void>
}

export async function verifyPgAdminPidPersistence(
  options: PgAdminPidPersistenceOptions
): Promise<void> {
  const spawnedPid = options.spawnedPid.trim()
  const persistedPid = (await options.readPersistedPid()).trim()
  if (spawnedPid && persistedPid === spawnedPid) {
    return
  }

  if (spawnedPid) {
    await options.stopPid(spawnedPid)
  }
  await options.clearPid()
  throw new Error('pgAdmin 4 PID file was not persisted for the spawned process')
}

export function pgAdminUrl(port: number): string {
  return `http://127.0.0.1:${port}`
}

export function pgAdminConfigContent(dataDir: string, logDir: string, port: number): string {
  return (
    [
      'DEFAULT_SERVER = "127.0.0.1"',
      `DEFAULT_SERVER_PORT = ${port}`,
      `DATA_DIR = ${JSON.stringify(dataDir)}`,
      `SQLITE_PATH = ${JSON.stringify(join(dataDir, 'pgadmin4.db'))}`,
      `SESSION_DB_PATH = ${JSON.stringify(join(dataDir, 'sessions'))}`,
      `STORAGE_DIR = ${JSON.stringify(join(dataDir, 'storage'))}`,
      `LOG_FILE = ${JSON.stringify(join(logDir, 'pgadmin4.log'))}`,
      `KERBEROS_CCACHE_DIR = ${JSON.stringify(join(dataDir, 'kerberos'))}`,
      `AZURE_CREDENTIAL_CACHE_DIR = ${JSON.stringify(join(dataDir, 'azure'))}`
    ].join('\n') + '\n'
  )
}

export function pgAdminPackageRootProbe(): string {
  return "from importlib.metadata import distribution; d = distribution('pgadmin4'); assert d.version == '9.17'; print(d.locate_file('pgadmin4'))"
}

export function pgAdminPackageRootUnversionedProbe(): string {
  return "from importlib.metadata import distribution; print(distribution('pgadmin4').locate_file('pgadmin4'))"
}

export function pgAdminBootstrapContent(): string {
  return `import os
import sys

package_root = sys.argv[1]
if package_root not in sys.path:
    sys.path.insert(0, package_root)

import config
from pgadmin import create_app
from pgadmin.model import Role, Server, User, db
from pgadmin.tools.user_management import create_user
from pgadmin.utils.constants import INTERNAL

email = sys.argv[2]
password = os.environ.get('PGADMIN_SETUP_PASSWORD')
postgresql_port = int(sys.argv[3]) if len(sys.argv) > 3 else None
app = create_app(config.APP_NAME + '-cli')

with app.test_request_context():
    user = User.query.filter_by(username=email, auth_source=INTERNAL).first()
    administrator_role = Role.query.filter_by(name='Administrator').first()
    if administrator_role is None:
        raise RuntimeError('pgAdmin Administrator role was not found')
    if user is None:
        if not password:
            raise RuntimeError('pgAdmin administrator credentials are required')
        created, _ = create_user(
            {
                'email': email,
                'role': administrator_role.id,
                'active': True,
                'auth_source': INTERNAL,
                'newPassword': password,
                'confirmPassword': password,
            }
        )
        if not created:
            raise RuntimeError('pgAdmin administrator creation failed')
        user = User.query.filter_by(username=email, auth_source=INTERNAL).first()
    if (
        user is None
        or user.email != email
        or not user.active
        or user.auth_source != INTERNAL
        or not any(role.name == 'Administrator' for role in user.roles)
    ):
        raise RuntimeError('pgAdmin administrator verification failed')

    if postgresql_port is not None:
        server = Server.query.filter_by(
            user_id=user.id,
            name='FlyEnv PostgreSQL',
            host='127.0.0.1',
            port=postgresql_port,
            maintenance_db='postgres',
            username='root',
        ).first()
        if server is None:
            raise RuntimeError('pgAdmin server bootstrap failed')
        server.password = None
        server.save_password = 0
        db.session.commit()
`
}

export function pgAdminInitializationVerificationContent(): string {
  return `import sys

package_root = sys.argv[1]
if package_root not in sys.path:
    sys.path.insert(0, package_root)

import config
from pgadmin import create_app
from pgadmin.model import Server, User
from pgadmin.utils.constants import INTERNAL

email = sys.argv[2]
postgresql_port = int(sys.argv[3])
app = create_app(config.APP_NAME + '-cli')

with app.app_context():
    user = User.query.filter_by(username=email, auth_source=INTERNAL).first()
    if (
        user is None
        or user.email != email
        or not user.active
        or user.auth_source != INTERNAL
        or not any(role.name == 'Administrator' for role in user.roles)
    ):
        raise RuntimeError('pgAdmin administrator verification failed')

    server = Server.query.filter_by(
        user_id=user.id,
        name='FlyEnv PostgreSQL',
        host='127.0.0.1',
        port=postgresql_port,
        maintenance_db='postgres',
        username='root',
        save_password=0,
    ).first()
    if server is None or server.password:
        raise RuntimeError('pgAdmin server verification failed')
    if server.servergroup is None or server.servergroup.name != 'Servers':
        raise RuntimeError('pgAdmin server verification failed')
    connection_params = server.connection_params or {}
    if connection_params.get('sslmode') != 'prefer':
        raise RuntimeError('pgAdmin server verification failed')
`
}

export function pgAdminServerReconciliationContent(): string {
  return `import sys

package_root = sys.argv[1]
if package_root not in sys.path:
    sys.path.insert(0, package_root)

import config
from pgadmin import create_app
from pgadmin.model import Server, db

postgresql_port = int(sys.argv[2])
app = create_app(config.APP_NAME + '-cli')

with app.app_context():
    servers = Server.query.filter_by(
        name='FlyEnv PostgreSQL',
        host='127.0.0.1',
        maintenance_db='postgres',
        username='root',
    ).all()
    if not servers:
        raise RuntimeError('pgAdmin FlyEnv PostgreSQL server was not found')
    for server in servers:
        server.port = postgresql_port
        server.password = None
        server.save_password = 0
        connection_params = server.connection_params or {}
        connection_params['sslmode'] = 'prefer'
        server.connection_params = connection_params
    db.session.commit()
`
}

function commandPath(value: string, windows: boolean): string {
  const normalized = value.replace(/\\/g, '/')
  return windows ? normalized.toLowerCase() : normalized
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function commandArgumentPattern(path: string): string {
  const escapedPath = escapeRegExp(path)
  return `(?:${escapedPath}|"${escapedPath}"|'${escapedPath}')`
}

export function pgAdminCommandOwned(
  command: string,
  paths: PgAdminPaths,
  packageRoot: string,
  windows: boolean
): boolean {
  const normalizedCommand = commandPath(command, windows)
  const pythonPath = commandPath(paths.python, windows)
  const scriptPath = commandPath(join(packageRoot, 'pgAdmin4.py'), windows)
  const commandPattern = new RegExp(
    `^\\s*${commandArgumentPattern(pythonPath)}\\s+${commandArgumentPattern(scriptPath)}(?=\\s|$)`
  )

  return commandPattern.test(normalizedCommand)
}

function pgAdminMetadataIndependentScriptPattern(paths: PgAdminPaths, windows: boolean): string {
  const venvPath = escapeRegExp(commandPath(paths.venv, windows))
  const relativePath = windows
    ? 'lib/site-packages/pgadmin4/pgadmin4\\.py'
    : 'lib/python[^/]+/site-packages/pgadmin4/pgAdmin4\\.py'
  const scriptPath = `${venvPath}/${relativePath}`
  return `(?:${scriptPath}|"${scriptPath}"|'${scriptPath}')`
}

/**
 * Distribution metadata can be missing while a previous pgAdmin process is still running.
 * This deliberately accepts only FlyEnv's venv Python followed by its canonical pgAdmin entry point.
 */
export function pgAdminCommandOwnedWithoutPackageMetadata(
  command: string,
  paths: PgAdminPaths,
  windows: boolean
): boolean {
  const normalizedCommand = commandPath(command, windows)
  const pythonPath = commandPath(paths.python, windows)
  const commandPattern = new RegExp(
    `^\\s*${commandArgumentPattern(pythonPath)}\\s+${pgAdminMetadataIndependentScriptPattern(
      paths,
      windows
    )}(?=\\s|$)`
  )
  return commandPattern.test(normalizedCommand)
}

export interface PgAdminProcess {
  PID: string
  COMMAND: string
}

export function pgAdminOwnedPids(
  processes: PgAdminProcess[],
  paths: PgAdminPaths,
  packageRoot: string,
  windows: boolean
): string[] {
  return Array.from(
    new Set(
      processes
        .filter((process) => pgAdminCommandOwned(process.COMMAND, paths, packageRoot, windows))
        .map((process) => `${process.PID}`.trim())
        .filter(Boolean)
    )
  )
}

export function pgAdminOwnedPidsWithoutPackageMetadata(
  processes: PgAdminProcess[],
  paths: PgAdminPaths,
  windows: boolean
): string[] {
  return Array.from(
    new Set(
      processes
        .filter((process) =>
          pgAdminCommandOwnedWithoutPackageMetadata(process.COMMAND, paths, windows)
        )
        .map((process) => `${process.PID}`.trim())
        .filter(Boolean)
    )
  )
}

export function postgresqlPortFromConfig(content: string): number {
  const match = /^\s*port\s*=\s*(?:"(\d+)"|'(\d+)'|(\d+))\s*(?:#.*)?$/im.exec(content)
  const port = Number(match?.[1] ?? match?.[2] ?? match?.[3])

  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : 5432
}

export interface PostgreSqlPostmasterInfo {
  pid: string
  dataDirectory: string
  port: number
}

function postmasterPidLine(content: string, line: number): string {
  const value = content.split('\n')[line - 1]
  return value?.endsWith('\r') ? value.slice(0, -1) : (value ?? '')
}

export function postgresqlPostmasterInfo(content: string): PostgreSqlPostmasterInfo {
  const pid = postmasterPidLine(content, 1)
  const dataDirectory = postmasterPidLine(content, 2)
  const rawPort = postmasterPidLine(content, 4)
  if (!/^\d+$/.test(pid) || Number(pid) < 1) {
    throw new Error('Invalid PostgreSQL PID in postmaster.pid line 1')
  }
  if (!dataDirectory) {
    throw new Error('Invalid PostgreSQL data directory in postmaster.pid line 2')
  }
  const portText = rawPort?.endsWith('\r') ? rawPort.slice(0, -1) : rawPort
  if (!portText || !/^\d+$/.test(portText)) {
    throw new Error('Invalid PostgreSQL port in postmaster.pid line 4')
  }

  const port = Number(portText)
  if (!Number.isInteger(port) || port < 1 || port > PGADMIN4_MAX_PORT) {
    throw new Error('Invalid PostgreSQL port in postmaster.pid line 4')
  }
  return { pid, dataDirectory, port }
}

export function postgresqlPortFromPostmasterPid(content: string): number {
  return postgresqlPostmasterInfo(content).port
}

export interface PostgreSqlProcess {
  PID: string
  COMMAND: string
}

export function postgresqlPostmasterOwnedByDataDir(
  postmaster: PostgreSqlPostmasterInfo,
  dataDirectory: string,
  processes: PostgreSqlProcess[],
  windows: boolean
): boolean {
  const normalizedDataDirectory = commandPath(dataDirectory, windows)
  if (commandPath(postmaster.dataDirectory, windows) !== normalizedDataDirectory) {
    return false
  }
  const command = commandPath(
    processes.find((process) => `${process.PID}` === postmaster.pid)?.COMMAND ?? '',
    windows
  )
  if (!command) return false

  const postgresPattern = /(?:^|[/\s])postgres(?:\.exe)?(?=\s|$)/
  const dataDirectoryFlag = windows ? '-d' : '-D'
  const dataDirectoryPattern = new RegExp(
    `(?:^|\\s)${dataDirectoryFlag}\\s+${commandArgumentPattern(normalizedDataDirectory)}(?=\\s|$)`
  )
  return postgresPattern.test(command) && dataDirectoryPattern.test(command)
}

export function validPgAdminRegistrationPort(port: number): boolean {
  return Number.isInteger(port) && port > 0 && port <= PGADMIN4_MAX_SERVER_PORT
}

export function assertPgAdminRegistrationPort(port: number): void {
  if (!validPgAdminRegistrationPort(port)) {
    throw new Error(
      `pgAdmin 4 only supports PostgreSQL registration ports from 1 through ${PGADMIN4_MAX_SERVER_PORT}`
    )
  }
}

export function pgAdminServersContent(port: number): string {
  assertPgAdminRegistrationPort(port)

  return `${JSON.stringify(
    {
      Servers: {
        1: {
          Name: 'FlyEnv PostgreSQL',
          Group: 'Servers',
          Host: '127.0.0.1',
          Port: port,
          MaintenanceDB: 'postgres',
          Username: 'root',
          SSLMode: 'prefer'
        }
      }
    },
    null,
    2
  )}\n`
}

export function validPgAdminCredentials(credentials?: PgAdminCredentials | null): boolean {
  return !!(
    credentials &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(credentials.email) &&
    credentials.password.length >= 8
  )
}

export function validPgAdminPythonVersion(version: string | null | undefined): boolean {
  const match = /^(?:Python\s+)?(\d+)\.(\d+)(?:\.\d+)?\s*$/.exec(version?.trim() ?? '')
  if (!match) return false

  const major = Number(match[1])
  const minor = Number(match[2])
  return major > 3 || (major === 3 && minor >= 9)
}

export interface PgAdminHealthOptions {
  isPortOwned: () => Promise<boolean>
  isHttpReachable: () => Promise<boolean>
  wait: (milliseconds: number) => Promise<unknown>
  attempts?: number
  intervalMilliseconds?: number
}

export async function waitForPgAdminHealth(options: PgAdminHealthOptions): Promise<boolean> {
  const attempts = Math.max(1, options.attempts ?? 10)
  const intervalMilliseconds = options.intervalMilliseconds ?? 250

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if ((await options.isPortOwned()) && (await options.isHttpReachable())) {
      return true
    }
    if (attempt + 1 < attempts) {
      await options.wait(intervalMilliseconds)
    }
  }
  return false
}

function canBindLoopback(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer()
    const finish = (available: boolean) => {
      server.removeAllListeners()
      resolve(available)
    }

    server.once('error', () => finish(false))
    server.listen({ host: '127.0.0.1', port }, () => {
      server.close(() => finish(true))
    })
  })
}

export async function findPgAdminPort(
  start = PGADMIN4_DEFAULT_PORT,
  excluded: readonly number[] = []
): Promise<number> {
  const excludedPorts = new Set(excluded)
  const end = Math.min(start + PGADMIN4_PORT_SCAN_COUNT - 1, PGADMIN4_MAX_PORT)
  for (
    let offset = 0;
    offset < PGADMIN4_PORT_SCAN_COUNT && start + offset <= PGADMIN4_MAX_PORT;
    offset += 1
  ) {
    const port = start + offset
    if (excludedPorts.has(port)) continue
    if (await canBindLoopback(port)) return port
  }

  throw new Error(`No pgAdmin 4 loopback port is available between ${start} and ${end}`)
}
