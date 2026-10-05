import { join, basename, dirname, isAbsolute, resolve as resolvePath } from 'path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync, readdirSync } from 'fs'
import { Base } from '../Base'
import { withServiceStopContext, type ServiceStopContext } from '@shared/ServiceStopContext'
import { I18nT } from '@lang/runtime'
import type { MysqlGroupItem, OnlineVersionItem, SoftInstalled } from '@shared/app'
import {
  execPromise,
  waitTime,
  versionLocalFetch,
  versionMacportsFetch,
  versionBinVersion,
  versionFixed,
  versionSort,
  getSubDirAsync,
  brewSearch,
  brewInfoJson,
  portSearch,
  versionFilterSame,
  AppLog,
  serviceStartExecCMD,
  mkdirp,
  writeFile,
  chmod,
  remove,
  spawnPromise,
  readFile
} from '../../Fn'
import { serviceStartSpawn } from '../../util/ServiceStart'
import { ForkPromise } from '@shared/ForkPromise'
import TaskQueue from '../../TaskQueue'
import Helper from '../../Helper'
import { isWindows, pathFixedToUnix } from '@shared/utils'
import { ProcessListByExactPid, fetchLoopbackListeningPids } from '@shared/Process'
import { StopProcessListFetch } from '@shared/StopProcessList'
import { isReadableServiceStopRoot } from '@shared/ProcessSnapshot'
import { EOL } from 'os'
import { createConnection } from 'mysql2/promise'
import type { Connection } from 'mysql2/promise'
import { parse as iniParse } from 'ini'
import { compareVersions } from '@shared/compare-versions'
import { format } from 'date-fns'
import EnvSync from '@shared/EnvSync'

const execFileAsync = promisify(execFile)

/** 普通服务与 group 共用 mysqld.exe，按完整配置参数区分根进程身份。 */
const hasExactDefaultsFile = (command: string | undefined, expected: string) => {
  if (!command) return false
  const normalizeConfigPath = (value: string) => {
    const normalized = resolvePath(value).replace(/\\/g, '/')
    return isWindows() ? normalized.toLowerCase() : normalized
  }
  const expectedPath = normalizeConfigPath(expected)
  const options = command.matchAll(
    /(?:^|\s)--defaults-file(?:=|\s+)(?:"([^"]+)"|'([^']+)'|([^\s]+))/gi
  )
  for (const match of options) {
    const configuredPath = match[1] ?? match[2] ?? match[3]
    if (configuredPath && normalizeConfigPath(configuredPath) === expectedPath) {
      return true
    }
  }
  return false
}

const DEFAULT_MYSQL_PORT = 3306
const DEFAULT_MYSQL_SOCKET = '/tmp/mysql.sock'

const getMysqlSocket = (config: any) => {
  const socket = `${config?.mysqld?.socket ?? ''}`
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .trim()
  return socket || DEFAULT_MYSQL_SOCKET
}

const getMysqlPort = (config: any) => {
  const port = Number(`${config?.mysqld?.port ?? ''}`.trim())
  return Number.isFinite(port) && port > 0 ? port : DEFAULT_MYSQL_PORT
}

const getMysqlMaintenanceSocket = (socket: string, version: string) => {
  return socket.endsWith('.sock')
    ? `${socket.slice(0, -'.sock'.length)}.${version}.sock`
    : `${socket}.${version}.sock`
}

class Mysql extends Base {
  constructor() {
    super()
    this.type = 'mysql'
  }

  init() {
    this.pidPath = join(global.Server.MysqlDir!, 'mysql.pid')
  }

  getConfigFiles(version?: SoftInstalled) {
    const v = version?.version?.split('.')?.slice(0, 2)?.join('.') ?? ''
    if (!v) return []
    return [{ name: 'main', path: join(global.Server.MysqlDir!, `my-${v}.cnf`) }]
  }

  getLogFiles() {
    return [
      { name: 'error', path: join(global.Server.MysqlDir!, 'error.log') },
      { name: 'slow', path: join(global.Server.MysqlDir!, 'slow.log') }
    ]
  }

  startService(version: SoftInstalled, options?: { group?: MysqlGroupItem }) {
    if (!options?.group) return super.startService(version)
    return new ForkPromise(async (resolve, reject, on) => {
      const group = { ...options.group, version: { ...options.group.version } }
      const configPath = join(global.Server.MysqlDir!, `group/my-group-${group.id}.cnf`)
      try {
        const started: any = await this.startGroupServer(group).on(on)
        const pid = `${started?.['APP-Service-Start-PID'] ?? ''}`
        if (!/^\d+$/.test(pid) || Number(pid) <= 0) {
          throw new Error('MySQL group start did not return a server PID')
        }
        // 以配置绝对路径作为该组独立的运行登记键；真实安装项留在 Stop-Args，供停止时保留 bin/version。
        resolve({
          ...started,
          'APP-Service-Start-PID': pid,
          'APP-Service-Start-Item': { ...version, bin: configPath, pid },
          'APP-Service-Stop-Args': [{ ...version, pid }, { group }]
        })
      } catch (error) {
        reject(error)
      }
    })
  }

  stopService(
    version: SoftInstalled,
    stopOptions?: ServiceStopContext,
    options?: { group?: MysqlGroupItem }
  ) {
    // 分组业务参数由 dispatcher 顺延到第三位；首表/退出原因不参与组配置解析。
    // 分组路径覆写了 Base 入口，因此在此绑定同一范围，普通路径继续转发公共入口。
    return withServiceStopContext(stopOptions, () => {
      if (options?.group) return this.stopGroupService(options.group, `${version?.pid ?? ''}`)
      return super.stopService(version, stopOptions)
    })
  }

