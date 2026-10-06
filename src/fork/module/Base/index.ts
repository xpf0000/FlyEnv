import { I18nT } from '@lang/runtime'
import { createWriteStream, existsSync } from 'fs'
import { join } from 'path'
import { userInfo } from 'os'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import {
  currentServiceStopContext,
  isServiceStopContext,
  withServiceStopContext,
  type ServiceStopContext
} from '@shared/ServiceStopContext'
import {
  AppLog,
  execPromiseWithEnv,
  waitTime,
  readFile,
  writeFile,
  remove,
  mkdirp,
  zipUnpack,
  chmod
} from '../../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import axios from 'axios'
import * as http from 'http'
import * as https from 'https'
import {
  type PItem,
  ProcessKillStrict,
  ProcessOwnedPidsByPid,
  ProcessSearch
} from '@shared/Process'
import { isLinux, isMacOS, isWindows } from '@shared/utils'
import { unpack } from '../../util/Zip'
import { StopProcessListFetch } from '@shared/StopProcessList'
import { getAxiosProxy } from '../../util/Axios'
import Helper from '../../Helper'
import {
  cleanupStoppedServicePidFiles,
  stopWindowsServiceProcesses,
  stopWindowsServiceProcessesAfterNativeShutdown,
  waitForServiceProcessExit
} from '@shared/ServiceStop'
import {
  logServiceStop,
  serviceStopProcessRows,
  withServiceStopDiagnostics
} from '@shared/ServiceStopDiagnostics'
import { isReadableServiceStopRoot } from '@shared/ProcessSnapshot'

export class Base {
  type: string
  pidPath: string
  constructor() {
    this.type = ''
    this.pidPath = ''
  }

  exec(fnName: string, ...args: any) {
    // @ts-ignore
    const fn: (...args: any) => ForkPromise<any> = this?.[fnName] as any
    if (fn) {
      return fn.call(this, ...args)
    }
    return new ForkPromise((resolve, reject) => {
      reject(new Error(`No Found Function: ${fnName}`))
    })
  }

  _startServer(version: SoftInstalled, ...args: any): ForkPromise<any> {
    console.log(version)
    console.log(args)
    return new ForkPromise<any>((resolve) => {
      resolve(true)
    })
  }

  _linkVersion(version: SoftInstalled): ForkPromise<any> {
    return new ForkPromise(async (resolve) => {
      if (isWindows()) {
        resolve(true)
        return
      }
      if (version && version?.bin) {
        try {
          const v = version.bin
            .split(global.Server.BrewCellar + '/')
            .pop()
            ?.split('/')?.[0]
          if (v) {
            const command = `brew unlink ${v} && brew link --overwrite --force ${v}`
            console.log('_linkVersion: ', command)
            execPromiseWithEnv(command)
              .then(() => {})
              .catch(() => {})
            resolve(true)
          } else {
            resolve(I18nT('fork.versionError'))
          }
        } catch (e: any) {
          resolve(e.toString())
        }
      } else {
        resolve(I18nT('base.needSelectVersion'))
      }
    })
  }

  protected appPidFile() {
    return join(global.Server.BaseDir!, `pid/${this.type}.pid`)
  }

  /**
   * 配置文件清单。各服务模块覆写自己的（部分服务按版本，故接收 version）。
   * 返回 [] 表示该模块不支持/无配置文件。name 是人类可读标识（如 'main' / 'error'）。
   * 只返回 name + path，不返回内容——FlyEnv 是本地工具，AI 代理自行读文件。
   */
  getConfigFiles(_version?: SoftInstalled): Array<{ name: string; path: string }> {
    return []
  }

  /** 日志文件清单。各服务模块覆写自己的。 */
  getLogFiles(_version?: SoftInstalled): Array<{ name: string; path: string }> {
    return []
  }

