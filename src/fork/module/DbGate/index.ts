import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { chmod, mkdirp, readFile, remove, writeFile } from '@shared/fs-extra'
import { dirname, join, normalize, win32 } from 'node:path'
import axios from 'axios'
import type { SoftInstalled } from '@shared/app'
import { ForkPromise } from '@shared/ForkPromise'
import { ProcessKillStrict, ProcessListFetch, type PItem } from '@shared/Process'
import {
  fetchLoopbackListeningPids as fetchLoopbackListeningPidsWindows,
  ProcessPidListStrict
} from '@shared/Process.win'
import { isWindows } from '@shared/utils'
import { spawnPromise } from '@shared/child-process'
import { findLoopbackPort } from '@shared/LoopbackPort'
import { webPanelInstallNotice } from '@shared/WebPanelInstallNotice'
import { serviceStartSpawn } from '../../util/ServiceStart'

export const DBGATE_PACKAGE = 'dbgate-serve'
export const DBGATE_DEFAULT_PORT = 3000
export const DBGATE_PORT_SCAN_COUNT = 20
export const DBGATE_MAX_PORT = 65535
export const DBGATE_LOGIN = 'flyenv'

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

export function dbGatePaths(baseDir: string, windows: boolean): DbGatePaths {
  const pathJoin = windows ? win32.join : join
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
  }

  private async defaultHealth(port: number, credentials: DbGateCredentials): Promise<boolean> {
    try {
      await axios.get(dbGateUrl(port, credentials), {
        timeout: 1200,
        validateStatus: () => true
      })
      return true
    } catch {
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
      await spawnPromise(nodeBin, [npmCli, ...args], { cwd: paths.root, shell: false })
    } else {
      await spawnPromise(npm!, args, { cwd: paths.root, shell: false })
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
      execEnv: dbGateEnv(paths, port, credentials),
      cwd: paths.root,
      outFile: paths.startOut,
      errFile: paths.startError,
      on,
      waitTime: 1500
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
    for (let attempt = 0; attempt < 40; attempt += 1) {
      if (await this.checkHealth(port, credentials)) return true
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    return false
  }

  private async waitForStopped(pids: string[]): Promise<void> {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const active = await this.listProcesses().catch(() => [])
      if (!pids.some((pid) => active.some((item) => `${item.PID}` === `${pid}`))) return
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }

  private async openInternal(
    node: SoftInstalled,
    on: (...args: any[]) => void
  ): Promise<DbGateOpenResult> {
    const nodeBin = `${node?.bin ?? ''}`.trim()
    if (!nodeBin) throw new Error('A Node.js version must be selected before opening DbGate')
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
      if (!existsSync(this.paths.entry)) {
        on(webPanelInstallNotice('DbGate'))
        await this.installPackage(nodeBin, this.paths)
      }
      const port = await this.locatePort(
        DBGATE_DEFAULT_PORT,
        DBGATE_PORT_SCAN_COUNT,
        DBGATE_MAX_PORT,
        persistedPort ? [persistedPort] : []
      )
      const start = await this.startPackage(node, this.paths, port, credentials, on)
      if (!(await this.waitHealth(port, credentials))) {
        throw new Error('DbGate did not become healthy after startup')
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