  _initPassword(version: SoftInstalled, password?: string) {
    return new ForkPromise(async (resolve, reject, on) => {
      on({
        'APP-On-Log': AppLog('info', I18nT('appLog.initDBPass'))
      })
      password = password ?? 'root'
      if (isWindows()) {
        const bin = join(dirname(version.bin), 'mysqladmin.exe')
        if (existsSync(bin)) {
          process.chdir(dirname(bin))
          const v = version?.version?.split('.')?.slice(0, 2)?.join('.') ?? ''
          const m = join(global.Server.MysqlDir!, `my-${v}.cnf`)
          let port: number
          try {
            const content = await readFile(m, 'utf8')
            const config = iniParse(content)
            const configuredPort = Number(config?.mysqld?.port)
            if (!Number.isInteger(configuredPort) || configuredPort < 1 || configuredPort > 65535) {
              throw new Error('invalid configured port')
            }
            port = configuredPort
          } catch {
            // 初始化密码会修改实例状态；配置不可用时不能猜默认端口后连接其他服务。
            reject(new Error('Cannot initialize MySQL password without a valid configured port'))
            return
          }
          /**
           * mysqladmin.exe --defaults-file="...my-8.0.cnf" --connect-timeout=2 --protocol=tcp --port=3306 --host="127.0.0.1" -uroot password "root"
           * The port must come from the version cnf. Without it mysqladmin connects to the
           * default 3306, hits the wrong server or none, and the new instance keeps the empty
           * password created by --initialize-insecure (#773).
           */
          const command = `mysqladmin.exe --defaults-file="${m}" --connect-timeout=2 --protocol=tcp --port=${port} --host="127.0.0.1" -uroot password "${password}"`
          let inited = false
          for (let i = 0; i < 3 && !inited; i++) {
            if (i > 0) {
              await waitTime(1000)
            }
            try {
              await execPromise(command)
              inited = true
            } catch (e) {
              // 执行异常对象可能含明文 argv，只输出不会包含口令的 OS 错误码。
              console.log('_initPassword err code: ', (e as NodeJS.ErrnoException)?.code)
            }
          }
          if (!inited) {
            on({
              'APP-On-Log': AppLog(
                'error',
                I18nT('appLog.initDBPassFail', { error: 'mysqladmin failed' })
              )
            })
            reject(new Error('mysqladmin failed to initialize the MySQL password'))
            return
          }
          on({
            'APP-On-Log': AppLog(
              'info',
              I18nT('appLog.initDBPassSuccess', { user: 'root', pass: 'configured' })
            )
          })
        } else {
          on({
            'APP-On-Log': AppLog(
              'error',
              I18nT('appLog.initDBPassFail', { error: 'mysqladmin.exe not found' })
            )
          })
        }
        resolve(true)
      } else {
        const v = version?.version?.split('.')?.slice(0, 2)?.join('.') ?? ''
        const m = join(global.Server.MysqlDir!, `my-${v}.cnf`)
        const content = existsSync(m) ? await readFile(m, 'utf8') : ''
        const socket = getMysqlSocket(iniParse(content))
        execPromise(`./mysqladmin --socket="${socket}" -uroot password "${password}"`, {
          cwd: dirname(version.bin)
        })
          .then(() => {
            on({
              'APP-On-Log': AppLog(
                'info',
                I18nT('appLog.initDBPassSuccess', { user: 'root', pass: 'configured' })
              )
            })
            resolve(true)
          })
          .catch((err) => {
            on({
              'APP-On-Log': AppLog(
                'error',
                I18nT('appLog.initDBPassFail', { error: 'mysqladmin failed' })
              )
            })
            console.log('_initPassword failed')
            reject(new Error('mysqladmin failed to initialize the MySQL password'))
          })
      }
    })
  }

  /** Unix 普通服务同样以独立 defaults-file 参数排除共用 mysqld 安装下的 group 根。 */
  private async stopUnixByDefaultsFile(
    version: SoftInstalled,
    configPath: string
  ): Promise<string[]> {
    const appPidFile = this.appPidFile()
    const appPidBefore = existsSync(appPidFile) ? await this.readPidFromFile(appPidFile) : ''
    const modulePidBefore = existsSync(this.pidPath) ? await this.readPidFromFile() : ''
    // 普通数据库与其他模块共享停止前完整列表；原生关闭后的确认仍走新查询。
    const list = await StopProcessListFetch()
    const candidates = new Set(
      [`${version?.pid ?? ''}`, appPidBefore, modulePidBefore].filter(Boolean)
    )
    // 候选文件用于结果清理；实际根统一按精确 defaults-file 筛选。其他版本、
    // 过期或不可读的候选不会进入目标，也不阻断可确认的本实例。
    const roots = list
      .filter(({ COMMAND }) => hasExactDefaultsFile(COMMAND, configPath))
      .map(({ PID }) => `${PID}`)
    const targets = Array.from(
      new Set(roots.flatMap((pid) => ProcessListByExactPid(pid, list).map(({ PID }) => PID)))
    )
    const finalList = targets.length
      ? await this.stopUnixServicePids('-TERM', roots, targets)
      : list
    if (targets.some((pid) => finalList.some(({ PID }) => PID === pid))) {
      throw new Error('MySQL is still running after the stop request')
    }
    // 空目标沿用首次快照；实际停止则共用 Base 返回的最终列表，按文件当前值清理登记。
    await this.cleanupStoppedServicePidFiles([...targets, ...candidates], finalList, [
      appPidFile,
      this.pidPath
    ])
    return targets
  }

