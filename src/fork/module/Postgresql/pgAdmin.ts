import { createServer } from 'node:net'
import { join, posix, win32 } from 'node:path'

export const PGADMIN4_PACKAGE = 'pgadmin4'
export const PGADMIN4_DEFAULT_PORT = 5050
export const PGADMIN4_MAX_PORT = 65535
export const PGADMIN4_MAX_SERVER_PORT = 65534
export const PGADMIN4_PORT_SCAN_COUNT = 21
const PGADMIN4_HEALTH_ATTEMPTS = 60
const PGADMIN4_HEALTH_INTERVAL_MILLISECONDS = 500

export interface PgAdminPaths {
  root: string
  data: string
  log: string
  pid: string
  port: string
  servers: string
  bootstrap: string
  verification: string
  identityScript: string
  identity: string
  reconciliation: string
  initialized: string
  desktopMode: string
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
    identityScript: join(root, 'read-server-identity.py'),
    identity: join(root, 'server-identity.json'),
    reconciliation: join(root, 'reconcile-server.py'),
    initialized: join(root, 'initialized'),
    desktopMode: join(root, 'desktop-mode'),
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
  return (
    fileExists(paths.initialized) && fileExists(paths.identity) && fileExists(paths.desktopMode)
  )
}

export interface PgAdminServerIdentity {
  userId: string
  serverId: string
}

const PGADMIN_SQLITE_INTEGER_MAX = '9223372036854775807'

function validPgAdminServerIdentityId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[1-9]\d*$/.test(value) &&
    (value.length < PGADMIN_SQLITE_INTEGER_MAX.length ||
      (value.length === PGADMIN_SQLITE_INTEGER_MAX.length && value <= PGADMIN_SQLITE_INTEGER_MAX))
  )
}

export function parsePgAdminServerIdentity(content: string): PgAdminServerIdentity {
  let value: unknown
  try {
    value = JSON.parse(content)
  } catch {
    throw new Error('Invalid pgAdmin 4 server identity')
  }
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).length !== 2 ||
    !Object.hasOwn(value, 'userId') ||
    !Object.hasOwn(value, 'serverId')
  ) {
    throw new Error('Invalid pgAdmin 4 server identity')
  }
  const identity = value as Record<string, unknown>
  const userId = identity.userId
  const serverId = identity.serverId
  if (!validPgAdminServerIdentityId(userId) || !validPgAdminServerIdentityId(serverId)) {
    throw new Error('Invalid pgAdmin 4 server identity')
  }
  return { userId, serverId }
}

export interface PgAdminInitializationState {
  initialized: boolean
  identity?: PgAdminServerIdentity
}

export async function pgAdminInitializationState(
  paths: PgAdminPaths,
  fileExists: (file: string) => boolean,
  readIdentity: (file: string) => Promise<string>
): Promise<PgAdminInitializationState> {
  if (!pgAdminInitialized(paths, fileExists)) {
    return { initialized: false }
  }
  try {
    return {
      initialized: true,
      identity: parsePgAdminServerIdentity(await readIdentity(paths.identity))
    }
  } catch {
    return { initialized: false }
  }
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
      'SERVER_MODE = False',
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
  return "from importlib.metadata import distribution; d = distribution('pgadmin4'); print(d.locate_file('pgadmin4'))"
}

export function pgAdminPackageRootUnversionedProbe(): string {
  return "from importlib.metadata import distribution; print(distribution('pgadmin4').locate_file('pgadmin4'))"
}

