import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { appendFile, chmod, mkdirp, readFile, remove, writeFile } from '@shared/fs-extra'
import { delimiter, dirname, join, normalize, posix, win32 } from 'node:path'
import axios from 'axios'
import type { SoftInstalled } from '@shared/app'
import { ForkPromise } from '@shared/ForkPromise'
import { ProcessKillStrict, ProcessListFetch, type PItem } from '@shared/Process'
import {
  fetchLoopbackListeningPids as fetchLoopbackListeningPidsWindows,
  ProcessPidListStrict
} from '@shared/Process.win'
import { isWindows, waitTime } from '@shared/utils'
import { spawnPromise } from '@shared/child-process'
import { findLoopbackPort } from '@shared/LoopbackPort'
import { webPanelInstallNotice } from '@shared/WebPanelInstallNotice'
import { serviceStartSpawn } from '../../util/ServiceStart'

export const DBGATE_PACKAGE = 'dbgate-serve'
export const DBGATE_DEFAULT_PORT = 3000
export const DBGATE_PORT_SCAN_COUNT = 20
export const DBGATE_MAX_PORT = 65535
export const DBGATE_LOGIN = 'flyenv'
const DBGATE_STARTUP_LOG_TAIL_LENGTH = 4_000
const DBGATE_UPSTREAM_DEBUG_MARKER = 'FLYENV_DBGATE_UPSTREAM_DEBUG_V1'
const DBGATE_HEALTH_ATTEMPTS = 30
const DBGATE_HEALTH_INTERVAL_MILLISECONDS = 1000

export function dbGateInstallManifest() {
  return {
    name: 'flyenv-dbgate',
    private: true,
    dependencies: { [DBGATE_PACKAGE]: 'latest' },
    overrides: { 'dbgate-pg-dumper': '1.0.0' }
  }
}

export type DbGatePaths = {
  root: string
  workspace: string
  entry: string
  pid: string
  port: string
  credentials: string
  log: string
  startOut: string
  startError: string
}

export type DbGateCredentials = {
  login: string
  password: string
}

export type DbGateOpenResult = {
  url: string
  'APP-Service-Start-PID': string
  'APP-Service-Start-Item': SoftInstalled
}

const normalizeForPlatform = (value: string, windows: boolean) => {
  const path = windows ? win32.normalize(value.replaceAll('/', '\\')) : normalize(value)
  return path.replaceAll('\\', '/').replace(/\/+$/, '')
}

const quoteSafe = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function dbGateInstallEnv(nodeDir: string, windows: boolean): NodeJS.ProcessEnv | undefined {
  if (windows) return undefined
  return {
    ...process.env,
    PATH: [nodeDir, process.env.PATH].filter(Boolean).join(delimiter)
  }
}

const npmInstallOptions = (cwd: string, nodeDir: string, windows: boolean) => {
  const env = dbGateInstallEnv(nodeDir, windows)
  return env ? { cwd, shell: false, env } : { cwd, shell: false }
}

export function dbGatePaths(baseDir: string, windows: boolean): DbGatePaths {
  const pathJoin = windows ? win32.join : posix.join
  const root = pathJoin(baseDir, 'dbgate')
  const slash = (value: string) => (windows ? value.replaceAll('/', '\\') : value)
  return {
    root: slash(root),
    workspace: slash(pathJoin(root, 'workspace')),
    entry: slash(pathJoin(root, 'node_modules', 'dbgate-serve', 'bin', 'dbgate-serve.js')),
    pid: slash(pathJoin(root, 'dbgate.pid')),
    port: slash(pathJoin(root, 'dbgate.port')),
    credentials: slash(pathJoin(root, 'dbgate.credentials.json')),
    log: slash(pathJoin(root, 'log')),
    startOut: slash(pathJoin(root, 'log', 'dbgate.start.out.log')),
    startError: slash(pathJoin(root, 'log', 'dbgate.start.error.log'))
  }
}