  /** fork 可调：返回配置文件清单（存在性标记），供 MCP read_config 用 */
  listConfigFiles(
    version?: SoftInstalled
  ): ForkPromise<Array<{ name: string; path: string; exists: boolean }>> {
    return new ForkPromise((resolve) => {
      resolve(this.getConfigFiles(version).map((f) => ({ ...f, exists: existsSync(f.path) })))
    })
  }

  /** fork 可调：返回日志文件清单（存在性标记），供 MCP read_log 用 */
  listLogFiles(
    version?: SoftInstalled
  ): ForkPromise<Array<{ name: string; path: string; exists: boolean }>> {
    return new ForkPromise((resolve) => {
      resolve(this.getLogFiles(version).map((f) => ({ ...f, exists: existsSync(f.path) })))
    })
  }

  stopService(
    version: SoftInstalled,
    stopOptions: ServiceStopContext | undefined = currentServiceStopContext(),
    ...args: any
  ) {
    // 第二参数只属于本次停止请求，不传入版本或模块的业务 args。完整表随请求
    // 直接到达；内层 StopProcessListFetch/companion 在同一异步范围读它，不再取表 IPC。
    // 继承调用范围的默认值兼容插件旧入口及同一停止中的内部转发。外部插件若
    // 沿用 Base 旧签名直接传第二业务参数，将它还原到 args，不误当成停止元信息。
    const legacyArgument = stopOptions !== undefined && !isServiceStopContext(stopOptions)
    return withServiceStopContext(legacyArgument ? currentServiceStopContext() : stopOptions, () =>
      this.stopServerWithDiagnostics(version, ...(legacyArgument ? [stopOptions, ...args] : args))
    )
  }

  protected stopServerWithDiagnostics(version: SoftInstalled, ...args: any) {
    // 公开入口在目标发现之前建立 trace，覆盖普通模块、原生关闭和空目标。
    // 只记录版本标识，不展开 args/完整版本对象（数据库参数可能含口令）。
    // ForkPromise 仍转发原进度与终态；已有 PHP trace 会复用同一个上下文。
    return withServiceStopDiagnostics(
      { module: this.type, version: version?.version, bin: version?.bin, rootPid: version?.pid },
      () =>
        new ForkPromise(async (resolve, reject, on) => {
          await logServiceStop('module.stop-begin')
          try {
            const result = await this._stopServer(version, ...args).on(on)
            await logServiceStop('module.stop-completed', {
              stoppedPids: result?.['APP-Service-Stop-PID'] ?? []
            })
            resolve(result)
          } catch (error) {
            await logServiceStop('module.stop-failed', { error: String(error) })
            reject(error)
          }
        })
    )
  }

  /**
   * 成功启动时向 main 提供同实例的停止请求，只保存在运行登记中，不写共享配置。
   * 普通模块停止只需要版本与实际根 PID；额外启动参数不自动当作停止参数，
   * 避免口令/终端选项泄漏到错误位置。需要实例目录的模块覆写此方法。
   */
  serviceStopArgs(pid: string, version: SoftInstalled, ..._startArgs: any[]): any[] {
    return [{ ...version, pid }]
  }