  _stopServer(version: SoftInstalled): ForkPromise<any> {
    if (!isWindows()) {
      return new ForkPromise(async (resolve, reject, on) => {
        try {
          on({
            'APP-On-Log': AppLog('info', I18nT('appLog.stopServiceBegin', { service: this.type }))
          })
          const v = version?.version?.split('.')?.slice(0, 2)?.join('.') ?? ''
          const targets = await this.stopUnixByDefaultsFile(
            version,
            join(global.Server.MysqlDir!, `my-${v}.cnf`)
          )
          on({ 'APP-Service-Stop-Success': true })
          on({
            'APP-On-Log': AppLog('info', I18nT('appLog.stopServiceEnd', { service: this.type }))
          })
          resolve({ 'APP-Service-Stop-PID': targets })
        } catch (error) {
          reject(error)
        }
      })
    }

    return new ForkPromise(async (resolve, reject, on) => {
      // 与通用停止共用新鲜快照及父归属规则，支持相对配置参数；查询失败或活 PID
      // 身份不可读必须传播，不能被当作空目标并删除登记。子孙只由确认父树带出。
      const v = version?.version?.split('.')?.slice(0, 2)?.join('.') ?? ''
      const m = join(global.Server.MysqlDir!, `my-${v}.cnf`)
      // 普通服务与 group 共用 mysqld.exe；只接纳完整配置参数精确指向普通配置的根。
      const targets = await this.windowsServiceTargets(version, [m], (item) =>
        hasExactDefaultsFile(item.COMMAND, m)
      )
      const killPids = new Set(targets.pids)
      let finalList = targets.list
      if (killPids.size > 0) {
        const password = version?.rootPassword ?? 'root'

        let port: number | undefined
        try {
          // 只有配置明确给出有效端口才允许发出关闭请求；配置读取/解析失败不能猜默认 3306。
          const content = await readFile(m, 'utf8')
          const config = iniParse(content)
          const configuredPort = Number(config?.mysqld?.port)
          if (Number.isInteger(configuredPort) && configuredPort > 0 && configuredPort <= 65535) {
            port = configuredPort
          }
        } catch {
          // Leave the port unset and use only the confirmed owned-process fallback.
        }

        let nativeShutdownSucceeded = false
        /**
         * execFile 在 shell:false 下把每个值作为独立字面参数传入；
         * 密码不拼成 shell 命令，也不写入日志或错误文本。
         */
        if (port !== undefined) {
          try {
            // 监听者必须是本次确认的服务目标本身；外部或共享端口绝不接收本次 shutdown。
            // 原生关闭核验监听者，不把通用端口查询的 TIME_WAIT/出站连接混入授权目标。
            const listenerPids = [...new Set(await fetchLoopbackListeningPids(`${port}`))]
            if (listenerPids.length === 1 && killPids.has(listenerPids[0])) {
              await execFileAsync(
                resolvePath(dirname(version.bin), 'mysqladmin.exe'),
                [
                  `--defaults-file=${m}`,
                  '--connect-timeout=1',
                  '--shutdown-timeout=1',
                  '--protocol=tcp',
                  '--host=127.0.0.1',
                  `--port=${port}`,
                  '-uroot',
                  `-p${password}`,
                  'shutdown'
                ],
                { windowsHide: true, shell: false, timeout: 10_000 }
              )
              nativeShutdownSucceeded = true
            } else {
              console.log('mysql graceful shutdown skipped: listener is not the selected instance')
            }
          } catch (e) {
            // execFile 错误对象可能携带含密码的 argv；这里只记录稳定错误码再走确认后的树回收。
            console.log('mysql graceful shutdown failed', (e as NodeJS.ErrnoException)?.code)
          }
        }

        // 原生命令返回不是退出证明；公共阶段立即确认，只在已知残留超时才
        // 回收首次归属快照中的原树。查询错误不回退，不重新采样或扩选新 PID。
        finalList = await this.stopWindowsServiceProcessesAfterNativeShutdown(
          Array.from(killPids),
          targets.list,
          nativeShutdownSucceeded
        )
      }

      // 空目标复用首次发现快照；非空目标由统一等待/停止接口返回确认退出的快照。
      // 除原 PID 残留外，也拒绝同一普通配置下停止期间重新出现的根实例。
      if (
        Array.from(killPids).some((pid) => finalList.some((item) => item.PID === pid)) ||
        finalList.some(({ COMMAND }) => hasExactDefaultsFile(COMMAND, m))
      )
        throw new Error('MySQL is still running after the stop request')
      // Base 只删候选 PID 已退出且磁盘当前仍保存该值的文件；空文件与新实例值保留。
      await this.cleanupStoppedServicePidFiles(
        [...targets.candidates, ...killPids, `${version.pid ?? ''}`].filter(Boolean),
        finalList
      )
      on({
        'APP-Service-Stop-Success': true
      })
      on({
        'APP-On-Log': AppLog('info', I18nT('appLog.stopServiceEnd', { service: this.type }))
      })
      return resolve({
        'APP-Service-Stop-PID': [
          ...new Set([...killPids, `${version.pid ?? ''}`].filter(Boolean))
        ].map(Number)
      })
    })
  }