export function dbGateEnv(
  paths: DbGatePaths,
  port: number,
  credentials: DbGateCredentials = { login: DBGATE_LOGIN, password: '' }
): Record<string, string> {
  return {
    WORKSPACE_DIR: paths.workspace,
    PORT: `${port}`,
    BASIC_AUTH: '1',
    LOGIN: credentials.login,
    PASSWORD: credentials.password,
    SHELL_CONNECTION: '0',
    SHELL_SCRIPTING: '0'
  }
}

export function dbGateCredentials(password: string, login = DBGATE_LOGIN): string {
  return `${login}:${password}`
}

export function dbGateUrl(port: number, credentials?: DbGateCredentials): string {
  const userInfo = credentials
    ? `${encodeURIComponent(credentials.login)}:${encodeURIComponent(credentials.password)}@`
    : ''
  return `http://${userInfo}127.0.0.1:${port}`
}

export function dbGateCommandOwned(command: string, paths: DbGatePaths, windows: boolean): boolean {
  const entry = normalizeForPlatform(paths.entry, windows)
  const normalizedCommand = `${command ?? ''}`.replaceAll('\\', '/')
  const flags = windows ? 'i' : ''
  const expression = new RegExp(`(?:^|[\\s"'])${quoteSafe(entry)}(?=$|[\\s"'])`, flags)
  return expression.test(normalizedCommand)
}

export function mongodbPortFromConfig(content: string): number {
  const match = /(?:^|\n)\s*port\s*:\s*([0-9]+)/i.exec(content)
  const port = Number(match?.[1])
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : 27017
}

const validCredentials = (value: unknown): value is DbGateCredentials => {
  const item = value as Partial<DbGateCredentials> | undefined
  return (
    !!item &&
    item.login === DBGATE_LOGIN &&
    typeof item.password === 'string' &&
    item.password.length >= 32
  )
}

const processList = async (): Promise<PItem[]> => {
  try {
    return isWindows() ? ProcessPidListStrict() : ProcessListFetch()
  } catch {
    return []
  }
}

export type DbGateRuntimeOptions = {
  paths?: DbGatePaths
  platformWindows?: boolean
  processList?: () => Promise<PItem[]>
  listeningPids?: (port: string) => Promise<string[]>
  health?: (port: number, credentials: DbGateCredentials) => Promise<boolean>
  portFinder?: typeof findLoopbackPort
  installer?: (nodeBin: string, paths: DbGatePaths) => Promise<void>
  starter?: (
    node: SoftInstalled,
    paths: DbGatePaths,
    port: number,
    credentials: DbGateCredentials,
    on: (...args: any[]) => void
  ) => Promise<{ 'APP-Service-Start-PID': string }>
  kill?: (pids: string[]) => Promise<void>
  debugUpstream?: boolean
}

export class DbGateRuntime {
  readonly paths: DbGatePaths
  private readonly windows: boolean
  private readonly listProcesses: () => Promise<PItem[]>
  private readonly fetchListeningPids: (port: string) => Promise<string[]>
  private readonly checkHealth: (port: number, credentials: DbGateCredentials) => Promise<boolean>
  private readonly locatePort: typeof findLoopbackPort
  private readonly installPackage: (nodeBin: string, paths: DbGatePaths) => Promise<void>
  private readonly startPackage: NonNullable<DbGateRuntimeOptions['starter']>
  private readonly killProcesses: (pids: string[]) => Promise<void>
  private readonly debugUpstream: boolean
  private lastHealthError = ''
  private openFlight?: Promise<DbGateOpenResult>

  constructor(baseDir: string, options: DbGateRuntimeOptions = {}) {
    this.windows = options.platformWindows ?? isWindows()
    this.paths = options.paths ?? dbGatePaths(baseDir, this.windows)
    this.listProcesses = options.processList ?? processList
    this.fetchListeningPids =
      options.listeningPids ??
      (this.windows
        ? fetchLoopbackListeningPidsWindows
        : async (port) => {
            const { fetchLoopbackListeningPids } = await import('@shared/Process')
            return fetchLoopbackListeningPids(port)
          })
    this.checkHealth = options.health ?? this.defaultHealth
    this.locatePort = options.portFinder ?? findLoopbackPort
    this.installPackage = options.installer ?? this.defaultInstall
    this.startPackage = options.starter ?? this.defaultStart
    this.killProcesses = options.kill ?? ((pids) => ProcessKillStrict('-INT', pids))
    this.debugUpstream = options.debugUpstream ?? false
  }