  /**
   * Windows 服务目标由 fork 确认，只从登记/PID 文件及服务名加归属标记发现。
   * 命令行归属使用版本路径和模块给出的配置标记，不用整个 FlyEnv 数据目录匹配。
   * 不按实际 EXE 路径遍历并纳入全部实例：用户可能使用同一安装自行启动服务，
   * 相同程序路径不能单独证明实例归 FlyEnv 管理。名称/标记匹配精度仍由其规则决定。
   * 子孙直接归属于已确认的根，不分别校验其程序路径。独立实例模块可传更准确标记。
   */
  protected async windowsServiceTargets(
    version: SoftInstalled,
    extraMarkers: string[] = [],
    rootPredicate?: (process: PItem) => boolean
  ) {
    const snapshotQueryStartedAt = new Date().toISOString()
    // 各模块从 main 的同一完整短缓存选自己的根/后代，批量并行退出不重复查 CIM。
    // 创建身份仍来自这一列表；执行后的公共退出确认使用新查询，不复用停止前快照。
    const list = await StopProcessListFetch()
    const snapshotQueryCompletedAt = new Date().toISOString()
    const markers = [version?.bin, version?.path, ...extraMarkers].filter(
      (value): value is string => !!value?.trim()
    )
    const pids = new Set<string>()
    // 第一条来源：精确查询运行登记和 PID 文件，再验证父命令行的归属标记。
    const candidates = new Set([`${version?.pid ?? ''}`.trim()])
    const pidFiles: Array<{ file: string; pid: string }> = []
    for (const file of [this.appPidFile(), this.pidPath]) {
      if (file && existsSync(file)) {
        const pid = await this.readPidFromFile(file)
        candidates.add(pid)
        pidFiles.push({ file, pid })
      }
    }
    const selection: Array<{ pid: string; source: string; reason: string; treePids: string[] }> = []
    // 两种候选来源复用原筛选。日志仅解释该次选择，不改变不可读根的过滤策略，
    // 不额外扫描 EXE 或重新查进程，也不输出可能包含口令的命令行/归属标记。
    const select = (pid: string, source: string) => {
      const candidate = list.find(({ PID }) => PID === pid)
      const reason = !candidate
        ? 'absent'
        : !isReadableServiceStopRoot(candidate)
          ? 'unreadable-root'
          : rootPredicate && !rootPredicate(candidate)
            ? 'instance-predicate-mismatch'
            : undefined
      const treePids = reason ? [] : ProcessOwnedPidsByPid(pid, list, markers)
      selection.push({
        pid,
        source,
        reason: reason ?? (treePids.length ? 'selected' : 'ownership-mismatch'),
        treePids
      })
      treePids.forEach((id) => pids.add(id))
    }
    for (const pid of candidates) {
      // 候选缺席、不可读或归属不匹配只过滤当前项，不阻断其他已确认服务树。
      // 活着的被过滤候选不会进入 kill 集合，也不会通过最终清理的缺席判断。
      // 模块可要求额外的实例配置证据（例如 MySQL 普通/分组共用 bin）；它是 AND
      // 限制，而非加入 OR markers。只约束根，已经确认根的后代仍直接随树停止。
      if (pid) select(pid, 'registered-or-pid-file')
    }
    // 第二条来源：按模块服务名恢复候选，仍须通过同一父命令行归属判断。
    // 已属于确认父树的子孙直接保留，不因程序名或路径不同再做独立身份授权。
    const name = this._stopSearchName()
    if (name) {
      for (const process of ProcessSearch(name, false, list)) {
        if (pids.has(process.PID)) {
          selection.push({
            pid: process.PID,
            source: 'service-name',
            reason: 'covered-by-selected-tree',
            treePids: []
          })
          continue // 已属于确认父树的 worker 不再单独检查归属。
        }
        select(process.PID, 'service-name')
      }
    }
    // 未验证的登记根/历史 PPID 后代保持在目标集合之外；模块的独立配置证据
    // 仍可恢复其他有效根。不用一个失效登记号否定整个发现结果。
    const relevant = new Set([...pids, ...selection.map(({ pid }) => pid)])
    await logServiceStop('module.targets-detected', {
      snapshotQueryStartedAt,
      snapshotQueryCompletedAt,
      snapshotCount: list.length,
      pidFiles,
      candidates: [...candidates].filter(Boolean),
      selection,
      targetPids: [...pids],
      emptyTargets: pids.size === 0,
      processes: serviceStopProcessRows(list.filter(({ PID }) => relevant.has(PID))).map(
        (item) => ({
          ...item,
          commandReadable: !!list.find(({ PID }) => PID === item.pid)?.COMMAND?.trim()
        })
      )
    })
    return { list, pids: [...pids], candidates: [...candidates].filter(Boolean) }
  }

