import { join, dirname, win32 } from 'path'
import { existsSync, readdirSync } from 'fs'
import { Base } from '../Base'
import { I18nT } from '@lang/runtime'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import {
  AppLog,
  brewInfoJson,
  brewSearch,
  getSubDirAsync,
  portSearch,
  versionBinVersion,
  versionFilterSame,
  versionFixed,
  versionLocalFetch,
  versionMacportsFetch,
  versionSort,
  waitTime,
  chmod,
  copyFile,
  readFile,
  unlink,
  writeFile,
  serviceStartExecCMD,
  mkdirp,
  execPromiseWithEnv,
  spawnPromiseWithEnv,
  remove
} from '../../Fn'
import { serviceStartSpawn } from '../../util/ServiceStart'
import { ForkPromise } from '@shared/ForkPromise'
import axios from 'axios'
import TaskQueue from '../../TaskQueue'
import { appDebugLog, isMacOS, isWindows } from '@shared/utils'
import {
  fetchLoopbackListeningPids,
  ProcessKillStrict,
  ProcessListByExactPid,
  ProcessListFetch,
  type PItem
} from '@shared/Process'
import {
  fetchLoopbackListeningPids as fetchLoopbackListeningPidsWindows,
  ProcessPidListStrict
} from '@shared/Process.win'
import { StopProcessListFetch, fetchStopProcessListLocal } from '@shared/StopProcessList'
import { isReadableServiceStopRoot } from '@shared/ProcessSnapshot'
import { webPanelInstallNotice } from '@shared/WebPanelInstallNotice'
import {
  assertPgAdminRegistrationPort,
  assertPgAdminPythonVersion,
  completePgAdminInitialization,
  findPgAdminPort,
  PGADMIN4_DEFAULT_PORT,
  PGADMIN4_PACKAGE,
  pgAdminCommandOwned,
  pgAdminOwnedPidsWithoutPackageMetadata,
  pgAdminConfigContent,
  pgAdminDesktopBootstrapContent,
  pgAdminDesktopInitializationVerificationContent,
  pgAdminDesktopServerIdentityContent,
  pgAdminDesktopServerReconciliationContent,
  pgAdminInitializationState,
  pgAdminOwnedPids,
  pgAdminPackageRootOwned,
  pgAdminPackageRootProbe,
  pgAdminPackageRootUnversionedProbe,
  pgAdminPortOwnedByProcessTree,
  pgAdminPaths,
  pgAdminPrivateDirectories,
  parsePgAdminServerIdentity,
  pgAdminRuntimePythonPath,
  pgAdminServersContent,
  pgAdminUrl,
  PgAdminSingleFlight,
  postgresqlPortFromConfig,
  startPgAdminWithPortRetry,
  stopPgAdminPidsWithVerification,
  type PgAdminServerIdentity,
  verifyPgAdminPidPersistence,
  waitForPgAdminHealth,
  waitForPostgresqlProcess
} from './pgAdmin'

type PgAdminOpenResult = {
  url: string
  'APP-Service-Start-PID': string
}

/**
 * 以完整 -D 参数识别数据库实例，避免相似前缀的数据目录被混为同一服务。
 * Unix/macOS 只依赖命令参数和 postgres 程序名，不要求易变化的完整可执行路径。
 */