  private async instrumentUpstream(paths: DbGatePaths): Promise<void> {
    if (!this.debugUpstream) return
    const apiDir = join(paths.root, 'node_modules', 'dbgate-api', 'src')
    const serveEntry = paths.entry
    const debugFile = join(paths.log, 'dbgate.upstream.debug.log')
    const debugModule = join(apiDir, 'flyenvDebug.js')
    const debugSource = `/* ${DBGATE_UPSTREAM_DEBUG_MARKER} */
const fs = require('fs');
const path = require('path');
const debugPath = process.env.DBGATE_FLYENV_DEBUG_FILE;
function errorData(error) {
  if (!error) return error;
  return { name: error.name, code: error.code, message: error.message, stack: error.stack };
}
function debug(stage, details) {
  if (process.env.DBGATE_FLYENV_DEBUG !== '1') return;
  const record = { time: Date.now(), pid: process.pid, stage, details };
  const line = '[DbGateFlyEnv] ' + stage + ' ' + JSON.stringify(record);
  try { console.log(line); } catch {}
  if (debugPath) {
    try {
      fs.mkdirSync(path.dirname(debugPath), { recursive: true });
      fs.appendFileSync(debugPath, line + '\\n');
    } catch {}
  }
}
debug.errorData = errorData;
global.__FLYENV_DBGATE_DEBUG = debug;
process.on('uncaughtExceptionMonitor', error => debug('process.uncaughtException', errorData(error)));
process.on('unhandledRejection', reason => debug('process.unhandledRejection', errorData(reason)));
process.on('beforeExit', code => debug('process.beforeExit', { code }));
process.on('exit', code => debug('process.exit', { code }));
debug('process.loaded', { cwd: process.cwd(), argv: process.argv.slice(1), node: process.execPath });
`
    await mkdirp(paths.log)
    await writeFile(debugModule, debugSource)
    await writeFile(join(dirname(serveEntry), 'flyenvDebug.js'), debugSource)

    const patchFile = async (
      file: string,
      replacements: Array<[string, string]>,
      debugRequire = './flyenvDebug'
    ) => {
      if (!existsSync(file)) return
      let source = await readFile(file, 'utf8')
      if (source.includes(DBGATE_UPSTREAM_DEBUG_MARKER)) return
      const header = `/* ${DBGATE_UPSTREAM_DEBUG_MARKER} */\nrequire('${debugRequire}');\n`
      if (source.startsWith('#!')) {
        const newline = source.indexOf('\n')
        source = `${source.slice(0, newline + 1)}${header}${source.slice(newline + 1)}`
      } else {
        source = header + source
      }
      for (const [needle, replacement] of replacements) {
        const normalizedNeedle = needle.replaceAll('\\n', '\n')
        const normalizedReplacement = replacement.replaceAll('\\n', '\n')
        if (!source.includes(normalizedReplacement) && source.includes(normalizedNeedle)) {
          source = source.replace(normalizedNeedle, normalizedReplacement)
        }
      }
      await writeFile(file, source)
    }

    await patchFile(join(apiDir, 'index.js'), [
      [
        'if (processArgs.listenApi) {\\n  configureLogger();',
        "if (processArgs.listenApi) {\\n  global.__FLYENV_DBGATE_DEBUG?.('api.configureLogger.begin');\\n  configureLogger();\\n  global.__FLYENV_DBGATE_DEBUG?.('api.configureLogger.done');"
      ],
      [
        '  main.start();',
        "  global.__FLYENV_DBGATE_DEBUG?.('api.main.start.begin');\\n  main.start();\\n  global.__FLYENV_DBGATE_DEBUG?.('api.main.start.returned');"
      ]
    ])
    await patchFile(join(apiDir, 'main.js'), [
      [
        "function start() {\\n  // console.log('process.argv', process.argv);",
        "function start() {\\n  global.__FLYENV_DBGATE_DEBUG?.('main.start.begin', { cwd: process.cwd(), workspace: process.env.WORKSPACE_DIR, requestedPort: process.env.PORT });\\n  // console.log('process.argv', process.argv);"
      ],
      [
        '  const app = express();',
        "  const app = express();\\n  global.__FLYENV_DBGATE_DEBUG?.('main.express.created');"
      ],
      [
        '  const server = http.createServer(app);',
        "  const server = http.createServer(app);\\n  server.on('error', error => global.__FLYENV_DBGATE_DEBUG?.('main.server.error', global.__FLYENV_DBGATE_DEBUG.errorData(error)));\\n  server.on('listening', () => global.__FLYENV_DBGATE_DEBUG?.('main.server.listening.event', server.address()));\\n  server.on('close', () => global.__FLYENV_DBGATE_DEBUG?.('main.server.close'));"
      ],
      [
        '  useAllControllers(app, null);',
        "  global.__FLYENV_DBGATE_DEBUG?.('main.controllers.register.begin');\\n  useAllControllers(app, null);\\n  global.__FLYENV_DBGATE_DEBUG?.('main.controllers.register.done');"
      ],
      [
        '  } else if (platformInfo.isNpmDist) {\\n    getPort({',
        "  } else if (platformInfo.isNpmDist) {\\n    global.__FLYENV_DBGATE_DEBUG?.('main.port.resolve.begin', { requestedPort: process.env.PORT });\\n    getPort({"
      ],
      [
        '    }).then(port => {\\n      server.listen(port, () => {',
        "    }).then(port => {\\n      global.__FLYENV_DBGATE_DEBUG?.('main.port.resolve.done', { port });\\n      server.listen(port, () => {"
      ],
      [
        '        logger.info(`DBGM-00031 DbGate API listening on port ${port} (NPM build)`);',
        "        logger.info(`DBGM-00031 DbGate API listening on port ${port} (NPM build)`);\\n        global.__FLYENV_DBGATE_DEBUG?.('main.server.listen.callback', { port, address: server.address() });"
      ],
      [
        '  startCloudFiles();',
        "  global.__FLYENV_DBGATE_DEBUG?.('main.cloudFiles.begin');\\n  const cloudFilesResult = startCloudFiles();\\n  if (cloudFilesResult && typeof cloudFilesResult.catch === 'function') cloudFilesResult.catch(error => global.__FLYENV_DBGATE_DEBUG?.('main.cloudFiles.error', global.__FLYENV_DBGATE_DEBUG.errorData(error)));\\n  global.__FLYENV_DBGATE_DEBUG?.('main.cloudFiles.returned');"
      ]
    ])
    await patchFile(
      join(apiDir, 'utility', 'useController.js'),
      [
        [
          '      controller._init();',
          "      const initResult = controller._init();\\n      global.__FLYENV_DBGATE_DEBUG?.('controller.init.returned', { route, thenable: !!initResult && typeof initResult.then === 'function' });\\n      if (initResult && typeof initResult.then === 'function') {\\n        initResult.then(() => global.__FLYENV_DBGATE_DEBUG?.('controller.init.done', { route })).catch(error => {\\n          global.__FLYENV_DBGATE_DEBUG?.('controller.init.error', { route, error: global.__FLYENV_DBGATE_DEBUG.errorData(error) });\\n          throw error;\\n        });\\n      }"
        ]
      ],
      '../flyenvDebug'
    )
    await patchFile(serveEntry, [
      [
        "const dbgateApi = require('dbgate-api');",
        "global.__FLYENV_DBGATE_DEBUG?.('serve.api.require.begin');\\nconst dbgateApi = require('dbgate-api');\\nglobal.__FLYENV_DBGATE_DEBUG?.('serve.api.require.done');"
      ],
      [
        'dbgateApi.getMainModule().start();',
        "global.__FLYENV_DBGATE_DEBUG?.('serve.start.begin');\\ntry {\\n  global.__FLYENV_DBGATE_DEBUG?.('serve.main.require.begin');\\n  const mainModule = dbgateApi.getMainModule();\\n  global.__FLYENV_DBGATE_DEBUG?.('serve.main.require.done');\\n  mainModule.start();\\n  global.__FLYENV_DBGATE_DEBUG?.('serve.start.returned');\\n} catch (error) {\\n  global.__FLYENV_DBGATE_DEBUG?.('serve.start.error', global.__FLYENV_DBGATE_DEBUG.errorData(error));\\n  throw error;\\n}"
      ]
    ])
    await appendFile(debugFile, `[FlyEnv] instrumented ${new Date().toISOString()}\n`)
  }