  /**
   * 命令返回不是进程退出证明。使用未缓存的严格查询确认原目标全部消失；
   * 查询错误/访问拒绝不当作空列表，等待有上限，失败时调用方保留 PID 文件。
   * 这里只确认结果，不逐个为 worker 再做停止前身份授权，也不自动补杀。
   * 返回确认原 PID 已消失的那一份新鲜快照，调用方可继续在内存中检查版本残留
   * 和 PID 文件对应进程，避免为同一次停止重复启动全量 CIM 查询。
   * 空目标保留原来的直接返回语义；返回 [] 仅表示未执行等待，不是全系统快照。
   */
  protected async waitWindowsServiceExit(
    pids: string[],
    timeoutMs = 10_000,
    initialList?: PItem[]
  ): Promise<PItem[]> {
    // 原生关闭也可复用首次身份，避免把已退出 PID 的新占用者当成数据库残留。
    return waitForServiceProcessExit(pids, timeoutMs, { initialList })
  }

  /** 模块只负责目标归属；树根压缩、快照身份、停止及退出确认归共享执行器。 */
  protected async stopWindowsServiceProcesses(pids: string[], list: PItem[]): Promise<PItem[]> {
    // 数据库停止需明确退出；其他模块在 quit 上下文按命令结果收尾。
    return stopWindowsServiceProcesses(pids, list, {
      confirmExit: ['mysql', 'mariadb', 'postgresql', 'mongodb'].includes(this.type)
    })
  }

  /** 原生协议留在模块；允许原树回收的服务共用确认/超时回退，复用首次身份。 */
  protected async stopWindowsServiceProcessesAfterNativeShutdown(
    pids: string[],
    list: PItem[],
    nativeShutdownSucceeded: boolean
  ): Promise<PItem[]> {
    return stopWindowsServiceProcessesAfterNativeShutdown(pids, list, nativeShutdownSucceeded)
  }

  /**
   * 使用最后一次退出确认的快照清理本次候选的 PID 文件，不另查进程表。
   * 当前值必须仍是本次候选、且最终快照中缺席；删除前重读保护并发启动的新
   * 登记。空文件可能正在写入，保留；读取/删除失败传播而不是伪造停止成功。
   * files 仅由 fork 模块提供自己的私有路径，不从 renderer 接受任意文件清单。
   */
  protected async cleanupStoppedServicePidFiles(
    pids: string[],
    finalList: PItem[],
    files: string[] = [this.appPidFile(), this.pidPath]
  ): Promise<void> {
    await cleanupStoppedServicePidFiles(pids, finalList, files)
  }

  protected async ensureAppPidDirWritable() {
    const pidDir = join(global.Server.BaseDir!, 'pid')
    const probeFile = join(
      pidDir,
      `.flyenv-write-test-${this.type}-${process.pid}-${Date.now()}.tmp`
    )
    let lastError: any

    const verifyWritable = async () => {
      await mkdirp(pidDir)
      await writeFile(probeFile, '')
      await remove(probeFile).catch(() => {})
    }

    try {
      await verifyWritable()
      return
    } catch (e) {
      lastError = e
    }

    await remove(probeFile).catch(() => {})

    try {
      if (existsSync(pidDir)) {
        await chmod(pidDir, '0755')
      }
      await verifyWritable()
      return
    } catch (e) {
      lastError = e
    }

    await remove(probeFile).catch(() => {})

    if (isLinux()) {
      try {
        await Helper.send('tools', 'repairManagedPidDirectory')
        await verifyWritable()
        return
      } catch (error) {
        throw new Error(`PID directory is not writable: ${pidDir}. ${error}`)
      }
    }
    if (!isWindows()) {
      try {
        const uinfo = userInfo()
        await Helper.send('redis', 'logFileFixed', pidDir, `${uinfo.uid}:${uinfo.gid}`)
        await chmod(pidDir, '0755').catch(() => {})
        await verifyWritable()
        return
      } catch (e) {
        lastError = e
      }
    }

    await remove(probeFile).catch(() => {})

    try {
      await Helper.send('tools', 'rm', pidDir)
      await verifyWritable()
      return
    } catch (e) {
      lastError = e
    }

    await remove(probeFile).catch(() => {})
    const error = lastError instanceof Error ? lastError.message : `${lastError}`
    throw new Error(`PID directory is not writable: ${pidDir}. ${error}`)
  }

