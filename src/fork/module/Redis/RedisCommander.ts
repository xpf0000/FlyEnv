import { createHmac, randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { chmod, mkdirp, readFile, remove, writeFile } from '@shared/fs-extra'
import { delimiter, dirname, join, normalize, posix, win32 } from 'node:path'
import axios from 'axios'
import type { SoftInstalled } from '@shared/app'
import { ForkPromise } from '@shared/ForkPromise'
import {
  ProcessListByExactPid,
  ProcessKillStrict,
  ProcessListFetch,
  type PItem
} from '@shared/Process'
import { isReadableServiceStopRoot } from '@shared/ProcessSnapshot'
import { StopProcessListFetch } from '@shared/StopProcessList'
import {
  cleanupStoppedServicePidFiles,
  ServiceProcessExitTimeoutError,
  stopWindowsServiceProcesses,
  waitForServiceProcessExit
} from '@shared/ServiceStop'
import {
  fetchLoopbackListeningPids as fetchLoopbackListeningPidsWindows,
  ProcessPidListStrict
} from '@shared/Process.win'
import { isWindows, waitTime } from '@shared/utils'
import { spawnPromise } from '@shared/child-process'
import { findLoopbackPort } from '@shared/LoopbackPort'
import { webPanelInstallNotice } from '@shared/WebPanelInstallNotice'
import { serviceStartSpawn } from '../../util/ServiceStart'

export const REDIS_COMMANDER_PACKAGE = 'redis-commander'
export const REDIS_COMMANDER_DEFAULT_PORT = 8081
export const REDIS_COMMANDER_PORT_SCAN_COUNT = 20
export const REDIS_COMMANDER_MAX_PORT = 65535
export const REDIS_COMMANDER_LOGIN = 'flyenv'
export const REDIS_COMMANDER_SSO_ISSUER = 'FlyEnv'
const REDIS_COMMANDER_SSO_TOKEN_TTL_SECONDS = 60
const REDIS_COMMANDER_STARTUP_LOG_TAIL_LENGTH = 4_000
const REDIS_COMMANDER_HEALTH_ATTEMPTS = 30
const REDIS_COMMANDER_HEALTH_INTERVAL_MILLISECONDS = 1000

export type RedisCommanderPaths = {
  root: string
  entry: string
  pid: string
  port: string
  credentials: string
  log: string
  startOut: string
  startError: string
}

export type RedisCommanderCredentials = {
  login: string
  password: string
  ssoSecret: string
}

type RedisCommanderCredentialsState = {
  credentials: RedisCommanderCredentials
  refreshed: boolean
}

export type RedisCommanderConnection = {
  host: '127.0.0.1'
  port: number
  password?: string
}

export type RedisCommanderOpenResult = {
  url: string
  'APP-Service-Start-PID': string
  'APP-Service-Start-Item': SoftInstalled
}

type RedisCommanderOpened = {
  pid: string
  port: number
  credentials: RedisCommanderCredentials
  nodeBin: string
}

const normalizeForPlatform = (value: string, windows: boolean) => {
  const path = windows ? win32.normalize(value.replaceAll('/', '\\')) : normalize(value)
  return path.replaceAll('\\', '/').replace(/\/+$/, '')
}

const quoteSafe = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function redisCommanderInstallEnv(
  nodeDir: string,
  windows: boolean
): NodeJS.ProcessEnv | undefined {
  if (windows) return undefined
  return {
    ...process.env,
    PATH: [nodeDir, process.env.PATH].filter(Boolean).join(delimiter)
  }
}

const npmInstallOptions = (cwd: string, nodeDir: string, windows: boolean) => {
  const env = redisCommanderInstallEnv(nodeDir, windows)
  return env ? { cwd, shell: false, env } : { cwd, shell: false }
}

const stripQuotes = (value: string) => {
  if (value.length < 2) return value
  const first = value[0]
  const last = value[value.length - 1]
  return (first === '"' || first === "'") && first === last ? value.slice(1, -1) : value
}

export function redisCommanderPaths(baseDir: string, windows: boolean): RedisCommanderPaths {
  const pathJoin = windows ? win32.join : posix.join
  const root = pathJoin(baseDir, 'redis-commander')
  const slash = (value: string) => (windows ? value.replaceAll('/', '\\') : value)
  return {
    root: slash(root),
    entry: slash(
      pathJoin(root, 'node_modules', REDIS_COMMANDER_PACKAGE, 'bin', 'redis-commander.js')
    ),
    pid: slash(pathJoin(root, 'redis-commander.pid')),
    port: slash(pathJoin(root, 'redis-commander.port')),
    credentials: slash(pathJoin(root, 'redis-commander.credentials.json')),
    log: slash(pathJoin(root, 'log')),
    startOut: slash(pathJoin(root, 'log', 'redis-commander.start.out.log')),
    startError: slash(pathJoin(root, 'log', 'redis-commander.start.error.log'))
  }
}

export function redisCommanderInstallManifest() {
  return {
    name: 'flyenv-redis-commander',
    private: true,
    dependencies: { [REDIS_COMMANDER_PACKAGE]: 'latest' }
  }
}

export function redisCommanderConfig(content: string): RedisCommanderConnection {
  let port = 6379
  let password: string | undefined

  for (const rawLine of content.split(/\r?\n/g)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const [key, ...rest] = line.split(/\s+/g)
    const value = stripQuotes(rest.join(' ').trim())
    if (key.toLowerCase() === 'port') {
      const candidate = Number(value)
      if (Number.isInteger(candidate) && candidate >= 1 && candidate <= 65535) {
        port = candidate
      }
    }
    if (key.toLowerCase() === 'requirepass') {
      password = value || undefined
    }
  }

  return password ? { host: '127.0.0.1', port, password } : { host: '127.0.0.1', port }
}

export function redisCommanderArgs(
  connection: RedisCommanderConnection,
  port: number,
  credentials: RedisCommanderCredentials
): string[] {
  const args = [
    '--address',
    '127.0.0.1',
    '--port',
    `${port}`,
    '--redis-host',
    connection.host,
    '--redis-port',
    `${connection.port}`
  ]
  if (connection.password) {
    args.push('--redis-password', connection.password)
  }
  args.push(
    '--http-auth-username',
    credentials.login,
    '--http-auth-password',
    credentials.password,
    '--nosave',
    '--no-log-data'
  )
  return args
}

export function redisCommanderUrl(port: number): string {
  return `http://127.0.0.1:${port}`
}

export function redisCommanderSsoToken(
  credentials: RedisCommanderCredentials,
  now = Date.now(),
  tokenId = randomBytes(16).toString('base64url')
): string {
  const issuedAt = Math.floor(now / 1000)
  const encode = (value: Record<string, string | number>) =>
    Buffer.from(JSON.stringify(value)).toString('base64url')
  const unsigned = [
    encode({ alg: 'HS256', typ: 'JWT' }),
    encode({
      iss: REDIS_COMMANDER_SSO_ISSUER,
      iat: issuedAt,
      exp: issuedAt + REDIS_COMMANDER_SSO_TOKEN_TTL_SECONDS,
      jti: tokenId
    })
  ].join('.')
  const signature = createHmac('sha256', credentials.ssoSecret).update(unsigned).digest('base64url')
  return `${unsigned}.${signature}`
}

export function redisCommanderAutoLoginUrl(
  port: number,
  credentials: RedisCommanderCredentials,
  now?: number,
  tokenId?: string
): string {
  return `${redisCommanderUrl(port)}/sso?access_token=${encodeURIComponent(
    redisCommanderSsoToken(credentials, now, tokenId)
  )}`
}

export function redisCommanderSsoEnvironment(
  credentials: RedisCommanderCredentials
): Record<string, string> {
  return {
    SSO_ENABLED: 'true',
    SSO_JWT_SECRET: credentials.ssoSecret,
    SSO_ISSUER: REDIS_COMMANDER_SSO_ISSUER
  }
}

export function redisCommanderCommandOwned(
  command: string,
  paths: RedisCommanderPaths,
  windows: boolean
): boolean {
  const entry = normalizeForPlatform(paths.entry, windows)
  const normalizedCommand = `${command ?? ''}`.replaceAll('\\', '/')
  const flags = windows ? 'i' : ''
  const expression = new RegExp(`(?:^|[\\s"'])${quoteSafe(entry)}(?=$|[\\s"'])`, flags)
  return expression.test(normalizedCommand)
}

const validCredentials = (value: unknown): value is RedisCommanderCredentials => {
  const item = value as Partial<RedisCommanderCredentials> | undefined
  return (
    !!item &&
    item.login === REDIS_COMMANDER_LOGIN &&
    typeof item.password === 'string' &&
    item.password.length >= 32 &&
    typeof item.ssoSecret === 'string' &&
    item.ssoSecret.length >= 32
  )
}

class RedisCommanderOpenCanceledError extends Error {
  constructor() {
    super('Redis Commander opening was canceled')
  }
}

const processList = async (): Promise<PItem[]> => {
  // 查询失败代表身份未知，不等于没有进程；让停止/打开流程保留失败终态。
  return await (isWindows() ? ProcessPidListStrict() : ProcessListFetch())
}

export type RedisCommanderRuntimeOptions = {
  paths?: RedisCommanderPaths
  platformWindows?: boolean
  processList?: () => Promise<PItem[]>
  listeningPids?: (port: string) => Promise<string[]>
  health?: (port: number, credentials: RedisCommanderCredentials) => Promise<boolean>
  portFinder?: typeof findLoopbackPort
  installer?: (nodeBin: string, paths: RedisCommanderPaths) => Promise<void>
  starter?: (
    node: SoftInstalled,
    paths: RedisCommanderPaths,
    connection: RedisCommanderConnection,
    port: number,
    credentials: RedisCommanderCredentials,
    on: (...args: any[]) => void
  ) => Promise<{ 'APP-Service-Start-PID': string }>
  config?: (redis: SoftInstalled) => Promise<RedisCommanderConnection>
  kill?: (pids: string[]) => Promise<void>
}

export class RedisCommanderRuntime {
  readonly paths: RedisCommanderPaths
  private readonly windows: boolean
  private readonly listProcesses: () => Promise<PItem[]>
  private readonly fetchListeningPids: (port: string) => Promise<string[]>
  private readonly checkHealth: (
    port: number,
    credentials: RedisCommanderCredentials
  ) => Promise<boolean>
  private readonly locatePort: typeof findLoopbackPort
  private readonly installPackage: (nodeBin: string, paths: RedisCommanderPaths) => Promise<void>
  private readonly startPackage: NonNullable<RedisCommanderRuntimeOptions['starter']>
  private readonly readConfig: (redis: SoftInstalled) => Promise<RedisCommanderConnection>
  private readonly killProcesses?: (pids: string[]) => Promise<void>
  private lastHealthError = ''
  private openFlight?: Promise<RedisCommanderOpened>
  private stoppingFlight?: Promise<string[]>
  private openGeneration = 0

  constructor(baseDir: string, options: RedisCommanderRuntimeOptions = {}) {
    this.windows = options.platformWindows ?? isWindows()
    this.paths = options.paths ?? redisCommanderPaths(baseDir, this.windows)
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
    this.readConfig = options.config ?? this.defaultConfig
    // kill 注入只供隔离的 runtime 测试；生产 Windows 路径使用共享快照执行阶段。
    this.killProcesses = options.kill
  }

  private async defaultHealth(
    port: number,
    credentials: RedisCommanderCredentials
  ): Promise<boolean> {
    try {
      const response = await axios.get(redisCommanderUrl(port), {
        timeout: 3000,
        auth: { username: credentials.login, password: credentials.password },
        validateStatus: () => true
      })
      this.lastHealthError = ''
      return response.status >= 200 && response.status < 400
    } catch (error) {
      const item = error as { code?: string; message?: string }
      this.lastHealthError = [item.code, item.message ?? `${error}`].filter(Boolean).join(': ')
      return false
    }
  }

  private async defaultConfig(redis: SoftInstalled): Promise<RedisCommanderConnection> {
    const major = `${redis.version ?? ''}`.split('.')[0]
    if (!major) throw new Error('Redis version is required before opening Redis Commander')
    const configPath = join(global.Server.RedisDir!, `redis-${major}.conf`)
    if (!existsSync(configPath)) {
      throw new Error(`Redis configuration was not found: ${configPath}`)
    }
    return redisCommanderConfig(await readFile(configPath, 'utf8'))
  }

  private async ensureCredentials(): Promise<RedisCommanderCredentialsState> {
    if (existsSync(this.paths.credentials)) {
      try {
        const value = JSON.parse(await readFile(this.paths.credentials, 'utf8'))
        if (validCredentials(value)) return { credentials: value, refreshed: false }
      } catch {}
    }
    const credentials = {
      login: REDIS_COMMANDER_LOGIN,
      password: randomBytes(32).toString('hex'),
      ssoSecret: randomBytes(32).toString('hex')
    }
    return { credentials, refreshed: true }
  }

  private async saveCredentials(credentials: RedisCommanderCredentials): Promise<void> {
    await writeFile(this.paths.credentials, JSON.stringify(credentials), { mode: 0o600 })
    await chmod(this.paths.credentials, 0o600).catch(() => {})
  }

  private async defaultInstall(nodeBin: string, paths: RedisCommanderPaths): Promise<void> {
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
    let manifest = redisCommanderInstallManifest()
    if (existsSync(manifestPath)) {
      try {
        const current = JSON.parse(await readFile(manifestPath, 'utf8'))
        manifest = {
          ...current,
          name: current.name ?? manifest.name,
          private: true,
          dependencies: { ...current.dependencies, ...manifest.dependencies }
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
      REDIS_COMMANDER_PACKAGE
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
    if (!existsSync(paths.entry)) {
      throw new Error('Redis Commander package installation did not produce its entry script')
    }
  }

  private async defaultStart(
    node: SoftInstalled,
    paths: RedisCommanderPaths,
    connection: RedisCommanderConnection,
    port: number,
    credentials: RedisCommanderCredentials,
    on: (...args: any[]) => void
  ) {
    const item = {
      typeFlag: 'redis',
      version: 'redis-commander',
      bin: node.bin,
      path: paths.root
    } as SoftInstalled
    return serviceStartSpawn({
      version: item,
      pidPath: paths.pid,
      baseDir: paths.root,
      bin: node.bin,
      execArgs: [paths.entry, ...redisCommanderArgs(connection, port, credentials)],
      cwd: paths.root,
      outFile: paths.startOut,
      errFile: paths.startError,
      on,
      waitTime: 2000,
      execEnv: redisCommanderSsoEnvironment(credentials),
      sensitive: true
    })
  }

  private async readPort(): Promise<number | undefined> {
    if (!existsSync(this.paths.port)) return undefined
    try {
      const port = Number((await readFile(this.paths.port, 'utf8')).trim())
      return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : undefined
    } catch {
      return undefined
    }
  }

  private async ownedPids(pid: string, processes?: PItem[]): Promise<string[]> {
    const list = processes ?? (await this.listProcesses())
    const root = list.find((item) => `${item.PID}` === `${pid}`)
    // 根缺席、不可读或归属不匹配返回空集合，不让单个文件候选阻断其他面板树。
    if (
      !isReadableServiceStopRoot(root, this.windows) ||
      !redisCommanderCommandOwned(root.COMMAND, this.paths, this.windows)
    )
      return []
    return ProcessListByExactPid(`${pid}`, list).map(({ PID }) => PID)
  }

  private async waitHealth(port: number, credentials: RedisCommanderCredentials): Promise<boolean> {
    this.lastHealthError = ''
    for (let attempt = 0; attempt < REDIS_COMMANDER_HEALTH_ATTEMPTS; attempt += 1) {
      if (await this.checkHealth(port, credentials)) return true
      if (attempt + 1 < REDIS_COMMANDER_HEALTH_ATTEMPTS) {
        await waitTime(REDIS_COMMANDER_HEALTH_INTERVAL_MILLISECONDS)
      }
    }
    return false
  }

  private async startupDiagnostics(port: number, pid: string, nodeBin: string): Promise<string> {
    const readTail = async (file: string) => {
      try {
        const content = `${await readFile(file, 'utf8')}`.trim()
        return content.length > REDIS_COMMANDER_STARTUP_LOG_TAIL_LENGTH
          ? content.slice(-REDIS_COMMANDER_STARTUP_LOG_TAIL_LENGTH)
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
      `healthError=${this.lastHealthError || '<none>'}`,
      `listeningPids=${listeningPids.join(',') || '<none>'}`,
      `stdout=${stdout || '<empty>'}`,
      `stderr=${stderr || '<empty>'}`
    ].join('\n')
  }

  private async stopPids(pids: string[], failureMessage: string, list: PItem[]): Promise<PItem[]> {
    // 所有查询/kill provider 的空目标都保留首次列表，避免误删被过滤的活 PID。
    if (!pids.length) return list
    if (this.windows && !this.killProcesses) {
      // 候选归属使用的首次完整快照直达共享停止与退出确认，不再二次采样后杀树。
      return stopWindowsServiceProcesses(pids, list)
    }
    let killError: unknown
    try {
      if (this.killProcesses) await this.killProcesses(pids)
      else await ProcessKillStrict('-INT', pids)
    } catch (error) {
      // 某 PID 可能在信号前自然退出；记录错误后仍确认原目标是否全部消失。
      killError = error
    }
    try {
      // 面板异步退出和自定义 kill 注入同样使用公共等待；保留 100ms 间隔，
      // 但十秒按真实经过时间计量，不再是 100 次查询加睡眠的累计上限。
      return await waitForServiceProcessExit(pids, 10_000, {
        fetchList: () => this.listProcesses(),
        initialList: list,
        pollDelayMs: 100
      })
    } catch (error) {
      if (!killError && error instanceof ServiceProcessExitTimeoutError) {
        throw new Error(failureMessage)
      }
      throw killError ?? error
    }
  }

  private assertOpenActive(generation: number) {
    if (generation !== this.openGeneration) {
      throw new RedisCommanderOpenCanceledError()
    }
  }

  private async openInternal(
    node: SoftInstalled,
    redis: SoftInstalled,
    on: (...args: any[]) => void,
    generation: number
  ): Promise<RedisCommanderOpened> {
    try {
      const nodeBin = `${node?.bin ?? ''}`.trim()
      if (!nodeBin) {
        throw new Error('A Node.js version must be selected before opening Redis Commander')
      }

      const connection = await this.readConfig(redis)
      this.assertOpenActive(generation)
      await mkdirp(this.paths.root)
      const credentialsState = await this.ensureCredentials()
      const credentials = credentialsState.credentials
      this.assertOpenActive(generation)
      const persistedPid = existsSync(this.paths.pid)
        ? (await readFile(this.paths.pid, 'utf8')).trim()
        : ''
      const persistedPort = await this.readPort()

      if (persistedPid || persistedPort) {
        const persistedList = await this.listProcesses()
        const pids = persistedPid ? await this.ownedPids(persistedPid, persistedList) : []
        // 打开与停止采用不同终态：筛选为空不能授权覆盖仍存活的旧实例记录。
        if (!pids.length && persistedList.some(({ PID }) => PID === persistedPid)) {
          throw new Error(
            `Cannot restart Redis Commander with an unverified active root; PID=${persistedPid}`
          )
        }
        const listening =
          !!persistedPid &&
          !!persistedPort &&
          pids.length > 0 &&
          (await this.fetchListeningPids(`${persistedPort}`)).includes(persistedPid)
        if (
          persistedPid &&
          persistedPort &&
          !credentialsState.refreshed &&
          listening &&
          (await this.checkHealth(persistedPort, credentials))
        ) {
          this.assertOpenActive(generation)
          return { pid: persistedPid, port: persistedPort, credentials, nodeBin }
        }
        let finalList = persistedList
        if (pids.length > 0) {
          finalList = await this.stopPids(
            pids,
            'Redis Commander did not stop before restart',
            persistedList
          )
        }
        if (this.windows) {
          await cleanupStoppedServicePidFiles([persistedPid, ...pids], finalList, [this.paths.pid])
        } else {
          await remove(this.paths.pid).catch(() => {})
        }
        await remove(this.paths.port).catch(() => {})
        this.assertOpenActive(generation)
      }

      if (!existsSync(this.paths.entry)) {
        on(webPanelInstallNotice('Redis Commander'))
        await this.installPackage(nodeBin, this.paths)
        this.assertOpenActive(generation)
      }
      const port = await this.locatePort(
        REDIS_COMMANDER_DEFAULT_PORT,
        REDIS_COMMANDER_PORT_SCAN_COUNT,
        REDIS_COMMANDER_MAX_PORT,
        persistedPort ? [persistedPort] : []
      )
      this.assertOpenActive(generation)
      if (credentialsState.refreshed) {
        await this.saveCredentials(credentials)
        this.assertOpenActive(generation)
      }
      const start = await this.startPackage(node, this.paths, connection, port, credentials, on)
      this.assertOpenActive(generation)
      if (!(await this.waitHealth(port, credentials))) {
        const diagnostics = await this.startupDiagnostics(
          port,
          start['APP-Service-Start-PID'],
          nodeBin
        )
        throw new Error(`Redis Commander did not become healthy after startup\n${diagnostics}`)
      }
      this.assertOpenActive(generation)
      const startedPid = start['APP-Service-Start-PID']
      const listeningPids = await this.fetchListeningPids(`${port}`)
      this.assertOpenActive(generation)
      if (!listeningPids.includes(startedPid)) {
        throw new Error('Redis Commander does not own its allocated loopback port')
      }
      await writeFile(this.paths.port, `${port}`)
      this.assertOpenActive(generation)
      return { pid: startedPid, port, credentials, nodeBin }
    } catch (error) {
      if (!(error instanceof RedisCommanderOpenCanceledError)) {
        await this.stopOwned().catch(() => {})
      }
      throw error
    }
  }

  private openResult(opened: RedisCommanderOpened): RedisCommanderOpenResult {
    return {
      url: redisCommanderAutoLoginUrl(opened.port, opened.credentials),
      'APP-Service-Start-PID': opened.pid,
      'APP-Service-Start-Item': {
        typeFlag: 'redis',
        version: 'redis-commander',
        bin: opened.nodeBin,
        path: this.paths.root
      } as SoftInstalled
    }
  }

  open(
    node: SoftInstalled,
    redis: SoftInstalled,
    on: (...args: any[]) => void = () => {}
  ): ForkPromise<RedisCommanderOpenResult> {
    return new ForkPromise((resolve, reject) => {
      const start = async () => {
        if (this.stoppingFlight) await this.stoppingFlight
        if (!this.openFlight) {
          const generation = this.openGeneration
          this.openFlight = this.openInternal(node, redis, on, generation).finally(() => {
            this.openFlight = undefined
          })
        }
        return this.openFlight
      }
      start()
        .then((opened) => resolve(this.openResult(opened)))
        .catch(reject)
    })
  }

  private async stopOwned(): Promise<string[]> {
    const pid = existsSync(this.paths.pid) ? (await readFile(this.paths.pid, 'utf8')).trim() : ''
    // 私有 PID 文件遺失時，僅從帶有本次私有 entry/workspace 標記的命令恢復根；
    // 不按共用 Node 執行檔掃描，以免把其他 Node 應用納入停止目標。
    // 初始停止发现参加主进程批次；注入 provider 保留，活性/确认查询仍取新表。
    const list =
      this.listProcesses === processList ? await StopProcessListFetch() : await this.listProcesses()
    const candidates = new Set([pid])
    list
      .filter(({ COMMAND }) => redisCommanderCommandOwned(COMMAND, this.paths, this.windows))
      .forEach(({ PID }) => candidates.add(`${PID}`))
    const pids = Array.from(
      new Set(
        (
          await Promise.all(
            [...candidates].filter(Boolean).map((value) => this.ownedPids(value, list))
          )
        ).flat()
      )
    )
    let finalList = list
    if (this.windows) {
      finalList = await this.stopPids(pids, 'Redis Commander did not stop', list)
    } else if (pids.length > 0) {
      finalList = await this.stopPids(pids, 'Redis Commander did not stop', list)
    }
    // 筛选为空不能无条件删记录；所有平台保留活的被过滤候选及其端口。
    await cleanupStoppedServicePidFiles([...candidates, ...pids], finalList, [this.paths.pid])
    if (!existsSync(this.paths.pid)) await remove(this.paths.port)
    return pids
  }

  async stop(): Promise<string[]> {
    if (this.stoppingFlight) return this.stoppingFlight

    this.openGeneration += 1
    const pendingOpen = this.openFlight
    const flight = (async () => {
      if (pendingOpen) await pendingOpen.catch(() => {})
      return this.stopOwned()
    })()
    this.stoppingFlight = flight
    try {
      return await flight
    } finally {
      if (this.stoppingFlight === flight) this.stoppingFlight = undefined
    }
  }
}