  private async defaultHealth(port: number, credentials: DbGateCredentials): Promise<boolean> {
    try {
      await axios.get(dbGateUrl(port, credentials), {
        timeout: 3000,
        validateStatus: () => true
      })
      this.lastHealthError = ''
      return true
    } catch (error) {
      const item = error as { code?: string; message?: string }
      this.lastHealthError = [item.code, item.message ?? `${error}`].filter(Boolean).join(': ')
      return false
    }
  }

  private async ensureCredentials(): Promise<DbGateCredentials> {
    if (existsSync(this.paths.credentials)) {
      try {
        const value = JSON.parse(await readFile(this.paths.credentials, 'utf8'))
        if (validCredentials(value)) return value
      } catch {}
    }
    const credentials = { login: DBGATE_LOGIN, password: randomBytes(32).toString('hex') }
    await writeFile(this.paths.credentials, JSON.stringify(credentials), { mode: 0o600 })
    await chmod(this.paths.credentials, 0o600).catch(() => {})
    return credentials
  }

  private async defaultInstall(nodeBin: string, paths: DbGatePaths): Promise<void> {
    const nodeDir = dirname(nodeBin)
    const npmCliCandidates = [
      join(nodeDir, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
      join(dirname(nodeDir), 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js')
    ]
    const npmCli = npmCliCandidates.find((candidate) => existsSync(candidate))
    const npm = this.windows
      ? undefined
      : [join(nodeDir, 'npm')].find((candidate) => existsSync(candidate))
    if (!npmCli && !npm) throw new Error('npm is not available for the selected Node.js version')
    await mkdirp(paths.root)
    const manifestPath = join(paths.root, 'package.json')
    let manifest = dbGateInstallManifest()
    if (existsSync(manifestPath)) {
      try {
        const current = JSON.parse(await readFile(manifestPath, 'utf8'))
        manifest = {
          ...current,
          name: current.name ?? manifest.name,
          private: true,
          dependencies: { ...current.dependencies, ...manifest.dependencies },
          overrides: { ...current.overrides, ...manifest.overrides }
        }
      } catch {}
    }
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2))
    const args = [
      'install',
      '--loglevel',
      'error',
      '--prefix',
      paths.root,
      '--no-package-lock',
      '--no-audit',
      '--no-fund',
      DBGATE_PACKAGE
    ]
    if (npmCli) {
      await spawnPromise(
        nodeBin,
        [npmCli, ...args],
        npmInstallOptions(paths.root, nodeDir, this.windows)
      )
    } else {
      await spawnPromise(npm!, args, npmInstallOptions(paths.root, nodeDir, this.windows))
    }
    if (!existsSync(paths.entry))
      throw new Error('DbGate package installation did not produce its entry script')
  }