  /** 读取模块自己的 pid 文件，只取首行根 PID，兼容 postmaster.pid 这类多行状态文件。 */
  protected async readPidFromFile(pidFile = this.pidPath): Promise<string> {
    if (!pidFile || !existsSync(pidFile)) {
      return ''
    }
    const content = (await readFile(pidFile, 'utf-8')).trim()
    if (!content) {
      return ''
    }
    return (
      content
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find(Boolean) ?? ''
    )
  }

  protected async saveAppPid(pid: string | number) {
    const appPidFile = this.appPidFile()
    await this.ensureAppPidDirWritable()
    await remove(appPidFile).catch(() => {})
    await writeFile(appPidFile, `${pid}`.trim())
    await chmod(appPidFile, '0755').catch(() => {})
  }

  /** 共用的 app PID 文件可能已被另一个版本覆盖，只清除本次停止实例的记录。 */
  protected async removeStoppedAppPid(pids: string[]): Promise<void> {
    const file = this.appPidFile()
    if (!existsSync(file)) return
    const pid = await this.readPidFromFile(file)
    // 空文件可能是下一实例“创建后尚未写入”的中间态；不因空内容删除别人的记录。
    if (pid && pids.includes(pid)) await remove(file)
  }

  /**
   * Unix 批量信号可能遇到已自然退出的 PID。保留该错误后仍查询原目标清单；
   * 全部消失才幂等成功，残留/查询失败/超时均不能清除登记或报告停止成功。
   */
  protected async stopUnixServicePids(
    signal: string,
    signalPids: string[],
    observedPids: string[] = signalPids,
    timeoutMs = 10_000,
    initialList?: PItem[]
  ): Promise<PItem[]> {
    let signalError: unknown
    try {
      await ProcessKillStrict(signal, signalPids)
    } catch (error) {
      signalError = error
    }
    // 跨平台共用原 PID/创建时间退出确认；保留 Unix 信号及自然退出幂等策略。
    try {
      return await waitForServiceProcessExit(observedPids, timeoutMs, { initialList })
    } catch (error) {
      throw signalError ?? error
    }
  }

  /** 生成用于校验 PID 归属的路径标记，只有命令行仍命中这些标记时才允许按 PID 回收。 */
  protected ownedProcessMarkers(version: SoftInstalled): string[] {
    return Array.from(
      new Set(
        // AppDir/BaseDir 为所有安装版本共享，不能用它们证明某一个版本的根归属。
        // Unix 保留 COMMAND/进程标题证据以兼容 macOS，但证据粒度必须是本版本。
        [version?.bin, version?.path].filter((item): item is string => !!item?.trim())
      )
    )
  }

  startService(version: SoftInstalled, ...args: any) {
    return new ForkPromise(async (resolve, reject, on) => {
      if (!isWindows() && !existsSync(version?.bin) && version.typeFlag !== 'ftp-srv') {
        reject(new Error(I18nT('fork.binNotFound')))
        return
      }
      if (!version?.version) {
        reject(new Error(I18nT('fork.versionNotFound')))
        return
      }
      try {
        this._linkVersion(version)
      } catch {}
      let res: any
      try {
        // 启动前清理也经过统一诊断入口；执行的模块策略及进度仍是同一个 _stopServer。
        const stopped: any = await this.stopServerWithDiagnostics(version, ...args).on(on)
        await this.ensureAppPidDirWritable()
        res = await this._startServer(version, ...args).on(on)
        if (stopped?.['APP-Service-Stop-PID']) {
          res['APP-Service-Stop-PID'] = stopped['APP-Service-Stop-PID']
        }
      } catch (e) {
        console.error('startService error: ', e)
        return reject(e)
      }

      try {
        if (res?.['APP-Service-Start-PID']) {
          const pid = res['APP-Service-Start-PID']
          await this.saveAppPid(pid)
        }
      } catch (e) {
        console.error('save app pid error: ', e)
      }
      // PID 文件维护属于当前启动的尾部工作，不能先发终态再在退出停止期间写回旧 PID。
      // 写入失败保留已有策略：仍返回实际启动 PID，让 main 登记并能沿同一入口清理服务。
      resolve(res)
    })
  }