const postgresCommandUsesDataDirectory = (
  command: string,
  dataDirectory: string,
  windows = false
) => {
  const normalizePath = (value: string) => {
    const normalized = value.replace(/\\/g, '/')
    return windows ? normalized.toLowerCase() : normalized
  }
  const directory = normalizePath(dataDirectory)
  const escapedDirectory = directory.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const normalizedCommand = normalizePath(command)
  const dataDirectoryFlag = windows ? '-[dD]' : '-D'
  const postgresExecutable = /(?:^|[/\s])postgres(?:\.exe)?(?=["'\s]|$)/i
  const dataDirectoryArgument = new RegExp(
    `(?:^|\\s)${dataDirectoryFlag}(?:\\s+|=)(?:"${escapedDirectory}"|'${escapedDirectory}'|${escapedDirectory})(?=\\s|$)`
  )
  return postgresExecutable.test(normalizedCommand) && dataDirectoryArgument.test(normalizedCommand)
}

class Manager extends Base {
  private readonly pgAdminOpenFlight = new PgAdminSingleFlight<PgAdminOpenResult>()

  constructor() {
    super()
    this.type = 'postgresql'
  }

  init() {}

  getConfigFiles(version?: SoftInstalled) {
    const versionTop = version?.version?.split('.')?.shift() ?? ''
    if (!versionTop) return []
    const dbPath = join(global.Server.PostgreSqlDir!, `postgresql${versionTop}`)
    return [{ name: 'main', path: join(dbPath, 'postgresql.conf') }]
  }

  getLogFiles(version?: SoftInstalled) {
    const versionTop = version?.version?.split('.')?.shift() ?? ''
    if (!versionTop) return []
    const dbPath = join(global.Server.PostgreSqlDir!, `postgresql${versionTop}`)
    const paths = this.pgAdminPaths()
    return [
      { name: 'log', path: join(dbPath, 'pg.log') },
      { name: 'pgadmin4', path: join(paths.log, 'pgadmin4.log') },
      { name: 'pgadmin4-start-out', path: join(paths.log, 'pgadmin4.start.out.log') },
      { name: 'pgadmin4-start-error', path: join(paths.log, 'pgadmin4.start.err.log') }
    ]
  }

  private pgAdminPaths() {
    return pgAdminPaths(global.Server.PostgreSqlDir!, isWindows())
  }

  private async pgAdminPackageRoot(
    pythonBin: string,
    probe: () => string = pgAdminPackageRootProbe
  ): Promise<string> {
    const result = await spawnPromiseWithEnv(pythonBin, ['-c', probe()], {
      shell: false
    })
    const root = result.stdout.trim()
    if (
      !root ||
      !existsSync(join(root, 'pgadmin')) ||
      !existsSync(join(root, 'pgAdmin4.py')) ||
      !existsSync(join(root, 'setup.py'))
    ) {
      throw new Error('pgAdmin package directory was not found')
    }
    return root
  }

  private async pgAdminPackageRootUnversioned(pythonBin: string): Promise<string> {
    return this.pgAdminPackageRoot(pythonBin, pgAdminPackageRootUnversionedProbe)
  }

  private async validatePgAdminPythonVersion(pythonBin: string, source: string): Promise<void> {
    const result = await spawnPromiseWithEnv(
      pythonBin,
      [
        '-c',
        'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}")'
      ],
      {
        shell: false
      }
    )
    assertPgAdminPythonVersion(result.stdout, source)
  }

  private async pgAdminRunningPid(packageRoot: string): Promise<string | undefined> {
    const paths = this.pgAdminPaths()
    const pid = await this.readPidFromFile(paths.pid)
    const processList = await fetchStopProcessListLocal()
    const process = pid ? processList.find((item) => item.PID === pid) : undefined
    const command = process?.COMMAND
    // 活 PID 的空命令行或不匹配命令属于身份未知；不能删登记或当成无实例继续启动。
    if (process && !command) throw new Error(`Cannot verify pgAdmin process PID=${pid}`)
    if (pid && pgAdminCommandOwned(command ?? '', paths, packageRoot, isWindows())) {
      return pid
    }
    if (pid) {
      if (process) throw new Error(`pgAdmin PID=${pid} is active but ownership is unknown`)
      if (processList.some(({ PPID }) => `${PPID}` === pid)) {
        throw new Error(`Cannot verify pgAdmin descendants for PID=${pid}`)
      }
      // 只删仍保存本次确认已退出 PID 的旧文件，避免覆盖并发写入的新登记。
      if ((await this.readPidFromFile(paths.pid)) === pid) await remove(paths.pid)
    }
    const ownedPids = pgAdminOwnedPids(processList, paths, packageRoot, isWindows())
    return ownedPids.length === 1 ? ownedPids[0] : undefined
  }

  private async pgAdminOwnedProcessPids(packageRoot: string): Promise<string[]> {
    const paths = this.pgAdminPaths()
    const processList = await fetchStopProcessListLocal()
    return pgAdminOwnedPids(processList, paths, packageRoot, isWindows())
  }

  private async pgAdminFallbackOwnedProcessPids(): Promise<string[]> {
    const paths = this.pgAdminPaths()
    const processList = await fetchStopProcessListLocal()
    return pgAdminOwnedPidsWithoutPackageMetadata(processList, paths, isWindows())
  }

  private async pgAdminPortOwnedByPid(port: number, pid: string): Promise<boolean> {
    const listeningPids = isWindows()
      ? await fetchLoopbackListeningPidsWindows(`${port}`)
      : await fetchLoopbackListeningPids(`${port}`)
    if (listeningPids.includes(pid)) return true

    const processList = await fetchStopProcessListLocal()
    return pgAdminPortOwnedByProcessTree(listeningPids, pid, processList)
  }

  private async pgAdminPidsStillRunning(pids: string[]): Promise<string[]> {
    const processList = isWindows() ? await ProcessPidListStrict() : await ProcessListFetch()
    const activePids = new Set(processList.map((process) => `${process.PID}`))
    return pids.filter((pid) => activePids.has(pid))
  }

  private async stopPgAdminPidsStrict(pids: string[], processList?: PItem[]): Promise<PItem[]> {
    if (isWindows()) {
      // pgAdmin 根已按私有目录确认；Base 把首次快照身份送入统一权限树停止并返回最终列表。
      // 未传首表时加入 main 的发现共享；已传列表时继续原采样，不额外查询。
      const initialList = processList ?? (await StopProcessListFetch())
      return this.stopWindowsServiceProcesses(pids, initialList)
    }
    await stopPgAdminPidsWithVerification({
      pids,
      kill: async (targetPids) => {
        await ProcessKillStrict('-INT', targetPids)
      },
      remainingPids: () => this.pgAdminPidsStillRunning(pids),
      wait: waitTime
    })
    return fetchStopProcessListLocal()
  }

  private async pgAdminHttpReachable(port: number): Promise<boolean> {
    try {
      await axios.get(pgAdminUrl(port), {
        timeout: 3000,
        validateStatus: () => true
      })
      return true
    } catch {
      return false
    }
  }

  private async _stopPGAdmin(packageRoot?: string): Promise<string[]> {
    const paths = this.pgAdminPaths()
    const root =
      packageRoot ?? (await this.pgAdminPackageRootUnversioned(paths.python).catch(() => ''))
    // pgAdmin 的停止前发现共享 main 完整列表，启动检查与最终确认仍独立新查。
    const processList = await StopProcessListFetch()
    const pid = await this.readPidFromFile(paths.pid)
    // 私有记录只是候选；只选可读且配置归属明确的根，不强行追加文件中的陌生 PID。
    // 包元数据可用/缺失只改变模块的匹配规则，共用同一树收集、执行与清理流程。
    const readableRoots = processList.filter((process) => isReadableServiceStopRoot(process))
    const roots =
      root && pgAdminPackageRootOwned(root, paths, isWindows())
        ? pgAdminOwnedPids(readableRoots, paths, root, isWindows())
        : pgAdminOwnedPidsWithoutPackageMetadata(readableRoots, paths, isWindows())
    // 后代取自未过滤的原完整列表；父已确认就无需每个 worker 的身份字段可读。
    const pids = [
      ...new Set(
        roots.flatMap((pid) => ProcessListByExactPid(pid, processList).map(({ PID }) => PID))
      )
    ]
    const after = pids.length ? await this.stopPgAdminPidsStrict(pids, processList) : processList
    await this.cleanupStoppedServicePidFiles([pid, ...pids].filter(Boolean), after, [paths.pid])
    // 被过滤的活候选保留 PID 与端口，供以后重试；过滤不等于已退出。
    if (!existsSync(paths.pid)) await remove(paths.port)
    return pids
  }

  openPGAdmin(
    version: SoftInstalled,
    dataDir: string,
    python: SoftInstalled
  ): ForkPromise<PgAdminOpenResult> {
    return new ForkPromise((resolve, reject, on) => {
      this.pgAdminOpenFlight
        .run(() =>
          this.openPGAdminInternal(version, dataDir, python)
            .on(on)
            .then((result) => result)
        )
        .then(resolve, reject)
    })
  }

  private openPGAdminInternal(
    version: SoftInstalled,
    dataDir: string,
    python: SoftInstalled
  ): ForkPromise<PgAdminOpenResult> {
    return new ForkPromise(async (resolve, reject, on) => {
      try {
        const paths = this.pgAdminPaths()
        const state = await pgAdminInitializationState(paths, existsSync, (file) =>
          readFile(file, 'utf-8')
        )
        let firstStart = !state.initialized
        let serverIdentity: PgAdminServerIdentity | undefined = state.identity
        const postgreSqlPort = postgresqlPortFromConfig(
          await readFile(join(dataDir, 'postgresql.conf'), 'utf-8')
        )
        assertPgAdminRegistrationPort(postgreSqlPort)
        if (!python?.bin || !existsSync(python.bin)) {
          throw new Error('A selected Python binary is required')
        }
        await this.validatePgAdminPythonVersion(python.bin, 'selected Python')
        if (firstStart) {
          on(webPanelInstallNotice('pgAdmin 4'))
        }

        await mkdirp(paths.root)
        await mkdirp(paths.data)
        await mkdirp(paths.log)
        await Promise.all(
          pgAdminPrivateDirectories(paths, isWindows()).map((directory) => chmod(directory, 0o700))
        )
        if (!existsSync(paths.venv)) {
          await spawnPromiseWithEnv(python.bin, ['-m', 'venv', paths.venv], { shell: false })
        }
        if (!existsSync(paths.python)) {
          throw new Error('pgAdmin virtual environment Python was not created')
        }

        await this.validatePgAdminPythonVersion(paths.python, 'pgAdmin virtual environment')

        let packageRoot = ''
        let packageRepaired = false
        try {
          packageRoot = await this.pgAdminPackageRoot(paths.python)
        } catch {}
        if (!packageRoot) {
          await this._stopPGAdmin()
          packageRepaired = true
          await spawnPromiseWithEnv(
            paths.python,
            ['-m', 'pip', 'install', '--disable-pip-version-check', '--upgrade', PGADMIN4_PACKAGE],
            { shell: false }
          )
          packageRoot = await this.pgAdminPackageRoot(paths.python)
        }
        if (packageRepaired) {
          await this._stopPGAdmin(packageRoot)
        }

        const reconcilePgAdminServer = async () => {
          if (!serverIdentity) {
            throw new Error('pgAdmin FlyEnv PostgreSQL server identity was not found')
          }
          await writeFile(paths.reconciliation, pgAdminDesktopServerReconciliationContent())
          await spawnPromiseWithEnv(
            paths.python,
            [
              paths.reconciliation,
              packageRoot,
              `${serverIdentity.userId}`,
              `${serverIdentity.serverId}`,
              `${postgreSqlPort}`
            ],
            { shell: false, cwd: packageRoot }
          )
        }
        if (!firstStart) {
          await reconcilePgAdminServer()
        }

        const runningPid = await this.pgAdminRunningPid(packageRoot)
        if (runningPid && !firstStart && existsSync(paths.port)) {
          const port = Number((await readFile(paths.port, 'utf-8')).trim())
          if (
            Number.isInteger(port) &&
            port >= 1 &&
            port <= 65535 &&
            (await this.pgAdminPortOwnedByPid(port, runningPid)) &&
            (await this.pgAdminHttpReachable(port))
          ) {
            resolve({
              url: pgAdminUrl(port),
              'APP-Service-Start-PID': runningPid
            })
            return
          }
          await remove(paths.port).catch(() => {})
        }
        if (!runningPid && existsSync(paths.port)) {
          await remove(paths.port).catch(() => {})
        }
        const ownedPids = await this.pgAdminOwnedProcessPids(packageRoot)
        if (runningPid || ownedPids.length > 0) {
          await this._stopPGAdmin(packageRoot)
        }

        const { port, result: started } = await startPgAdminWithPortRetry({
          findPort: (excluded) => findPgAdminPort(PGADMIN4_DEFAULT_PORT, excluded),
          writeConfig: async (port) => {
            await writeFile(
              join(packageRoot, 'config_local.py'),
              pgAdminConfigContent(paths.data, paths.log, port)
            )
          },
          start: async () => {
            if (firstStart) {
              await writeFile(paths.servers, pgAdminServersContent(postgreSqlPort))
              await spawnPromiseWithEnv(paths.python, [join(packageRoot, 'setup.py'), 'setup-db'], {
                shell: false
              })
              await writeFile(paths.bootstrap, pgAdminDesktopBootstrapContent())
              await spawnPromiseWithEnv(paths.python, [paths.bootstrap, packageRoot], {
                shell: false,
                cwd: packageRoot
              })
              await spawnPromiseWithEnv(
                paths.python,
                [join(packageRoot, 'setup.py'), 'load-servers', paths.servers],
                { shell: false }
              )
              await spawnPromiseWithEnv(
                paths.python,
                [paths.bootstrap, packageRoot, `${postgreSqlPort}`],
                { shell: false, cwd: packageRoot }
              )
              await writeFile(paths.verification, pgAdminDesktopInitializationVerificationContent())
              await completePgAdminInitialization({
                verify: async () => {
                  await spawnPromiseWithEnv(
                    paths.python,
                    [paths.verification, packageRoot, `${postgreSqlPort}`],
                    { shell: false, cwd: packageRoot }
                  )
                },
                markInitialized: async () => {
                  await writeFile(paths.identityScript, pgAdminDesktopServerIdentityContent())
                  const identityResult = await spawnPromiseWithEnv(
                    paths.python,
                    [paths.identityScript, packageRoot, `${postgreSqlPort}`],
                    { shell: false, cwd: packageRoot }
                  )
                  serverIdentity = parsePgAdminServerIdentity(identityResult.stdout)
                  await writeFile(paths.identity, JSON.stringify(serverIdentity))
                  await writeFile(paths.desktopMode, '1')
                  await writeFile(paths.initialized, '1')
                }
              })
              firstStart = false
            }

            await reconcilePgAdminServer()

            try {
              const servicePython = pgAdminRuntimePythonPath(paths.python, isWindows(), existsSync)
              const started = await serviceStartSpawn({
                version: {
                  typeFlag: version.typeFlag,
                  version: 'pgadmin4',
                  bin: servicePython,
                  path: paths.root,
                  num: null,
                  enable: true,
                  run: false,
                  running: false
                },
                pidPath: paths.pid,
                baseDir: paths.root,
                bin: servicePython,
                execArgs: [join(packageRoot, 'pgAdmin4.py')],
                execEnv: {
                  LC_ALL: global.Server.Local!,
                  LANG: global.Server.Local!
                },
                on,
                waitTime: 2000,
                cwd: packageRoot,
                outFile: join(paths.log, 'pgadmin4.start.out.log'),
                errFile: join(paths.log, 'pgadmin4.start.err.log')
              })
              const startedPid = `${started['APP-Service-Start-PID']}`.trim()
              await verifyPgAdminPidPersistence({
                spawnedPid: startedPid,
                readPersistedPid: () => this.readPidFromFile(paths.pid),
                stopPid: async (pid) => {
                  await this.stopPgAdminPidsStrict([pid])
                },
                clearPid: async () => {
                  await remove(paths.pid).catch(() => {})
                }
              })
              return started
            } catch (error) {
              await this._stopPGAdmin(packageRoot)
              throw error
            }
          },
          cleanupStartFailure: async () => {
            await this._stopPGAdmin(packageRoot)
          },
          isHealthy: async (port, started) => {
            const startedPid = `${started['APP-Service-Start-PID']}`.trim()
            if (!startedPid) return false
            return waitForPgAdminHealth({
              isPortOwned: () => this.pgAdminPortOwnedByPid(port, startedPid),
              isHttpReachable: () => this.pgAdminHttpReachable(port),
              wait: waitTime
            })
          },
          persistPort: async (port) => {
            await writeFile(paths.port, `${port}`)
          },
          cleanupStarted: async (started) => {
            const startedPid = `${started['APP-Service-Start-PID']}`.trim()
            if (startedPid) {
              await this.stopPgAdminPidsStrict([startedPid])
            }
            await remove(paths.pid).catch(() => {})
          },
          clearPort: async () => {
            await remove(paths.port).catch(() => {})
          }
        })
        resolve({
          url: pgAdminUrl(port),
          'APP-Service-Start-PID': `${started['APP-Service-Start-PID']}`
        })
      } catch (error) {
        reject(error)
      }
    })
  }

  /** DATA_DIR 是实例身份的一部分；退出沿用启动目录，不重新读取已编辑的设置。 */
  serviceStopArgs(pid: string, version: SoftInstalled, DATA_DIR?: string): any[] {
    const major = version?.version?.split('.')?.shift() ?? ''
    return [
      { ...version, pid },
      DATA_DIR ?? join(global.Server.PostgreSqlDir!, `postgresql${major}`)
    ]
  }

  /** pgAdmin 可独立打开，单独停止不会关闭 PostgreSQL 数据目录。 */
  companionStopArgs(command: string, pid: string, args: any[]): any[] | undefined {
    if (command === 'openPGAdmin') return [{ ...args[0], pid }, args[1], true]
  }

  _stopServer(
    version: SoftInstalled,
    DATA_DIR?: string,
    pgAdminOnly = false
  ): ForkPromise<{ 'APP-Service-Stop-PID': number[] }> {
    return new ForkPromise(async (resolve, reject, on) => {
      const appPidFile = this.appPidFile()
      const appPidBefore = existsSync(appPidFile) ? await this.readPidFromFile(appPidFile) : ''
      const pgAdminPids = await this._stopPGAdmin()
      if (pgAdminOnly) {
        resolve({ 'APP-Service-Stop-PID': pgAdminPids.map(Number) })
        return
      }
      const bin = version.bin
      const versionTop = version?.version?.split('.')?.shift() ?? ''
      const dbPath = DATA_DIR ?? join(global.Server.PostgreSqlDir!, `postgresql${versionTop}`)
      const logFile = join(dbPath, 'pg.log')
      const postmasterPidFile = join(dbPath, 'postmaster.pid')
      // 仅在停止开始前读取的 PID 可成为本次清理候选；不得把停止期间覆盖的新值认成本实例。
      const postmasterPidBefore = existsSync(postmasterPidFile)
        ? await this.readPidFromFile(postmasterPidFile)
        : ''
      // Windows 的共享树停止器返回最终快照，后续残留判断和登记清理共用它；
      // Unix/macOS 则在原生关闭确认循环中保存最后一次完整进程列表。
      let finalProcessList: PItem[] | undefined

      const doStop = async () => {
        try {
          await spawnPromiseWithEnv(bin, ['stop', '-D', dbPath, '-l', logFile], {
            cwd: dirname(bin),
            shell: false
          })
        } catch (e) {
          // pg_ctl 失败不代表服务已经退出；原错误必须上交，保留 PID/登记供用户重试。
          appDebugLog(
            `[PostgreSql][_stopServer][error]`,
            `${(e as NodeJS.ErrnoException)?.code ?? 'pg_ctl failed'}`
          ).catch()
          console.log('PostgreSQL shutdown failed', (e as NodeJS.ErrnoException)?.code)
          throw e
        }
      }

      if (!isWindows()) {
        const pidFile = postmasterPidFile
        await doStop()
        let pidFileRemoved = false
        for (let attempt = 0; attempt < 10; attempt += 1) {
          if (!existsSync(pidFile)) {
            pidFileRemoved = true
            break
          }
          await waitTime(1000)
        }
        if (!pidFileRemoved && !existsSync(pidFile)) pidFileRemoved = true
        if (!pidFileRemoved) {
          throw new Error('PostgreSQL postmaster.pid still exists after the stop request')
        }

        // PID 文件消失只是辅助证据；还需用精确 DATA_DIR 参数确认数据库进程退出。
        // macOS 在退出确认后仍保留共享内存清理等待；查询失败或超时都不能报成功。
        for (let attempt = 0; attempt < 15; attempt += 1) {
          const plist = await fetchStopProcessListLocal()
          finalProcessList = plist
          const postgresProcs = plist.filter((process) =>
            postgresCommandUsesDataDirectory(process.COMMAND, dbPath)
          )
          if (!postgresProcs.length) break
          if (attempt === 14) {
            throw new Error('PostgreSQL processes are still running after the stop request')
          }
          await waitTime(1000)
        }
        if (isMacOS()) {
          // Keep the existing macOS delay after postgres releases its shared memory.
          await waitTime(500)
        }
      } else {
        // Windows 关闭由本模块负责。根须同时匹配当前数据目录参数和本版本 postgres.exe；
        // pgAdmin、其他数据目录或被复用的 stale PID 均不能触发数据库原生关闭。
        const list = await ProcessPidListStrict()
        // 首次严格列表同时承担所有权发现和后续 Windows 树停止的创建时间证明。
        finalProcessList = list
        const exe = win32.normalize(join(dirname(bin), 'postgres.exe')).toLowerCase()
        const roots = list.filter(
          (process) =>
            isReadableServiceStopRoot(process, true) &&
            postgresCommandUsesDataDirectory(process.COMMAND, dbPath, true) &&
            !!process.EXECUTABLE &&
            win32.normalize(process.EXECUTABLE).toLowerCase() === exe
        )
        const recordedPid = postmasterPidBefore
        // pg_ctl 从 postmaster.pid 取目标。文件中的根未通过本实例归属筛选时，
        // 过滤本次数据库关闭，不以其他有效根替代文件授权；已确认的 companion 仍继续。
        const targets = roots.some(({ PID }) => PID === recordedPid)
          ? [
              ...new Set(
                roots.flatMap(({ PID }) => ProcessListByExactPid(PID, list).map(({ PID }) => PID))
              )
            ]
          : []
        if (targets.length) {
          // pg_ctl 使用 postmaster.pid 定位根；先确认文件没有指向另一实例，再关闭。
          let shutdownError: unknown
          try {
            // fast 仍是数据库有序关闭，-w/-t 明确等待与上限；绝对 bin/参数数组
            // 支持中文和空格目录，不依赖 PATH。失败不退为 OS 强杀数据库。
            await spawnPromiseWithEnv(
              bin,
              ['stop', '-D', dbPath, '-l', logFile, '-m', 'fast', '-w', '-t', '10'],
              { cwd: dirname(bin), shell: false, timeout: 20_000, windowsHide: true }
            )
          } catch (error) {
            shutdownError = error
          }
          try {
            // 原生 fast 关闭后复用公共等待的最终列表，不能再另做一次全量查询。
            finalProcessList = await this.waitWindowsServiceExit(targets, 10_000, list)
          } catch (error) {
            // 查询失败、超时或原生关闭失败都保留停止失败，后面的登记/PID 不清除。
            throw shutdownError ?? error
          }
        }
        // 父与 worker 已确认退出才合并停止 PID；不依赖进度或 pg_ctl 的退出码。
        targets.forEach((pid) => pgAdminPids.push(pid))
      }

      const pids = new Set<string>()
      // 无目标时沿用首次发现列表；Windows 有目标时使用 Base 返回值；Unix/macOS
      // 使用原生关闭轮询最后一次严格列表。没有任何已确认快照时不允许清理登记。
      const confirmedFinalList = finalProcessList
      if (!confirmedFinalList) throw new Error('Cannot confirm PostgreSQL process exit')
      const appPidCandidates = [appPidBefore, `${version.pid ?? ''}`, ...pgAdminPids].filter(
        Boolean
      )
      // 清理错误必须传播，不能让停止主流程在 PID 文件仍登记时报告完整成功。
      await this.cleanupStoppedServicePidFiles(appPidCandidates, confirmedFinalList, [appPidFile])
      await this.cleanupStoppedServicePidFiles([postmasterPidBefore], confirmedFinalList, [
        postmasterPidFile
      ])
      if (
        appPidBefore &&
        appPidCandidates.includes(appPidBefore) &&
        !confirmedFinalList.some(({ PID }) => PID === appPidBefore)
      ) {
        pids.add(appPidBefore)
      }
      if (
        postmasterPidBefore &&
        !confirmedFinalList.some(({ PID }) => PID === postmasterPidBefore)
      ) {
        pids.add(postmasterPidBefore)
      }
      if (version?.pid && !confirmedFinalList.some(({ PID }) => PID === `${version.pid}`)) {
        pids.add(`${version.pid}`)
      }
      pgAdminPids.forEach((pid) => pids.add(pid))
      on({
        'APP-Service-Stop-Success': true
      })
      on({
        'APP-On-Log': AppLog('info', I18nT('appLog.stopServiceEnd', { service: this.type }))
      })
      return resolve({
        'APP-Service-Stop-PID': [...pids].map((p) => Number(p))
      })
    })
  }

  _startServer(version: SoftInstalled, DATA_DIR?: string) {
    return new ForkPromise(async (resolve, reject, on) => {
      on({
        'APP-On-Log': AppLog(
          'info',
          I18nT('appLog.startServiceBegin', { service: `${this.type}-${version.version}` })
        )
      })
      const bin = version.bin
      const versionTop = version?.version?.split('.')?.shift() ?? ''
      const dbPath = DATA_DIR ?? join(global.Server.PostgreSqlDir!, `postgresql${versionTop}`)
      const confFile = join(dbPath, 'postgresql.conf')
      const logFile = join(dbPath, 'pg.log')
      const sendUserPass = false

      await mkdirp(global.Server.PostgreSqlDir!)

      const doRun = async () => {
        const baseDir = global.Server.PostgreSqlDir!
        if (isWindows()) {
          const execArgs = `-D "${dbPath}" -l "${logFile}" start`
          const appPidFile = this.appPidFile()

          try {
            await serviceStartExecCMD({
              version,
              pidPath: appPidFile,
              baseDir,
              bin,
              execArgs,
              execEnv: '',
              checkPidFile: false,
              on
            })
            if (sendUserPass) {
              on(I18nT('fork.postgresqlInit', { dir: dbPath }))
            }
            const pid = await waitForPostgresqlProcess({
              listProcesses: () => ProcessPidListStrict(),
              dataDirectory: dbPath,
              windows: true,
              wait: waitTime
            })
            on({
              'APP-On-Log': AppLog('info', I18nT('appLog.startServiceSuccess', { pid: pid }))
            })
            resolve({
              'APP-Service-Start-PID': pid
            })
          } catch (e: any) {
            console.log('-k start err: ', e)
            reject(e)
            return
          }
        } else {
          // Use `postgres -D` (foreground) instead of `pg_ctl ... start`, which forks
          // a daemon and exits — serviceStartSpawn backgrounds the process itself and
          // needs a foreground server. version.bin is pg_ctl; postgres is its sibling.
          // postgres reads postgresql.conf from the data dir and writes postmaster.pid.
          const postgresBin = join(dirname(bin), 'postgres')
          const execEnv: Record<string, string> = {
            LC_ALL: global.Server.Local!,
            LANG: global.Server.Local!
          }
          const execArgs = ['-D', dbPath]

          try {
            const res = await serviceStartSpawn({
              version,
              baseDir,
              bin: postgresBin,
              execArgs,
              execEnv,
              on,
              waitTime: 2000,
              // Preserve the old `pg_ctl -l pg.log` behaviour: server log → pg.log.
              outFile: logFile,
              errFile: logFile
            })
            if (sendUserPass) {
              on(I18nT('fork.postgresqlInit', { dir: dbPath }))
            }
            const pid = `${res['APP-Service-Start-PID']}`.trim().split('\n').shift()!.trim()
            on({
              'APP-On-Log': AppLog('info', I18nT('appLog.startServiceSuccess', { pid: pid }))
            })
            await waitTime(1000)
            resolve({
              'APP-Service-Start-PID': pid
            })
          } catch (e: any) {
            console.log('-k start err: ', e)
            reject(e)
            return
          }
        }
      }
      if (existsSync(confFile)) {
        await doRun()
      } else if (!existsSync(dbPath) || (existsSync(dbPath) && readdirSync(dbPath).length === 0)) {
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.initDBDataDir'))
        })
        const binDir = dirname(bin)
        if (isWindows()) {
          process.env.LC_ALL = global.Server.Local!
          process.env.LANG = global.Server.Local!
          await mkdirp(dbPath)
          const initDB = join(binDir, 'initdb.exe')
          try {
            const res = await spawnPromiseWithEnv(initDB, ['-D', dbPath, '-U', 'root'], {
              cwd: binDir,
              shell: false,
              env: {
                LC_ALL: global.Server.Local!,
                LANG: global.Server.Local!
              }
            })
            appDebugLog(
              `[PostgreSql][initdb][windows]`,
              JSON.stringify({
                dbPath,
                stdout: res.stdout,
                stderr: res.stderr
              })
            ).catch()
          } catch (e) {
            appDebugLog(
              `[PostgreSql][initdb][windows][error]`,
              JSON.stringify({
                dbPath,
                error: `${e}`
              })
            ).catch()
            on({
              'APP-On-Log': AppLog('error', I18nT('appLog.initDBDataDirFail', { error: e }))
            })
            reject(e)
            return
          }
        } else {
          const initDB = join(binDir, 'initdb')
          const command = `"${initDB}" -D "${dbPath}" -U root --locale=${global.Server.Local} --encoding=UTF8 && wait`
          console.log('global.Server.Local: ', global.Server.Local)
          try {
            await execPromiseWithEnv(command, {
              env: {
                LC_ALL: global.Server.Local!,
                LANG: global.Server.Local!
              }
            })
          } catch (e) {
            on({
              'APP-On-Log': AppLog('error', I18nT('appLog.initDBDataDirFail', { error: e }))
            })
            reject(e)
            return
          }
        }
        await waitTime(1000)
        if (!existsSync(confFile)) {
          on({
            'APP-On-Log': AppLog(
              'error',
              I18nT('appLog.initDBDataDirFail', { error: `Data Dir ${dbPath} create faild` })
            )
          })
          reject(new Error(`Data Dir ${dbPath} create faild`))
          return
        }
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.initDBDataDirSuccess', { dir: dbPath }))
        })

        if (isWindows()) {
          let conf = await readFile(confFile, 'utf-8')
          let find = conf.match(/lc_messages = '(.*?)'/g)
          conf = conf.replace(find?.[0] ?? '###@@@&&&', `lc_messages = '${global.Server.Local}'`)
          find = conf.match(/lc_monetary = '(.*?)'/g)
          conf = conf.replace(find?.[0] ?? '###@@@&&&', `lc_monetary = '${global.Server.Local}'`)
          find = conf.match(/lc_numeric = '(.*?)'/g)
          conf = conf.replace(find?.[0] ?? '###@@@&&&', `lc_numeric = '${global.Server.Local}'`)
          find = conf.match(/lc_time = '(.*?)'/g)
          conf = conf.replace(find?.[0] ?? '###@@@&&&', `lc_time = '${global.Server.Local}'`)

          await writeFile(confFile, conf)
        }

        const defaultConfFile = join(dbPath, 'postgresql.conf.default')
        await copyFile(confFile, defaultConfFile)
        await doRun()
      } else {
        reject(new Error(`Data Dir ${dbPath} has exists, but conf file not found in dir`))
      }
    })
  }

  fetchLastedTag() {
    return new ForkPromise(async (resolve) => {
      try {
        const url = 'https://api.github.com/repos/pgvector/pgvector/tags?page=1&per_page=1'
        const res = await axios({
          url,
          method: 'get',
          proxy: this.getAxiosProxy()
        })
        const html = res.data
        let arr: any
        try {
          if (typeof html === 'string') {
            arr = JSON.parse(html)
          } else {
            arr = html
          }
        } catch {}
        resolve(arr?.[0]?.name)
      } catch {
        resolve('v0.7.4')
      }
    })
  }

  installPgvector(version: SoftInstalled, tag: string) {
    return new ForkPromise(async (resolve, reject) => {
      const sh = join(global.Server.Static!, 'sh/pgsql-pgvector.sh')
      const copyfile = join(global.Server.Cache!, 'pgsql-pgvector.sh')
      if (existsSync(copyfile)) {
        await unlink(copyfile)
      }
      let content = await readFile(sh, 'utf-8')
      content = content.replace('##BIN_PATH##', dirname(version.bin)).replace('##BRANCH##', tag)
      await writeFile(copyfile, content)
      await chmod(copyfile, '0777')
      // const params = [copyfile]
      try {
        // ('zsh', params).then(resolve).catch(reject)
      } catch (e) {
        reject(e)
      }
    })
  }

  fetchAllOnlineVersion() {
    return new ForkPromise(async (resolve) => {
      try {
        const all: OnlineVersionItem[] = await this._fetchOnlineVersion('postgresql')
        all.forEach((a: any) => {
          const dir = join(
            global.Server.AppDir!,
            `postgresql-${a.version}`,
            `pgsql`,
            'bin/pg_ctl.exe'
          )
          const zip = join(global.Server.Cache!, `postgresql-${a.version}.zip`)
          a.appDir = join(global.Server.AppDir!, `postgresql-${a.version}`)
          a.zip = zip
          a.bin = dir
          a.downloaded = existsSync(zip)
          a.installed = existsSync(dir)
          a.name = `PostgreSQL-${a.version}`
        })
        resolve(all)
      } catch {
        resolve([])
      }
    })
  }

  allInstalledVersions(setup: any) {
    return new ForkPromise(async (resolve) => {
      const base = '/opt/local/'
      const allLibFile = await getSubDirAsync(join(base, 'lib'), false)
      const fpms = allLibFile
        .filter((f) => f.startsWith('postgresql'))
        .map((f) => `lib/${f}/bin/pg_ctl`)
      let versions: SoftInstalled[] = []
      let all: Promise<SoftInstalled[]>[] = []
      if (isWindows()) {
        all = [versionLocalFetch(setup?.postgresql?.dirs ?? [], 'pg_ctl.exe')]
      } else {
        all = [
          versionLocalFetch(setup?.postgresql?.dirs ?? [], 'pg_ctl', 'postgresql'),
          versionMacportsFetch(fpms)
        ]
      }

      Promise.all(all)
        .then(async (list) => {
          versions = list.flat()
          versions = versionFilterSame(versions)
          const all = versions.map((item) => {
            const command = `"${item.bin}" --version`
            const reg = /(\s)(\d+(\.\d+){1,4})(.*?)/g
            return TaskQueue.run(versionBinVersion, item.bin, command, reg)
          })
          return Promise.all(all)
        })
        .then((list) => {
          list.forEach((v, i) => {
            const { error, version } = v
            const num = version
              ? Number(versionFixed(version).split('.').slice(0, 2).join(''))
              : null
            Object.assign(versions[i], {
              version: version,
              num,
              enable: version !== null,
              error
            })
          })
          resolve(versionSort(versions))
        })
        .catch(() => {
          resolve([])
        })
    })
  }

  brewinfo() {
    return new ForkPromise(async (resolve, reject) => {
      try {
        let all: Array<string> = []
        const command = 'brew search -q --formula "/^postgresql@[\\d\\.]+$/"'
        all = await brewSearch(all, command)
        const info = await brewInfoJson(all)
        resolve(info)
      } catch (e) {
        reject(e)
        return
      }
    })
  }

  portinfo() {
    return new ForkPromise(async (resolve) => {
      const Info: { [k: string]: any } = await portSearch(
        `"^postgresql\\d*$"`,
        (f) => {
          return f.includes('The most advanced open-source database available anywhere.')
        },
        (name) => {
          return existsSync(join('/opt/local/lib', name, 'bin/pg_ctl'))
        }
      )
      resolve(Info)
    })
  }
}

export default new Manager()