  private async defaultStart(
    node: SoftInstalled,
    paths: DbGatePaths,
    port: number,
    credentials: DbGateCredentials,
    on: (...args: any[]) => void
  ) {
    const item = {
      typeFlag: 'mongodb',
      version: 'dbgate',
      bin: node.bin,
      path: paths.root
    } as SoftInstalled
    return serviceStartSpawn({
      version: item,
      pidPath: paths.pid,
      baseDir: paths.root,
      bin: node.bin,
      execArgs: [paths.entry],
      execEnv: {
        ...dbGateEnv(paths, port, credentials),
        ...(this.debugUpstream
          ? {
              DBGATE_FLYENV_DEBUG: '1',
              DBGATE_FLYENV_DEBUG_FILE: join(paths.log, 'dbgate.upstream.debug.log')
            }
          : {})
      },
      cwd: paths.root,
      outFile: paths.startOut,
      errFile: paths.startError,
      on,
      // DbGate can load a large dependency graph on a cold Windows start.
      waitTime: 2000
    })
  }

  private async readPort(): Promise<number | undefined> {
    if (!existsSync(this.paths.port)) return undefined
    const port = Number((await readFile(this.paths.port, 'utf8')).trim())
    return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : undefined
  }

  private async ownedPids(pid: string): Promise<string[]> {
    const list = await this.listProcesses()
    const root = list.find((item) => `${item.PID}` === `${pid}`)
    if (!root || !dbGateCommandOwned(root.COMMAND, this.paths, this.windows)) return []
    const pids = new Set<string>([`${pid}`])
    const visit = (parent: string) => {
      for (const item of list) {
        if (`${item.PPID}` === parent && !pids.has(`${item.PID}`)) {
          pids.add(`${item.PID}`)
          visit(`${item.PID}`)
        }
      }
    }
    visit(`${pid}`)
    return [...pids]
  }