  /**
   * Process-name search key used by `_stopServer` to find orphaned service
   * processes. Subclasses (including plugin-bundled modules) can override
   * this hook instead of duplicating the whole stop flow.
   */
  protected _stopSearchName(): string | undefined {
    const dis: { [k: string]: string } = {
      caddy: 'caddy',
      nginx: 'nginx',
      apache: 'httpd',
      mysql: 'mysqld',
      mariadb: 'mariadbd',
      memcached: 'memcached',
      mongodb: 'mongod',
      postgresql: 'postgres',
      clickhouse: 'clickhouse',
      'pure-ftpd': 'pure-ftpd',
      tomcat: 'org.apache.catalina.startup.Bootstrap',
      rabbitmq: 'rabbit',
      elasticsearch: 'org.elasticsearch.server/org.elasticsearch.bootstrap.Elasticsearch',
      ollama: 'ollama',
      cliproxyapi: 'cli-proxy-api',
      rnacos: 'rnacos',
      frankenphp: 'frankenphp',
      roadrunner: 'rr',
      'swoole-cli': 'swoole-cli',
      numa: 'numa',
      temporal: 'temporal-server',
      'temporal-cli': 'temporal'
    }
    return dis?.[this.type]
  }

  /**
   * Kill signal used by `_stopServer` on unix. JVM-style services need
   * `-TERM`; everything else defaults to `-INT`. Windows always uses `-INT`.
   */
  protected _stopSignal(): string {
    switch (this.type) {
      case 'mysql':
      case 'mariadb':
      case 'mongodb':
      case 'tomcat':
      case 'rabbitmq':
      case 'elasticsearch':
      case 'etcd':
      case 'numa':
        return '-TERM'
      default:
        return '-INT'
    }
  }