export function pgAdminDesktopBootstrapContent(): string {
  return `import sys
from secrets import token_urlsafe

package_root = sys.argv[1]
if package_root not in sys.path:
    sys.path.insert(0, package_root)

import config
from pgadmin import create_app
from pgadmin.model import Role, Server, User, db
from pgadmin.tools.user_management import create_user
from pgadmin.utils.constants import INTERNAL

postgresql_port = int(sys.argv[2]) if len(sys.argv) > 2 else None
app = create_app(config.APP_NAME + '-cli')

with app.test_request_context():
    user = User.query.filter_by(username=config.DESKTOP_USER, auth_source=INTERNAL).first()
    administrator_role = Role.query.filter_by(name='Administrator').first()
    if administrator_role is None:
        raise RuntimeError('pgAdmin Administrator role was not found')
    if user is None:
        desktop_password = token_urlsafe(48)
        created, _ = create_user(
            {
                'email': config.DESKTOP_USER,
                'role': administrator_role.id,
                'active': True,
                'auth_source': INTERNAL,
                'newPassword': desktop_password,
                'confirmPassword': desktop_password,
            }
        )
        if not created:
            raise RuntimeError('pgAdmin administrator creation failed')
        user = User.query.filter_by(username=config.DESKTOP_USER, auth_source=INTERNAL).first()
    if (
        user is None
        or user.email != config.DESKTOP_USER
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

export function pgAdminDesktopInitializationVerificationContent(): string {
  return `import sys

package_root = sys.argv[1]
if package_root not in sys.path:
    sys.path.insert(0, package_root)

import config
from pgadmin import create_app
from pgadmin.model import Server, User
from pgadmin.utils.constants import INTERNAL

postgresql_port = int(sys.argv[2])
app = create_app(config.APP_NAME + '-cli')

with app.app_context():
    user = User.query.filter_by(username=config.DESKTOP_USER, auth_source=INTERNAL).first()
    if (
        user is None
        or user.email != config.DESKTOP_USER
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
    ).first()
    if server is None:
        raise RuntimeError('pgAdmin server verification failed')
    if server.servergroup is None or server.servergroup.name != 'Servers':
        raise RuntimeError('pgAdmin server verification failed')
    connection_params = server.connection_params or {}
    if connection_params.get('sslmode') != 'prefer':
        raise RuntimeError('pgAdmin server verification failed')
`
}

export function pgAdminDesktopServerIdentityContent(): string {
  return `import json
import sys

package_root = sys.argv[1]
if package_root not in sys.path:
    sys.path.insert(0, package_root)

import config
from pgadmin import create_app
from pgadmin.model import Server, User
from pgadmin.utils.constants import INTERNAL

postgresql_port = int(sys.argv[2])
app = create_app(config.APP_NAME + '-cli')

with app.app_context():
    user = User.query.filter_by(username=config.DESKTOP_USER, auth_source=INTERNAL).first()
    if (
        user is None
        or user.email != config.DESKTOP_USER
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
    ).first()
    if server is None:
        raise RuntimeError('pgAdmin server identity verification failed')
    if server.servergroup is None or server.servergroup.name != 'Servers':
        raise RuntimeError('pgAdmin server identity verification failed')
    connection_params = server.connection_params or {}
    if connection_params.get('sslmode') != 'prefer':
        raise RuntimeError('pgAdmin server identity verification failed')
    print(json.dumps({'userId': str(user.id), 'serverId': str(server.id)}))
`
}

export function pgAdminDesktopServerReconciliationContent(): string {
  return `import sys

package_root = sys.argv[1]
if package_root not in sys.path:
    sys.path.insert(0, package_root)

import config
from pgadmin import create_app
from pgadmin.model import Server, User, db
from pgadmin.utils.constants import INTERNAL

user_id = int(sys.argv[2])
server_id = int(sys.argv[3])
postgresql_port = int(sys.argv[4])
app = create_app(config.APP_NAME + '-cli')

with app.app_context():
    user = User.query.filter_by(id=user_id, username=config.DESKTOP_USER, auth_source=INTERNAL).first()
    if (
        user is None
        or not user.active
        or user.auth_source != INTERNAL
        or not any(role.name == 'Administrator' for role in user.roles)
    ):
        raise RuntimeError('pgAdmin FlyEnv PostgreSQL user was not found')
    server = Server.query.filter_by(
        id=server_id,
        user_id=user.id,
        name='FlyEnv PostgreSQL',
        host='127.0.0.1',
        maintenance_db='postgres',
        username='root',
    ).first()
    if server is None:
        raise RuntimeError('pgAdmin FlyEnv PostgreSQL server was not found')
    if server.servergroup is None or server.servergroup.name != 'Servers':
        raise RuntimeError('pgAdmin FlyEnv PostgreSQL server was not found')
    server.port = postgresql_port
    connection_params = server.connection_params or {}
    connection_params['sslmode'] = 'prefer'
    server.connection_params = connection_params
    db.session.commit()
`
}

export const pgAdminBootstrapContent = pgAdminDesktopBootstrapContent
export const pgAdminInitializationVerificationContent =
  pgAdminDesktopInitializationVerificationContent
export const pgAdminServerIdentityContent = pgAdminDesktopServerIdentityContent
export const pgAdminServerReconciliationContent = pgAdminDesktopServerReconciliationContent

function commandPath(value: string, windows: boolean): string {
  const normalized = value.replace(/\\/g, '/')
  return windows ? normalized.toLowerCase() : normalized
}

function privatePath(value: string, windows: boolean): string {
  let normalized = commandPath(value.trim(), windows)
  if (
    normalized.length >= 2 &&
    (normalized.startsWith('"') || normalized.startsWith("'")) &&
    normalized.endsWith(normalized[0])
  ) {
    normalized = normalized.slice(1, -1)
  }
  return commandPath((windows ? win32 : posix).normalize(normalized), windows).replace(/\/+$/, '')
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function commandArgumentPattern(path: string): string {
  const escapedPath = escapeRegExp(path)
  return `(?:${escapedPath}|"${escapedPath}"|'${escapedPath}')`
}

function commandExecutablePattern(): string {
  return `(?:[^\\s"']+|"[^"]+"|'[^']+')`
}

export function pgAdminPackageRootOwned(
  packageRoot: string,
  paths: PgAdminPaths,
  windows: boolean
): boolean {
  const venvPath = privatePath(paths.venv, windows)
  const rootPath = privatePath(packageRoot, windows)
  return rootPath.startsWith(`${venvPath}/`)
}

export function pgAdminCommandOwned(
  command: string,
  paths: PgAdminPaths,
  packageRoot: string,
  windows: boolean
): boolean {
  if (!pgAdminPackageRootOwned(packageRoot, paths, windows)) {
    return false
  }
  const normalizedCommand = commandPath(command, windows)
  const scriptPath = commandPath(join(privatePath(packageRoot, windows), 'pgAdmin4.py'), windows)
  const commandPattern = new RegExp(
    `^\\s*${commandExecutablePattern()}\\s+${commandArgumentPattern(scriptPath)}(?=\\s|$)`
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
 * This deliberately accepts only FlyEnv's venv canonical pgAdmin entry point.
 */
export function pgAdminCommandOwnedWithoutPackageMetadata(
  command: string,
  paths: PgAdminPaths,
  windows: boolean
): boolean {
  const normalizedCommand = commandPath(command, windows)
  const commandPattern = new RegExp(
    `^\\s*${commandExecutablePattern()}\\s+${pgAdminMetadataIndependentScriptPattern(
      paths,
      windows
    )}(?=\\s|$)`
  )
  return commandPattern.test(normalizedCommand)
}

export interface PgAdminProcess {
  PID: string
  PPID?: string
  COMMAND: string
}

export function pgAdminPortOwnedByProcessTree(
  listeningPids: readonly string[],
  rootPid: string,
  processes: readonly Pick<PgAdminProcess, 'PID' | 'PPID'>[]
): boolean {
  const root = rootPid.trim()
  if (!root) return false

  const ownedPids = new Set([root])
  let changed = true
  while (changed) {
    changed = false
    for (const process of processes) {
      const pid = `${process.PID ?? ''}`.trim()
      const parentPid = `${process.PPID ?? ''}`.trim()
      if (pid && parentPid && ownedPids.has(parentPid) && !ownedPids.has(pid)) {
        ownedPids.add(pid)
        changed = true
      }
    }
  }

  return listeningPids.some((pid) => ownedPids.has(`${pid}`.trim()))
}

export function pgAdminWindowsKillCommand(pids: readonly string[]): string {
  const normalizedPids = Array.from(
    new Set(pids.map((pid) => `${pid}`.trim()).filter((pid) => /^[1-9]\d*$/.test(pid)))
  )
  return normalizedPids.length ? `taskkill /f /pid ${normalizedPids.join(' /pid ')}` : ''
}

export function pgAdminRuntimePythonPath(
  pythonPath: string,
  windows: boolean,
  fileExists: (file: string) => boolean
): string {
  if (!windows) return pythonPath
  const pythonwPath = win32.join(win32.dirname(pythonPath), 'pythonw.exe')
  return fileExists(pythonwPath) ? pythonwPath : pythonPath
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
  const attempts = Math.max(1, options.attempts ?? PGADMIN4_HEALTH_ATTEMPTS)
  const intervalMilliseconds = options.intervalMilliseconds ?? PGADMIN4_HEALTH_INTERVAL_MILLISECONDS

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

export interface PostgreSqlProcess {
  PID: string
  COMMAND: string
}

function postgresqlProcessOwnsDataDirectory(
  command: string,
  dataDirectory: string,
  windows: boolean
): boolean {
  const normalizedCommand = commandPath(command, windows)
  const normalizedDataDirectory = commandPath(dataDirectory, windows)
  if (!normalizedCommand || !normalizedDataDirectory) {
    return false
  }
  const postgresPattern = /(?:^|[/\s])postgres(?:\.exe)?(?=["'\s]|$)/
  const dataDirectoryFlag = windows ? '-d' : '-D'
  const dataDirectoryPattern = new RegExp(
    `(?:^|\\s)${commandArgumentPattern(dataDirectoryFlag)}\\s+${commandArgumentPattern(normalizedDataDirectory)}(?=\\s|$)`
  )
  return postgresPattern.test(normalizedCommand) && dataDirectoryPattern.test(normalizedCommand)
}

export interface PostgreSqlProcessWaitOptions {
  listProcesses: () => Promise<PostgreSqlProcess[]>
  dataDirectory: string
  windows: boolean
  wait: (milliseconds: number) => Promise<unknown>
  attempts?: number
  intervalMilliseconds?: number
}

export async function waitForPostgresqlProcess(
  options: PostgreSqlProcessWaitOptions
): Promise<string> {
  const attempts = Math.max(1, options.attempts ?? 20)
  const intervalMilliseconds = options.intervalMilliseconds ?? 500

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    let processes: PostgreSqlProcess[] = []
    try {
      processes = await options.listProcesses()
    } catch {}
    const process = processes.find((item) =>
      postgresqlProcessOwnsDataDirectory(item.COMMAND, options.dataDirectory, options.windows)
    )
    if (process?.PID) {
      return `${process.PID}`.trim()
    }
    if (attempt + 1 < attempts) {
      await options.wait(intervalMilliseconds)
    }
  }

  throw new Error(`PostgreSQL process did not start for data directory: ${options.dataDirectory}`)
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