  private async waitHealth(port: number, credentials: DbGateCredentials): Promise<boolean> {
    this.lastHealthError = ''
    for (let attempt = 0; attempt < DBGATE_HEALTH_ATTEMPTS; attempt += 1) {
      if (await this.checkHealth(port, credentials)) return true
      if (attempt + 1 < DBGATE_HEALTH_ATTEMPTS) {
        await waitTime(DBGATE_HEALTH_INTERVAL_MILLISECONDS)
      }
    }
    return false
  }

  private async startupDiagnostics(port: number, pid: string, nodeBin: string): Promise<string> {
    const readTail = async (file: string) => {
      try {
        const content = `${await readFile(file, 'utf8')}`.trim()
        return content.length > DBGATE_STARTUP_LOG_TAIL_LENGTH
          ? content.slice(-DBGATE_STARTUP_LOG_TAIL_LENGTH)
          : content
      } catch {
        return ''
      }
    }
    const [stdout, stderr] = await Promise.all([
      readTail(this.paths.startOut),
      readTail(this.paths.startError)
    ])
    const listeningPids = await this.fetchListeningPids(`${port}`).catch(() => [])
    return [
      `target=http://127.0.0.1:${port}`,
      `pid=${pid || 'unknown'}`,
      `node=${nodeBin}`,
      `entry=${this.paths.entry}`,
      `cwd=${this.paths.root}`,
      `debugLog=${this.debugUpstream ? join(this.paths.log, 'dbgate.upstream.debug.log') : '<disabled>'}`,
      `healthError=${this.lastHealthError || '<none>'}`,
      `listeningPids=${listeningPids.join(',') || '<none>'}`,
      `stdout=${stdout || '<empty>'}`,
      `stderr=${stderr || '<empty>'}`
    ].join('\n')
  }