  _stopServer(version: SoftInstalled, ...args: any): ForkPromise<any> {
    console.log('_stopServer: ', version, ...args)
    return new ForkPromise(async (resolve, reject, on) => {
      on({
        'APP-On-Log': AppLog('info', I18nT('appLog.stopServiceBegin', { service: this.type }))
      })
      // 停止参数可能包含模块私有口令；服务停止日志只记录服务类型，不展开版本或参数。
      // Windows 界面停止和退出均在 fork 内发现并确认本模块 PID，再按已确认树结束。
      if (isWindows()) {
        const targets = await this.windowsServiceTargets(version)
        const finalProcessList = await this.stopWindowsServiceProcesses(targets.pids, targets.list)
        await this.cleanupStoppedServicePidFiles(
          [...targets.pids, ...targets.candidates],
          finalProcessList
        )
        on({ 'APP-Service-Stop-Success': true })
        on({ 'APP-On-Log': AppLog('info', I18nT('appLog.stopServiceEnd', { service: this.type })) })
        resolve({ 'APP-Service-Stop-PID': targets.pids })
        return
      }
      let plist: PItem[] = []
      const allPid: string[] = []
      try {
        // Unix 的首次目标发现同样共用 main 列表；信号后的确认由公共工具严格重查。
        plist = await StopProcessListFetch()
      } catch (e) {
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.processListFail'))
        })
        reject(e)
        // 查询失败后没有可信进程快照，必须停止后续副作用并保留 PID 文件。
        return
      }
      const appPidFile = this.appPidFile()
      const ownedMarkers = this.ownedProcessMarkers(version)
      // PID 文件存在但不可读时不能把查询错误折算成“没有服务”；保留文件以便重试。
      const appPid = await this.readPidFromFile(appPidFile)
      const modulePid = await this.readPidFromFile()
      const candidates = new Set([appPid, modulePid, `${version?.pid ?? ''}`].filter(Boolean))
      for (const pid of candidates) {
        // Unix 与 Windows 使用相同候选过滤语义；归属工具对不可读根返回空集合。
        allPid.push(...ProcessOwnedPidsByPid(pid, plist, ownedMarkers))
      }
      const serverName = this._stopSearchName()
      if (serverName) {
        // 名稱搜尋只提供候選；父命令仍須帶有本版本/資料目錄標記，子孫則沿用已確認父樹。
        const pids = ProcessSearch(serverName, false, plist)
          .filter((p) => {
            return (
              ownedMarkers.some((marker) => p.COMMAND.includes(marker)) &&
              !p.COMMAND.includes(' grep ') &&
              !p.COMMAND.includes(' /bin/sh -c') &&
              !p.COMMAND.includes('/Contents/MacOS/') &&
              !p.COMMAND.startsWith('/bin/bash ') &&
              !p.COMMAND.includes('brew.rb ') &&
              !p.COMMAND.includes(' install ') &&
              !p.COMMAND.includes(' uninstall ') &&
              !p.COMMAND.includes(' link ') &&
              !p.COMMAND.includes(' unlink ')
            )
          })
          // 无命令行/不匹配的候选在归属筛选时返回空集合，不阻断其他有效根。
          .flatMap((p) => ProcessOwnedPidsByPid(p.PID, plist, ownedMarkers))
        allPid.push(...pids)
      }
      const arr: string[] = Array.from(new Set(allPid))
      let finalProcessList = plist
      if (arr.length > 0) {
        const sig = this._stopSignal()
        // 即使单个目标在批量 signal 前自然退出，仍由公共严格等待核对整份原目标。
        finalProcessList = await this.stopUnixServicePids(sig, arr, arr, 10_000, plist)
      }
      // PID 记录只在严格停止和新鲜快照确认后清除，且只清除本次目标对应的登记。
      // 不在快照中的 PID 是已退出的舊登記，可清除；仍活著但不屬本模組的 PID 保留。
      const absentCandidates = [...candidates].filter(
        (pid) => !finalProcessList.some(({ PID }) => PID === pid)
      )
      await this.removeStoppedAppPid([...arr, ...absentCandidates])
      const currentModulePid = await this.readPidFromFile()
      if (
        currentModulePid &&
        (arr.includes(currentModulePid) ||
          !finalProcessList.some(({ PID }) => PID === currentModulePid))
      ) {
        await remove(this.pidPath)
      }
      on({
        'APP-On-Log': AppLog('info', I18nT('appLog.stopServiceEnd', { service: this.type }))
      })
      // 成功进度在停止完成后才发送；提前发送会让其他消费者误判服务已退出。
      on({ 'APP-Service-Stop-Success': true })
      resolve({
        'APP-Service-Stop-PID': arr
      })
    })
  }

  async waitPidFile(
    pidFile: string,
    errLog?: string,
    maxTime = 20,
    time = 0
  ): Promise<
    | {
        pid?: string
        error?: string
      }
    | false
  > {
    let res:
      | {
          pid?: string
          error?: string
        }
      | false = false
    if (existsSync(pidFile)) {
      const pid = (await readFile(pidFile, 'utf-8')).trim()
      if (pid) {
        return { pid }
      }
      // 部分启动器先创建空 PID 文件再写入 PID；沿用既有等待预算，避免误报启动失败并遗留无登记服务。
    }
    if (time < maxTime) {
      await waitTime(500)
      res = await this.waitPidFile(pidFile, errLog, maxTime, time + 1)
    } else {
      let error = ''
      if (errLog && existsSync(errLog)) {
        error = (await readFile(errLog, 'utf-8')).trim()
      }
      if (error.length > 0) {
        res = { error }
      } else {
        res = false
      }
    }
    console.log('waitPid: ', time, res)
    return res
  }

  getAxiosProxy() {
    return getAxiosProxy()
  }

  async _fetchOnlineVersion(app: string): Promise<OnlineVersionItem[]> {
    let list: OnlineVersionItem[] = []
    try {
      let data: any = {}
      if (isMacOS()) {
        data = {
          app,
          os: 'mac',
          arch: global.Server.Arch === 'x86_64' ? 'x86' : 'arm'
        }
      } else if (isWindows()) {
        data = {
          app,
          os: 'win',
          arch: 'x86'
        }
      } else if (isLinux()) {
        data = {
          app,
          os: 'linux',
          arch: global.Server.Arch === 'x86_64' ? 'x86' : 'arm'
        }
      }
      const res = await axios({
        url: 'https://api.one-env.com/api/version/fetch',
        method: 'post',
        data,
        timeout: 30000,
        withCredentials: false,
        httpAgent: new http.Agent({ keepAlive: false }),
        httpsAgent: new https.Agent({ keepAlive: false }),
        proxy: this.getAxiosProxy()
      })
      list = res?.data?.data ?? []
    } catch (e) {
      console.log('_fetchOnlineVersion: err', e)
    }
    return list
  }

  async _installSoftHandle(row: any) {
    if (isWindows()) {
      await zipUnpack(row.zip, row.appDir)
    } else {
      const dir = row.appDir
      await mkdirp(dir)
      await unpack(row.zip, dir)
    }
  }

  installSoft(row: any) {
    return new ForkPromise(async (resolve, reject, on) => {
      on({
        'APP-On-Log': AppLog('info', I18nT('appLog.startInstall', { service: row?.name ?? '' }))
      })
      try {
        await mkdirp(global.Server.Cache!)
        await mkdirp(global.Server.AppDir!)
      } catch {}

      const refresh = () => {
        row.downloaded = existsSync(row.zip)
        row.installed = existsSync(row.bin)
      }
      const end = () => {
        refresh()
        if (row.installed) {
          row.downState = 'success'
          row.progress = 100
          on(row)
          resolve(true)
        } else {
          row.downState = 'exception'
          on(row)
          resolve(false)
        }
      }

      const fail = async () => {
        try {
          await remove(row.zip)
          await remove(row.appDir)
        } catch {}
      }

      if (existsSync(row.zip)) {
        row.progress = 100
        on(row)
        let success = false
        try {
          await this._installSoftHandle(row)
          success = true
          refresh()
        } catch {
          refresh()
        }
        if (success) {
          row.downState = 'success'
          row.progress = 100
          resolve(true)
          return
        }
        await fail()
      }

      axios({
        method: 'get',
        url: row.url,
        proxy: this.getAxiosProxy(),
        responseType: 'stream',
        onDownloadProgress: (progress) => {
          if (progress.total) {
            row.progress = Math.round((progress.loaded * 100.0) / progress.total)
            on(row)
          }
        }
      })
        .then((response) => {
          const stream = createWriteStream(row.zip)
          response.data.pipe(stream)
          stream.on('error', async (err: any) => {
            console.log('stream error: ', err)
            await fail()
            end()
          })
          stream.on('finish', async () => {
            row.downState = 'success'
            try {
              if (existsSync(row.zip)) {
                await this._installSoftHandle(row)
              }
              refresh()
            } catch {
              refresh()
            }
            on(row)
            end()
          })
        })
        .catch(async (err) => {
          console.log('down error: ', err)
          await fail()
          end()
        })
    })
  }
}