  _startServer(version: SoftInstalled, skipGrantTables?: boolean, password?: string) {
    return new ForkPromise(async (resolve, reject, on) => {
      on({
        'APP-On-Log': AppLog(
          'info',
          I18nT('appLog.startServiceBegin', { service: `${this.type}-${version.version}` })
        )
      })

      const v = version?.version?.split('.')?.slice(0, 2)?.join('.') ?? ''
      const m = join(global.Server.MysqlDir!, `my-${v}.cnf`)
      const dataDir = join(global.Server.MysqlDir!, `data-${v}`)
      const p = join(global.Server.MysqlDir!, 'mysql.pid')
      const s = join(global.Server.MysqlDir!, 'slow.log')
      const e = join(global.Server.MysqlDir!, 'error.log')
      if (!existsSync(m)) {
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.confInit'))
        })
        const conf = `[mysqld]
# Only allow connections from localhost
bind-address = 127.0.0.1
sql-mode=NO_ENGINE_SUBSTITUTION
port = ${DEFAULT_MYSQL_PORT}
socket = ${isWindows() ? 'MySQL' : DEFAULT_MYSQL_SOCKET}
datadir=${pathFixedToUnix(dataDir)}`
        await writeFile(m, conf)
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.confInitSuccess', { file: m }))
        })
      }

      const unlinkDirOnFail = async () => {
        if (existsSync(dataDir)) {
          await remove(dataDir)
        }
        if (existsSync(m)) {
          await remove(m)
        }
      }

      const doStart = () => {
        return new Promise(async (resolve, reject) => {
          const bin = version.bin
          const baseDir = global.Server.MysqlDir!
          await mkdirp(baseDir)
          const execEnv = ''

          const content = await readFile(m, 'utf8')
          const config = iniParse(content)
          const port = getMysqlPort(config)
          const ddir = config?.mysqld?.datadir ?? dataDir
          const socket = getMysqlSocket(config)
          const maintenanceSocket = getMysqlMaintenanceSocket(socket, version.version!)

          if (isWindows()) {
            const execArgs = [
              `--defaults-file="${m}"`,
              `--pid-file="${p}"`,
              '--user=mysql',
              '--slow-query-log=ON',
              `--slow-query-log-file="${s}"`,
              `--log-error="${e}"`,
              '--standalone'
            ]
            if (skipGrantTables) {
              // Windows socket 是命名管道；维护客户端沿用独立于 Unix 路径的 MySQL 管道。
              execArgs.push('--socket=MySQL')
              execArgs.push(`--datadir="${ddir}"`)
              execArgs.push('--bind-address="127.0.0.1"')
              execArgs.push(`--port=${port}`)
              execArgs.push(`--enable-named-pipe`)
              execArgs.push('--skip-grant-tables')
            }
            const execArgsStr = execArgs.join(' ')
            console.log('execArgs: ', execArgsStr)
            try {
              const res = await serviceStartExecCMD({
                version,
                pidPath: p,
                baseDir,
                bin,
                execArgs: execArgsStr,
                execEnv,
                on,
                timeToWait: 1000,
                maxTime: 60
              })
              resolve(res)
            } catch (e: any) {
              console.log('-k start err: ', e)
              reject(e)
              return
            }
          } else {
            // Use the real `mysqld` (foreground) instead of the `mysqld_safe` wrapper
            // that version.bin points to — serviceStartSpawn backgrounds the process
            // itself and needs a foreground server (no fork-and-exit wrapper).
            const serverBin = join(dirname(bin), 'mysqld')
            const params = [
              `--defaults-file=${m}`,
              `--pid-file=${p}`,
              '--user=mysql',
              `--slow-query-log-file=${s}`,
              `--log-error=${e}`,
              // 将配置值或兼容回退值明确传给服务，避免使用发行版的编译默认 Socket。
              `--socket=${skipGrantTables ? maintenanceSocket : socket}`
            ]
            if (version?.flag === 'macports') {
              params.push(`--lc-messages-dir=/opt/local/share/${basename(version.path)}/english`)
            }

            if (skipGrantTables) {
              params.push(`--datadir=${ddir}`)
              params.push('--bind-address=127.0.0.1')
              params.push(`--port=${port}`)
              params.push('--skip-grant-tables')
            }

            try {
              const res = await serviceStartSpawn({
                version,
                pidPath: p,
                baseDir,
                bin: serverBin,
                execArgs: params,
                on,
                waitTime: 2000
              })
              resolve(res)
            } catch (e: any) {
              console.log('-k start err: ', e)
              reject(e)
              return
            }
          }
        })
      }

      if (!existsSync(dataDir) || readdirSync(dataDir).length === 0) {
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.initDBDataDir'))
        })
        await mkdirp(dataDir)
        await chmod(dataDir, '0777')
        let bin = version.bin
        if (isWindows()) {
          const params = [
            `--defaults-file="${m}"`,
            `--pid-file="${p}"`,
            '--user=mysql',
            '--slow-query-log=ON',
            `--slow-query-log-file="${s}"`,
            `--log-error="${e}"`,
            '--initialize-insecure'
          ]

          process.chdir(dirname(bin))
          const command = `${basename(bin)} ${params.join(' ')}`
          console.log('command: ', command)
          try {
            const res = await execPromise(command)
            console.log('init res: ', res)
            on(res.stdout)
          } catch (e: any) {
            on({
              'APP-On-Log': AppLog('error', I18nT('appLog.initDBDataDirFail', { error: e }))
            })
            reject(e)
            return
          }
        } else {
          const params = [
            `--defaults-file=${m}`,
            `--pid-file=${p}`,
            '--user=mysql',
            `--slow-query-log-file=${s}`,
            `--log-error=${e}`
          ]
          const installdb = join(version.path, 'bin/mysql_install_db')
          if (existsSync(installdb) && version.num! < 57) {
            bin = installdb
            params.splice(0)
            params.push(`--defaults-file=${m}`)
            params.push(`--datadir=${dataDir}`)
            params.push(`--basedir=${version.path}`)
            if (version?.flag === 'macports') {
              const enDir = join(version.path, 'share')
              if (!existsSync(enDir)) {
                const shareDir = `/opt/local/share/${basename(version.path)}`
                if (existsSync(shareDir)) {
                  const langDir = join(enDir, basename(version.path))
                  const langEnDir = join(shareDir, 'english')
                  await Helper.send(
                    'mysql',
                    'macportsDirFixed',
                    enDir,
                    shareDir,
                    langDir,
                    langEnDir
                  )
                }
              }
            }
          } else {
            params.push('--initialize-insecure')
          }

          try {
            await execPromise(
              `cd "${dirname(bin)}" && ./${basename(bin)} ${params.join(' ')} && wait && exit 0`
            )
          } catch (e) {
            on({
              'APP-On-Log': AppLog('error', I18nT('appLog.initDBDataDirFail', { error: e }))
            })
            reject(e)
            return
          }
        }

        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.initDBDataDirSuccess', { dir: dataDir }))
        })
        await waitTime(500)
        try {
          const res = await doStart()
          await waitTime(500)
          if (!skipGrantTables) {
            await this._initPassword(version, password).on(on)
          }
          on(I18nT('fork.postgresqlInit', { dir: dataDir }))
          resolve(res)
        } catch (e) {
          await unlinkDirOnFail()
          reject(e)
        }
      } else {
        doStart().then(resolve).catch(reject)
      }
    })
  }

  stopGroupService(version: MysqlGroupItem, registeredPid = '') {
    return new ForkPromise(async (resolve, reject) => {
      const id = version?.id ?? ''
      const configPath = join(global.Server.MysqlDir!, `group/my-group-${id}.cnf`)
      const pidFile = join(global.Server.MysqlDir!, `group/my-group-${id}.pid`)
      try {
        // 先保存 PID 文件的原值；只有确认该 PID 已退出且磁盘值未被并发实例替换时才清理。
        let recordedPid = ''
        if (existsSync(pidFile)) recordedPid = (await readFile(pidFile, 'utf8')).trim()
        // 数据库分组的首次目标发现也共用 main 缓存，后续只按本组配置选根。
        const list = await StopProcessListFetch()
        const candidatePids = new Set([recordedPid.trim(), registeredPid.trim()].filter(Boolean))
        // 私有 PID 和登记号都是恢复候选；实际目标只能通过本组完整配置筛选，
        // 不可读、其他组或缺席根的历史后代过滤，不再提前阻断或强行加入 roots。
        const roots = list
          .filter(
            (process) =>
              isReadableServiceStopRoot(process) &&
              hasExactDefaultsFile(process.COMMAND, configPath)
          )
          .map(({ PID }) => `${PID}`)
        const arr = Array.from(
          new Set(roots.flatMap((pid) => ProcessListByExactPid(pid, list).map(({ PID }) => PID)))
        )
        let finalList = list
        if (arr.length > 0) {
          // 只有精确配置根及其实际子树可停止；禁止按共用 mysqld.exe 扫描同版本其他实例。
          if (isWindows()) {
            finalList = await this.stopWindowsServiceProcesses(arr, list)
          } else {
            finalList = await this.stopUnixServicePids('-TERM', roots, arr)
          }
        }
        if (arr.some((pid) => finalList.some(({ PID }) => PID === pid))) {
          throw new Error('MySQL group is still running after the stop request')
        }
        // Windows/Unix 共享最终列表及按当前值清理；空文件和并发替换的新 PID 保留。
        await this.cleanupStoppedServicePidFiles([...candidatePids, ...arr], finalList, [pidFile])
        resolve({ 'APP-Service-Stop-PID': arr })
      } catch (error) {
        reject(error)
      }
    })
  }

  startGroupServer(version: MysqlGroupItem) {
    return new ForkPromise(async (resolve, reject, on) => {
      const stopped: any = await this.stopGroupService(version)
      let bin = version.version.bin!
      const id = version?.id ?? ''
      const m = join(global.Server.MysqlDir!, `group/my-group-${id}.cnf`)
      const dataDir = version.dataDir
      await mkdirp(dirname(m))
      if (!existsSync(m)) {
        const conf = `[mysqld]
# Only allow connections from localhost
bind-address = 127.0.0.1
sql-mode=NO_ENGINE_SUBSTITUTION`
        await writeFile(m, conf)
      }

      const p = join(global.Server.MysqlDir!, `group/my-group-${id}.pid`)
      const s = join(global.Server.MysqlDir!, `group/my-group-${id}-slow.log`)
      const e = join(global.Server.MysqlDir!, `group/my-group-${id}-error.log`)
      const sock = join(global.Server.MysqlDir!, `group/my-group-${id}.sock`)

      const unlinkDirOnFail = async () => {
        if (existsSync(dataDir)) {
          await remove(dataDir)
        }
        if (existsSync(m)) {
          await remove(m)
        }
      }

      const baseDir = join(global.Server.MysqlDir!, `group`)
      await mkdirp(baseDir)

      const doStart = () => {
        const execEnv = ''
        return new Promise(async (resolve, reject) => {
          if (isWindows()) {
            const execArgs = [
              `--defaults-file="${m}"`,
              `--datadir="${dataDir}"`,
              `--port="${version.port}"`,
              `--pid-file="${p}"`,
              '--user=mysql',
              '--slow-query-log=ON',
              `--slow-query-log-file="${s}"`,
              `--log-error="${e}"`,
              `--socket="${sock}"`,
              '--standalone'
            ].join(' ')
            try {
              const res = await serviceStartExecCMD({
                version: version.version as any,
                pidPath: p,
                baseDir,
                bin,
                execArgs,
                execEnv,
                on,
                timeToWait: 1000,
                maxTime: 60
              })
              resolve(res)
              return
            } catch (e: any) {
              console.log('-k start err: ', e)
              reject(e)
              return
            }
          } else {
            // Foreground `mysqld` (not the `mysqld_safe` wrapper) for serviceStartSpawn.
            const serverBin = join(dirname(bin), 'mysqld')
            const params = [
              `--defaults-file=${m}`,
              `--datadir=${dataDir}`,
              `--port=${version.port}`,
              `--pid-file=${p}`,
              '--user=mysql',
              `--slow-query-log-file=${s}`,
              `--log-error=${e}`,
              `--socket=${sock}`
            ]
            if (version?.version?.flag === 'macports') {
              params.push(
                `--lc-messages-dir=/opt/local/share/${basename(version.version.path!)}/english`
              )
            }

            try {
              const res = await serviceStartSpawn({
                version: version.version as any,
                pidPath: p,
                baseDir,
                bin: serverBin,
                execArgs: params,
                on,
                waitTime: 2000
              })
              resolve(res)
              return
            } catch (e: any) {
              console.log('-k start err: ', e)
              reject(e)
              return
            }
          }

          if (existsSync(p)) {
            try {
              await remove(p)
            } catch {}
          }

          const startLogFile = join(global.Server.MysqlDir!, `group/start.${id}.log`)
          const startErrLogFile = join(global.Server.MysqlDir!, `start.error.${id}.log`)
          if (existsSync(startErrLogFile)) {
            try {
              await remove(startErrLogFile)
            } catch {}
          }
          const params = [
            `--defaults-file="${m}"`,
            `--datadir="${dataDir}"`,
            `--port="${version.port}"`,
            `--pid-file="${p}"`,
            '--user=mysql',
            '--slow-query-log=ON',
            `--slow-query-log-file="${s}"`,
            `--log-error="${e}"`,
            `--socket="${sock}"`,
            '--standalone'
          ]

          const commands: string[] = [
            '@echo off',
            'chcp 65001>nul',
            `cd /d "${dirname(bin!)}"`,
            `start /B ./${basename(bin!)} ${params.join(' ')} > "${startLogFile}" 2>"${startErrLogFile}"`
          ]

          command = commands.join(EOL)
          console.log('command: ', command)

          const cmdName = `start-${id}.cmd`
          const sh = join(global.Server.MysqlDir!, cmdName)
          await writeFile(sh, command)

          process.chdir(global.Server.MysqlDir!)
          try {
            await EnvSync.sync()
            await spawnPromise(cmdName, [], {
              shell: EnvSync.CMDPath || 'cmd.exe',
              cwd: global.Server.MysqlDir!
            })
          } catch (e: any) {
            console.log('-k start err: ', e)
            reject(e)
            return
          }
          const res = await this.waitPidFile(p)
          if (res) {
            if (res?.pid) {
              resolve(true)
              return
            }
            reject(new Error(res?.error ?? 'Start Fail'))
            return
          }
          let msg = 'Start Fail'
          if (existsSync(startLogFile)) {
            msg = await readFile(startLogFile, 'utf-8')
          }
          reject(new Error(msg))
        })
      }

      const initPassword = () => {
        return new ForkPromise(async (resolve, reject) => {
          if (isWindows()) {
            const bin = join(dirname(version.version.bin!), 'mysqladmin.exe')
            if (existsSync(bin)) {
              process.chdir(dirname(bin))
              try {
                await execPromise(
                  `${basename(bin)} -P${version.port} -S"${sock}" -uroot password "root"`
                )
              } catch {
                console.log('_initPassword failed')
                reject(new Error('mysqladmin failed to initialize the group password'))
                return
              }
            }
          } else {
            try {
              await execPromise(`./mysqladmin -P${version.port} -S${sock} -uroot password "root"`, {
                cwd: dirname(version.version.bin!)
              })
            } catch {
              console.log('_initPassword failed')
              reject(new Error('mysqladmin failed to initialize the group password'))
            }
          }
          resolve(true)
        })
      }

      let command = ''
      if (!existsSync(dataDir) || readdirSync(dataDir).length === 0) {
        await mkdirp(dataDir)
        await chmod(dataDir, '0777')
        if (isWindows()) {
          const params = [
            `--defaults-file="${m}"`,
            `--datadir="${dataDir}"`,
            `--port="${version.port}"`,
            `--pid-file="${p}"`,
            '--user=mysql',
            '--slow-query-log=ON',
            `--slow-query-log-file="${s}"`,
            `--log-error="${e}"`,
            `--socket="${sock}"`,
            '--initialize-insecure'
          ]
          process.chdir(dirname(bin!))
          command = `${basename(bin!)} ${params.join(' ')}`
          console.log('command: ', command)
          try {
            const res = await execPromise(command)
            console.log('init res: ', res)
            on(res.stdout)
          } catch (e: any) {
            reject(e)
            return
          }
        } else {
          const params = [
            `--defaults-file=${m}`,
            `--datadir=${dataDir}`,
            `--port=${version.port}`,
            `--pid-file=${p}`,
            '--user=mysql',
            `--slow-query-log-file=${s}`,
            `--log-error=${e}`,
            `--socket=${sock}`
          ]
          if (version?.version?.flag === 'macports') {
            params.push(
              `--lc-messages-dir=/opt/local/share/${basename(version.version.path!)}/english`
            )
          }
          const currentVersion = version.version!
          const installdb = join(currentVersion.path!, 'bin/mysql_install_db')
          if (existsSync(installdb) && version.version.num! < 57) {
            bin = installdb
            params.splice(0)
            params.push(`--defaults-file=${m}`)
            params.push(`--datadir=${dataDir}`)
            params.push(`--basedir=${currentVersion.path}`)
            if (currentVersion?.flag === 'macports') {
              const enDir = join(currentVersion.path!, 'share')
              if (!existsSync(enDir)) {
                const shareDir = `/opt/local/share/${basename(currentVersion.path!)}`
                if (existsSync(shareDir)) {
                  const langDir = join(enDir, basename(currentVersion.path!))
                  const langEnDir = join(shareDir, 'english')
                  await Helper.send(
                    'mysql',
                    'macportsDirFixed',
                    enDir,
                    shareDir,
                    langDir,
                    langEnDir
                  )
                }
              }
            }
          } else {
            params.push('--initialize-insecure')
          }
          try {
            await execPromise(
              `cd "${dirname(bin)}" && ./${basename(bin)} ${params.join(' ')} && wait && exit 0`
            )
          } catch (e) {
            reject(e)
            return
          }
        }

        await waitTime(500)
        try {
          const started: any = await doStart()
          await waitTime(500)
          await initPassword()
          on(I18nT('fork.postgresqlInit', { dir: dataDir }))
          resolve({
            ...started,
            'APP-Service-Stop-PID': stopped?.['APP-Service-Stop-PID'] ?? []
          })
        } catch (e) {
          await unlinkDirOnFail()
          reject(e)
        }
      } else {
        doStart()
          .then((started) =>
            resolve({
              ...started,
              'APP-Service-Stop-PID': stopped?.['APP-Service-Stop-PID'] ?? []
            })
          )
          .catch(reject)
      }
    })
  }

  fetchAllOnlineVersion() {
    return new ForkPromise(async (resolve) => {
      try {
        const all: OnlineVersionItem[] = await this._fetchOnlineVersion('mysql')
        all.forEach((a: any) => {
          const dir = join(
            global.Server.AppDir!,
            `mysql-${a.version}`,
            `mysql-${a.version}-winx64`,
            'bin/mysqld.exe'
          )
          const zip = join(global.Server.Cache!, `mysql-${a.version}.zip`)
          a.appDir = join(global.Server.AppDir!, `mysql-${a.version}`)
          a.zip = zip
          a.bin = dir
          a.downloaded = existsSync(zip)
          a.installed = existsSync(dir)
          a.name = `MySQL-${a.version}`
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
        .filter((f) => f.startsWith('mysql'))
        .map((f) => `lib/${f}/bin/mysqld_safe`)
      let versions: SoftInstalled[] = []
      let all: Promise<SoftInstalled[]>[] = []
      if (isWindows()) {
        all = [versionLocalFetch(setup?.mysql?.dirs ?? [], 'mysqld.exe')]
      } else {
        all = [
          versionLocalFetch(setup?.mysql?.dirs ?? [], 'mysqld_safe', 'mysql'),
          versionMacportsFetch(fpms)
        ]
      }
      Promise.all(all)
        .then(async (list) => {
          versions = list.flat().filter((v) => !v.bin.includes('mariadb'))
          versions = versionFilterSame(versions)
          const all = versions.map((item) => {
            let bin = item.bin
            let command = ''
            if (isWindows()) {
              command = `"${bin}" -V`
            } else {
              bin = join(dirname(item.bin), 'mysqld')
              command = `"${bin}" -V`
            }
            const reg = /(Ver )(\d+(\.\d+){1,4})( )/g
            return TaskQueue.run(versionBinVersion, bin, command, reg)
          })
          return Promise.all(all)
        })
        .then(async (list) => {
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
        let all: Array<string> = ['mysql']
        const command = 'brew search -q --formula "/^mysql@[\\d\\.]+$/"'
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
        `"^mysql([\\d]+)?$"`,
        (f) => {
          return f.includes('Multithreaded SQL database server')
        },
        (name) => {
          return existsSync(join('/opt/local/lib', name, 'bin/mysqld_safe'))
        }
      )
      resolve(Info)
    })
  }

  passwordChange(version: SoftInstalled, user: string, password: string) {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const res: any = await this._startServer(version, true, password)
        // 启动结果对象可能包含启动参数；只保留所需 PID，不展开对象。
        const pid = res?.['APP-Service-Start-PID']
        version.pid = pid
      } catch {
        console.log('rootPasswordChange start failed')
        return reject(new Error('MySQL password change could not start the service'))
      }
      await waitTime(1000)

      if (isWindows()) {
        const bin = join(dirname(version.bin), 'mysql.exe')
        if (compareVersions(version.version!, '8.0.0') === 1) {
          try {
            await execPromise(
              `"${bin}" -u root --protocol=pipe -e "FLUSH PRIVILEGES;ALTER USER '${user}'@'localhost' IDENTIFIED WITH caching_sha2_password BY '${password}';FLUSH PRIVILEGES;"`
            )
          } catch {
            console.log('MySQL password update failed for localhost')
          }
          try {
            await execPromise(
              `"${bin}" -u root --protocol=pipe -e "FLUSH PRIVILEGES;ALTER USER '${user}'@'127.0.0.1' IDENTIFIED WITH caching_sha2_password BY '${password}';FLUSH PRIVILEGES;"`
            )
          } catch {
            console.log('MySQL password update failed for loopback')
          }
        } else if (compareVersions(version.version!, '5.7.5') === 1) {
          try {
            await execPromise(
              `"${bin}" -u root --protocol=pipe -e "FLUSH PRIVILEGES;ALTER USER '${user}'@'localhost' IDENTIFIED BY '${password}';FLUSH PRIVILEGES;"`
            )
          } catch {
            console.log('MySQL password update failed for localhost')
          }
          try {
            await execPromise(
              `"${bin}" -u root --protocol=pipe -e "FLUSH PRIVILEGES;ALTER USER '${user}'@'127.0.0.1' IDENTIFIED BY '${password}';FLUSH PRIVILEGES;"`
            )
          } catch {
            console.log('MySQL password update failed for loopback')
          }
        } else {
          try {
            await execPromise(
              `"${bin}" -u root --protocol=pipe -e "FLUSH PRIVILEGES;UPDATE mysql.user SET Password=PASSWORD('${password}') WHERE User='${user}';FLUSH PRIVILEGES;"`
            )
          } catch {
            console.log('MySQL password update failed')
          }
        }
      } else {
        const bin = join(dirname(version.bin), 'mysql')
        const v = version?.version?.split('.')?.slice(0, 2)?.join('.') ?? ''
        const m = join(global.Server.MysqlDir!, `my-${v}.cnf`)
        const content = existsSync(m) ? await readFile(m, 'utf8') : ''
        const socket = getMysqlMaintenanceSocket(
          getMysqlSocket(iniParse(content)),
          version.version!
        )

        if (compareVersions(version.version!, '8.0.0') === 1) {
          try {
            await execPromise(
              `"${bin}" -u root --protocol=socket --socket="${socket}" -e "FLUSH PRIVILEGES;ALTER USER '${user}'@'localhost' IDENTIFIED WITH caching_sha2_password BY '${password}';FLUSH PRIVILEGES;"`
            )
          } catch {
            console.log('MySQL password update failed for localhost')
          }
          try {
            await execPromise(
              `"${bin}" -u root --protocol=socket --socket="${socket}" -e "FLUSH PRIVILEGES;ALTER USER '${user}'@'127.0.0.1' IDENTIFIED WITH caching_sha2_password BY '${password}';FLUSH PRIVILEGES;"`
            )
          } catch {
            console.log('MySQL password update failed for loopback')
          }
        } else if (compareVersions(version.version!, '5.7.5') === 1) {
          try {
            await execPromise(
              `"${bin}" -u root --protocol=socket --socket="${socket}" -e "FLUSH PRIVILEGES;ALTER USER '${user}'@'localhost' IDENTIFIED BY '${password}';FLUSH PRIVILEGES;"`
            )
          } catch {
            console.log('MySQL password update failed for localhost')
          }
          try {
            await execPromise(
              `"${bin}" -u root --protocol=socket --socket="${socket}" -e "FLUSH PRIVILEGES;ALTER USER '${user}'@'127.0.0.1' IDENTIFIED BY '${password}';FLUSH PRIVILEGES;"`
            )
          } catch {
            console.log('MySQL password update failed for loopback')
          }
        } else {
          try {
            await execPromise(
              `"${bin}" -u root --protocol=socket --socket="${socket}" -e "FLUSH PRIVILEGES;UPDATE mysql.user SET Password=PASSWORD('${password}') WHERE User='${user}';FLUSH PRIVILEGES;"`
            )
          } catch {
            console.log('MySQL password update failed')
          }
        }
      }

      version.rootPassword = password
      try {
        // 复用含精确 defaults-file 归属的模块停止，不能走 Base 的宽泛路径或吞掉停止失败。
        await this._stopServer(version)
      } catch (error) {
        return reject(error)
      }

      resolve(true)
    })
  }

  getDatabasesWithUsers(version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject) => {
      const v = version?.version?.split('.')?.slice(0, 2)?.join('.') ?? ''
      const m = join(global.Server.MysqlDir!, `my-${v}.cnf`)

      const content = await readFile(m, 'utf8')
      const config = iniParse(content)
      const port = getMysqlPort(config)
      console.log('rootPasswordChange port: ', port)
      let connection: Connection | undefined
      try {
        connection = await createConnection({
          host: '127.0.0.1',
          user: 'root',
          password: version?.rootPassword ?? 'root',
          port
        })
      } catch (e) {
        console.log('rootPasswordChange Connection err 0: ', e)
      }

      if (!connection) {
        try {
          connection = await createConnection({
            host: 'localhost',
            user: 'root',
            port
          })
        } catch (e) {
          console.log('rootPasswordChange Connection err 1: ', e)
          return reject(e)
        }
      }

      try {
        const [databases]: any = await connection.query(`
      SELECT schema_name
      FROM information_schema.schemata
      WHERE schema_name NOT IN (
        'mysql', 'information_schema', 'performance_schema', 'sys'
      )
    `)

        const [dbPrivileges]: any = await connection.query(`
      SELECT * FROM mysql.db
      WHERE Db NOT IN ('mysql', 'sys') and
        Select_priv = 'Y' and
        Insert_priv = 'Y' and
        Update_priv = 'Y' and
        Delete_priv = 'Y' and
        Create_priv = 'Y' and
        Drop_priv = 'Y' and
        References_priv = 'Y' and
        Index_priv = 'Y' and
        Alter_priv = 'Y' and
        Create_tmp_table_priv = 'Y' and
        Lock_tables_priv = 'Y' and
        Create_view_priv = 'Y' and
        Show_view_priv = 'Y' and
        Create_routine_priv = 'Y' and
        Alter_routine_priv = 'Y' and
        Execute_priv = 'Y' and
        Event_priv = 'Y' and
        Trigger_priv = 'Y'
    `)

        const [globalUsers]: any = await connection.query(`
      SELECT DISTINCT User, Host
      FROM mysql.user
      WHERE
        Select_priv = 'Y' and
        Insert_priv = 'Y' and
        Update_priv = 'Y' and
        Delete_priv = 'Y' and
        Create_priv = 'Y' and
        Drop_priv = 'Y' and
        References_priv = 'Y' and
        Index_priv = 'Y' and
        Alter_priv = 'Y' and
        Create_tmp_table_priv = 'Y' and
        Lock_tables_priv = 'Y' and
        Create_view_priv = 'Y' and
        Show_view_priv = 'Y' and
        Create_routine_priv = 'Y' and
        Alter_routine_priv = 'Y' and
        Execute_priv = 'Y' and
        Event_priv = 'Y' and
        Trigger_priv = 'Y'
    `)

        const [allUsers]: any = await connection.query(`
      SELECT DISTINCT User, Host
      FROM mysql.user
    `)

        const list = databases.map((db: any) => {
          const dbName = db?.SCHEMA_NAME ?? db.schema_name

          const directUsers = dbPrivileges
            .filter((priv: any) => priv.Db.replace(/[\\]+/g, '') === dbName)
            .map((priv: any) => `${priv.User}`)

          const globalUserList = globalUsers.map((u: any) => `${u.User}`)

          return {
            name: dbName,
            users: [...new Set([...directUsers, ...globalUserList])]
          }
        })
        resolve({
          list,
          databases,
          dbPrivileges,
          globalUsers,
          allUsers
        })
      } finally {
        await connection.end()
      }
    })
  }

  addDatabase(version: SoftInstalled, data: any) {
    return new ForkPromise(async (resolve, reject) => {
      const v = version?.version?.split('.')?.slice(0, 2)?.join('.') ?? ''
      const m = join(global.Server.MysqlDir!, `my-${v}.cnf`)

      const content = await readFile(m, 'utf8')
      const config = iniParse(content)
      const port = getMysqlPort(config)
      console.log('rootPasswordChange port: ', port)
      let connection: Connection | undefined
      try {
        connection = await createConnection({
          host: '127.0.0.1',
          user: 'root',
          password: version?.rootPassword ?? 'root',
          port
        })
      } catch (e) {
        console.log('rootPasswordChange Connection err 0: ', e)
      }

      if (!connection) {
        try {
          connection = await createConnection({
            host: 'localhost',
            user: 'root',
            port
          })
        } catch (e) {
          console.log('rootPasswordChange Connection err 1: ', e)
          return reject(e)
        }
      }

      let userExists = false

      try {
        await connection.query('FLUSH PRIVILEGES')
        // 1. 创建数据库
        await connection.query(
          `CREATE DATABASE IF NOT EXISTS \`${data.database}\` CHARACTER SET ${data.charset}`
        )

        const [plugin]: any = await connection.query(
          `SELECT * FROM mysql.plugin WHERE name = 'caching_sha2_password';`
        )

        const [users]: any = await connection.query(
          `SELECT User FROM mysql.user WHERE User = ? AND Host = 'localhost'`,
          [data.user]
        )
        if (!users || users.length === 0) {
          if (plugin && plugin.length > 0) {
            await connection.query(
              `CREATE USER IF NOT EXISTS '${data.user}'@'localhost' IDENTIFIED WITH caching_sha2_password BY '${data.password}'`
            )
          } else {
            // MySQL 5.7.5及以下版本
            await connection.query(`CREATE USER ?@'localhost' IDENTIFIED BY ?`, [
              data.user,
              data.password
            ])
          }
        } else {
          if (compareVersions(version.version!, '8.0.0') === 1) {
            if (plugin && plugin.length > 0) {
              await connection.query(
                `ALTER USER '${data.user}'@'localhost' IDENTIFIED WITH caching_sha2_password BY '${data.password}';`
              )
            } else {
              await connection.query(
                `ALTER USER '${data.user}'@'localhost' IDENTIFIED BY '${data.password}';`
              )
            }
          } else if (compareVersions(version.version!, '5.7.5') === 1) {
            await connection.query(
              `ALTER USER '${data.user}'@'localhost' IDENTIFIED BY '${data.password}';`
            )
          } else {
            await connection.query(
              `UPDATE mysql.user SET Password=PASSWORD('${data.password}') WHERE User='${data.user}';`
            )
          }
          userExists = true
        }

        // 3. 授予用户对数据库的所有权限
        await connection.query(
          `GRANT ALL PRIVILEGES ON \`${data.database}\`.* TO '${data.user}'@'localhost'`
        )

        // 4. 刷新权限
        await connection.query('FLUSH PRIVILEGES')
        await connection?.end()
      } catch (e) {
        console.log('addDatabase Error: ', e)
        await connection?.end()
        return reject(e)
      }

      resolve({
        userExists
      })
    })
  }

  backupDatabase(version: SoftInstalled, databases: string[], saveDir: string) {
    return new ForkPromise(async (resolve, reject) => {
      if (!isAbsolute(saveDir)) {
        return reject(new Error(I18nT('mysql.saveDirError')))
      }

      try {
        await mkdirp(saveDir)
      } catch {
        return reject(new Error(I18nT('mysql.saveDirError')))
      }

      let bin = ''
      if (isWindows()) {
        bin = join(dirname(version.bin), 'mysqldump.exe')
      } else {
        bin = join(dirname(version.bin), 'mysqldump')
      }

      const v = version?.version?.split('.')?.slice(0, 2)?.join('.') ?? ''
      const m = join(global.Server.MysqlDir!, `my-${v}.cnf`)

      const content = await readFile(m, 'utf8')
      const config = iniParse(content)
      const port = getMysqlPort(config)
      const password = version?.rootPassword ?? 'root'
      const error: any = []

      const time = format(new Date(), 'yyyy-MM-dd-HH-mm-ss')
      for (const database of databases) {
        const file = join(saveDir, `${database}-backup-${time}.sql`)
        let cammand = ``
        if (compareVersions(version.version!, '8.0.0') === 1) {
          cammand = `"${bin}" -uroot -p${password} --port=${port} --host="127.0.0.1" --single-transaction --column-statistics=0 --no-tablespaces ${database} > "${file}"`
        } else {
          cammand = `"${bin}" -uroot -p${password} --port=${port} --host="127.0.0.1" --single-transaction --no-tablespaces ${database} > "${file}"`
        }
        try {
          await execPromise(cammand)
        } catch {
          // exec 异常可能包含带口令的 mysqldump 命令，错误返回只带数据库名和稳定提示。
          error.push(I18nT('mysql.backupFail', { database, error: 'mysqldump failed' }))
        }
      }

      resolve(error)
    })
  }
}
export default new Mysql()