  private async waitForStopped(pids: string[]): Promise<void> {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const active = await this.listProcesses().catch(() => [])
      if (!pids.some((pid) => active.some((item) => `${item.PID}` === `${pid}`))) return
      await waitTime(100)
    }
  }

  private async openInternal(
    node: SoftInstalled,
    on: (...args: any[]) => void
  ): Promise<DbGateOpenResult> {
    const nodeBin = `${node?.bin ?? ''}`.trim()
    if (!nodeBin) throw new Error('A Node.js version must be selected before opening DbGate')
    const freshInstall = !existsSync(this.paths.entry)
    await mkdirp(this.paths.workspace)
    const credentials = await this.ensureCredentials()
    const persistedPid = existsSync(this.paths.pid)
      ? (await readFile(this.paths.pid, 'utf8')).trim()
      : ''
    const persistedPort = await this.readPort()
    if (persistedPid && persistedPort) {
      const pids = await this.ownedPids(persistedPid)
      const listening =
        pids.length > 0 &&
        (await this.fetchListeningPids(`${persistedPort}`)).includes(persistedPid)
      if (listening && (await this.checkHealth(persistedPort, credentials))) {
        return {
          url: dbGateUrl(persistedPort, credentials),
          'APP-Service-Start-PID': persistedPid,
          'APP-Service-Start-Item': {
            typeFlag: 'mongodb',
            version: 'dbgate',
            bin: nodeBin,
            path: this.paths.root
          } as SoftInstalled
        }
      }
      if (pids.length > 0) {
        try {
          await this.killProcesses(pids)
          await this.waitForStopped(pids)
        } catch {}
      }
      await remove(this.paths.pid).catch(() => {})
      await remove(this.paths.port).catch(() => {})
    }
    try {
      if (freshInstall) {
        on(webPanelInstallNotice('DbGate'))
        await this.installPackage(nodeBin, this.paths)
        await this.instrumentUpstream(this.paths)
        // Allow Windows file handles and native dependencies to settle after
        // the first npm installation before starting the detached process.
        await waitTime(1000)
      } else {
        await this.instrumentUpstream(this.paths)
      }
      const port = await this.locatePort(
        DBGATE_DEFAULT_PORT,
        DBGATE_PORT_SCAN_COUNT,
        DBGATE_MAX_PORT,
        persistedPort ? [persistedPort] : []
      )
      let start = await this.startPackage(node, this.paths, port, credentials, on)
      if (!(await this.waitHealth(port, credentials))) {
        const diagnostics = await this.startupDiagnostics(
          port,
          start['APP-Service-Start-PID'],
          nodeBin
        )
        // DbGate can leave its first process unhealthy after a fresh npm
        // install. Restart that confirmed process once.
        const firstPid = start['APP-Service-Start-PID']
        const firstOwnedPids = await this.ownedPids(firstPid)
        if (/^\d+$/.test(firstPid)) {
          // firstPid came directly from this invocation of serviceStartSpawn.
          // Process/netstat enumeration can briefly disagree with the HTTP
          // result on Windows, so use that PID as a narrow one-time fallback.
          const pidsToStop = firstOwnedPids.length > 0 ? firstOwnedPids : [firstPid]
          await this.killProcesses(pidsToStop)
          await this.waitForStopped(pidsToStop)
          await remove(this.paths.pid).catch(() => {})
          await waitTime(1000)
          start = await this.startPackage(node, this.paths, port, credentials, on)
          if (!(await this.waitHealth(port, credentials))) {
            const retryDiagnostics = await this.startupDiagnostics(
              port,
              start['APP-Service-Start-PID'],
              nodeBin
            )
            throw new Error(
              `DbGate did not become healthy after startup\nfirstAttempt:\n${diagnostics}\nretryAttempt:\n${retryDiagnostics}`
            )
          }
        } else {
          throw new Error(`DbGate did not become healthy after startup\n${diagnostics}`)
        }
      }
      await writeFile(this.paths.port, `${port}`)
      return {
        url: dbGateUrl(port, credentials),
        'APP-Service-Start-PID': start['APP-Service-Start-PID'],
        'APP-Service-Start-Item': {
          typeFlag: 'mongodb',
          version: 'dbgate',
          bin: nodeBin,
          path: this.paths.root
        } as SoftInstalled
      }
    } catch (error) {
      await this.stop().catch(() => {})
      throw error
    }
  }

  open(
    node: SoftInstalled,
    on: (...args: any[]) => void = () => {}
  ): ForkPromise<DbGateOpenResult> {
    return new ForkPromise((resolve, reject) => {
      if (!this.openFlight) {
        this.openFlight = this.openInternal(node, on).finally(() => {
          this.openFlight = undefined
        })
      }
      this.openFlight.then(resolve).catch(reject)
    })
  }

  async stop(): Promise<string[]> {
    const pid = existsSync(this.paths.pid) ? (await readFile(this.paths.pid, 'utf8')).trim() : ''
    const pids = pid ? await this.ownedPids(pid) : []
    try {
      if (pids.length > 0) {
        await this.killProcesses(pids)
        await this.waitForStopped(pids)
      }
    } finally {
      await remove(this.paths.pid).catch(() => {})
      await remove(this.paths.port).catch(() => {})
    }
    return pids
  }
}
