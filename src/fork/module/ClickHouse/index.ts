import { join, dirname } from 'path'
import { existsSync } from 'fs'
import { Base } from '../Base'
import { I18nT } from '@lang/runtime'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import {
  AppLog,
  chmod,
  copyFile,
  execPromise,
  downloadFile,
  mkdirp,
  readFile,
  readdir,
  remove,
  versionBinVersion,
  versionFilterSame,
  versionFixed,
  versionLocalFetch,
  versionSort,
  writeFile
} from '../../Fn'
import { unpack } from '../../util/Zip'
import { serviceStartSpawn } from '../../util/ServiceStart'
import { ForkPromise } from '@shared/ForkPromise'
import TaskQueue from '../../TaskQueue'
import { isMacOS, isWindows } from '@shared/utils'

import {
  ProcessListByExactPid,
  ProcessListFetch,
  ProcessOwnedPidsByPidOrDescendant
} from '@shared/Process'
import {
  CH_UI_CONNECTION_NAME,
  CH_UI_PORT,
  chUIConfigContent,
  chUIReleaseURL,
  clickHouseHttpPort
} from './chUI'
import { clickHouseVersionPidFile } from './lifecycle'
class Manager extends Base {
  constructor() {
    super()
    this.type = 'clickhouse'
  }

  init() {}

  getConfigFiles(_version?: SoftInstalled) {
    const dir = global.Server.ClickHouseDir
    if (!dir) {
      return []
    }
    return [
      { name: 'config', path: join(dir, 'config.xml') },
      { name: 'users', path: join(dir, 'users.xml') }
    ]
  }

  getLogFiles(_version?: SoftInstalled) {
    const dir = global.Server.ClickHouseDir
    if (!dir) {
      return []
    }
    const logDir = join(dir, 'log')
    return [
      { name: 'server', path: join(logDir, 'server.log') },
      { name: 'error', path: join(logDir, 'server.err.log') },
      { name: 'start-out', path: join(logDir, 'server.start.out.log') },
      { name: 'start-error', path: join(logDir, 'server.start.err.log') },
      { name: 'ch-ui-start-out', path: join(dir, 'ch-ui/log/ch-ui.start.out.log') },
      { name: 'ch-ui-start-error', path: join(dir, 'ch-ui/log/ch-ui.start.err.log') }
    ]
  }

  private chUIDir(): string {
    return join(global.Server.ClickHouseDir!, 'ch-ui')
  }

  private chUIBin(): string {
    return join(global.Server.AppDir!, 'ch-ui', 'ch-ui')
  }

  private chUIVersion(bin = this.chUIBin()): SoftInstalled {
    return {
      typeFlag: 'clickhouse',
      version: 'ch-ui',
      bin,
      path: dirname(bin),
      num: null,
      enable: true,
      run: false,
      running: false
    }
  }

  private chUIPidPath(): string {
    return join(this.chUIDir(), 'ch-ui.pid')
  }

  private chUIConfigPath(): string {
    return join(this.chUIDir(), 'server.yaml')
  }

  private async clickHouseURL(): Promise<string> {
    const configFile = await this.initConfig()
    const config = await readFile(configFile, 'utf-8')
    return `http://127.0.0.1:${clickHouseHttpPort(config)}`
  }

  private async initCHUIConfig(clickHouseURL: string): Promise<string> {
    const dir = this.chUIDir()
    const configPath = this.chUIConfigPath()
    await mkdirp(join(dir, 'data'))
    await mkdirp(join(dir, 'log'))
    if (!existsSync(configPath)) {
      await writeFile(configPath, chUIConfigContent(join(dir, 'data', 'ch-ui.db'), clickHouseURL))
    }
    return configPath
  }

  private async ensureCHUI(on: (...args: any) => void): Promise<string> {
    const bin = this.chUIBin()
    if (existsSync(bin)) {
      return bin
    }

    const cacheFile = join(global.Server.Cache!, `ch-ui-${process.platform}-${process.arch}`)
    await mkdirp(dirname(bin))
    await downloadFile(chUIReleaseURL(process.platform, process.arch), cacheFile).on(on)
    await copyFile(cacheFile, bin)
    await chmod(bin, '0755')
    try {
      await execPromise(`"${bin}" version`)
    } catch (error) {
      await remove(bin).catch(() => {})
      throw error
    }
    return bin
  }

  private async chUIRunningPid(bin: string): Promise<string | undefined> {
    const pidPath = this.chUIPidPath()
    if (!existsSync(pidPath)) {
      return undefined
    }
    const pid = (await readFile(pidPath, 'utf-8')).trim()
    if (!pid) {
      await remove(pidPath)
      return undefined
    }
    const process = (await ProcessListFetch()).find((item) => item.PID === pid)
    if (process?.COMMAND.includes(bin)) {
      return pid
    }
    await remove(pidPath)
    return undefined
  }

  openCHUI(): ForkPromise<{
    url: string
    'APP-Service-Start-PID': string
    'APP-Service-Start-Item': SoftInstalled
  }> {
    return new ForkPromise(async (resolve, reject, on) => {
      try {
        const bin = await this.ensureCHUI(on)
        const chUIVersion = this.chUIVersion(bin)
        const clickHouseURL = await this.clickHouseURL()
        const configPath = await this.initCHUIConfig(clickHouseURL)

        let pid = await this.chUIRunningPid(bin)
        if (!pid) {
          const res = await serviceStartSpawn({
            version: chUIVersion,
            pidPath: this.chUIPidPath(),
            baseDir: this.chUIDir(),
            bin,
            execArgs: [
              'server',
              '--config',
              configPath,
              '--port',
              `${CH_UI_PORT}`,
              '--clickhouse-url',
              clickHouseURL,
              '--connection-name',
              CH_UI_CONNECTION_NAME
            ],
            execEnv: {
              LC_ALL: global.Server.Local!,
              LANG: global.Server.Local!
            },
            on,
            waitTime: 2000,
            cwd: this.chUIDir(),
            outFile: join(this.chUIDir(), 'log/ch-ui.start.out.log'),
            errFile: join(this.chUIDir(), 'log/ch-ui.start.err.log')
          })
          pid = res['APP-Service-Start-PID']
        }

        resolve({
          url: `http://127.0.0.1:${CH_UI_PORT}`,
          'APP-Service-Start-PID': pid,
          'APP-Service-Start-Item': chUIVersion
        })
      } catch (error) {
        reject(error)
      }
    })
  }

  private versionPidFile(version: SoftInstalled): string {
    return clickHouseVersionPidFile(global.Server.BaseDir!, version.bin)
  }

  private async clearVersionPidFiles(stoppedPids: string[]): Promise<void> {
    const pidDir = join(global.Server.BaseDir!, 'pid')
    if (!existsSync(pidDir)) return
    const files = await readdir(pidDir)
    const running = await ProcessListFetch()
    for (const file of files.filter((value) => /^clickhouse-[a-f0-9]{32}\.pid$/.test(value))) {
      const pidFile = join(pidDir, file)
      const pid = await this.readPidFromFile(pidFile)
      // 只清理已确认停止或快照确认不存在的版本 PID；其他活实例的登记必须保留。
      if (!pid || stoppedPids.includes(pid) || !running.some(({ PID }) => PID === pid)) {
        await remove(pidFile)
      }
    }
  }

  private _stopAllServers(version: SoftInstalled, ...args: any): ForkPromise<any> {
    return new ForkPromise(async (resolve, reject, on) => {
      let uiPids: string[] = []
      try {
        uiPids = await this._stopCHUI()
      } catch (error) {
        console.log('clickhouse stop CH-UI err: ', error)
        // UI 是服务伴随进程；任何平台未确认退出都必须阻断重启并保留 PID 供重试。
        reject(error)
        return
      }
      try {
        const res: any = await super._stopServer(version, ...args).on(on)
        await this.clearVersionPidFiles(res['APP-Service-Stop-PID'] ?? [])
        if (uiPids.length > 0) {
          res['APP-Service-Stop-PID'] = Array.from(
            new Set([...(res['APP-Service-Stop-PID'] ?? []), ...uiPids])
          )
        }
        resolve(res)
      } catch (error) {
        reject(error)
      }
    })
  }

  startService(version: SoftInstalled, ...args: any) {
    return new ForkPromise(async (resolve, reject, on) => {
      if (!isWindows() && !existsSync(version?.bin)) {
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
      try {
        const stopped = await this._stopAllServers(version, ...args).on(on)
        await this.ensureAppPidDirWritable()
        const res: any = await this._startServer(version).on(on)
        if (stopped?.['APP-Service-Stop-PID']) {
          res['APP-Service-Stop-PID'] = stopped['APP-Service-Stop-PID']
        }
        if (stopped?.['APP-Service-Stale-Bins']) {
          res['APP-Service-Stale-Bins'] = stopped['APP-Service-Stale-Bins']
        }
        resolve(res)
      } catch (error) {
        reject(error)
      }
    })
  }

  private async managedClickHousePid(pid: string, version: SoftInstalled): Promise<string> {
    const plist = await ProcessListFetch()
    const owned = ProcessOwnedPidsByPidOrDescendant(
      pid,
      plist,
      [version.bin],
      ['clickhouse-watchdog']
    )
    return owned.length > 0 ? `${pid}` : ''
  }

  /** 独立打开的 CH-UI 也登记清理，只停止面板，不把它当作 ClickHouse 服务。 */
  companionStopArgs(command: string, pid: string): any[] | undefined {
    if (command === 'openCHUI') {
      return [{ ...this.chUIVersion(this.chUIBin()), pid }, { uiOnly: true }]
    }
  }

  _stopServer(version: SoftInstalled, ...args: any) {
    return new ForkPromise(async (resolve, reject, on) => {
      if (args[0]?.uiOnly) {
        resolve({ 'APP-Service-Stop-PID': await this._stopCHUI() })
        return
      }
      on({
        'APP-On-Log': AppLog('info', I18nT('appLog.stopServiceBegin', { service: this.type }))
      })
      try {
        const plist = await ProcessListFetch()
        const pids = new Set<string>()
        const versionPid = await this.readPidFromFile(this.versionPidFile(version))
        const legacyPid = await this.readPidFromFile(this.appPidFile())
        const staleBinSet = new Set<string>()
        const candidates = Array.from(
          new Set([versionPid, legacyPid, `${version.pid ?? ''}`].filter(Boolean))
        )
        for (const pid of candidates) {
          const root = plist.find(({ PID }) => PID === pid)
          // 候选不可读/缺席只过滤，不阻断其他实例根或 CH-UI companion。
          // 有历史后代时也不凭缺席父的号码建立新授权。
          const ownedPids = ProcessOwnedPidsByPidOrDescendant(
            pid,
            plist,
            [version.bin],
            ['clickhouse-watchdog']
          )
          if (ownedPids.length === 0) {
            // 活但未验证的候选不标成 stale；避免把过滤等同于进程已消失。
            if (!root && !plist.some(({ PPID }) => PPID === pid)) staleBinSet.add(version.bin)
            continue
          }
          ownedPids.forEach((ownedPid) => pids.add(ownedPid))
        }
        const arr = Array.from(pids)
        let finalList = plist
        if (arr.length > 0) {
          // 只向已确认的 Unix 根发送服务信号；查询失败、信号失败或超时均拒绝成功。
          if (isWindows()) {
            finalList = await this.stopWindowsServiceProcesses(arr, plist)
          } else {
            finalList = await this.stopUnixServicePids('-INT', arr)
          }
        }
        // 无论数据库父进程是否已退出，都要独立确认并停止仍运行的 CH-UI companion。
        const uiPids = await this._stopCHUI()
        arr.push(...uiPids)
        // companion 停止也可能需要授权；整次停止成功后才移除 PID，便于失败后重试。
        // 所有平台按最终列表清理：有效树已停止才移除旧值，活的被过滤候选保留。
        await this.cleanupStoppedServicePidFiles(
          [...candidates, ...arr, `${version.pid ?? ''}`].filter(Boolean),
          finalList,
          [this.appPidFile(), this.pidPath, this.versionPidFile(version)]
        )
        const staleBins = Array.from(staleBinSet)
        on({ 'APP-Service-Stop-Success': true })
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.stopServiceEnd', { service: this.type }))
        })
        resolve({
          'APP-Service-Stop-PID': Array.from(new Set(arr)),
          'APP-Service-Stale-Bins': staleBins
        })
      } catch (error) {
        reject(error)
      }
    })
  }

  private async _stopCHUI(): Promise<string[]> {
    const bin = this.chUIBin()
    const pidPath = this.chUIPidPath()
    const processes = await ProcessListFetch()

    const candidatePids = new Set<string>()
    if (existsSync(pidPath)) {
      try {
        const pid = (await readFile(pidPath, 'utf-8')).trim()
        if (pid) candidatePids.add(pid)
      } catch (error) {
        // PID 记录不可读时不能当作 companion 已退出，也不能继续清理该记录。
        throw error
      }
    }
    // 只从保存的 PID 和专属进程名恢复 UI 候选，不能按相同 EXE 全量扫描纳入用户实例。
    ProcessSearch('ch-ui', false, processes)
      .filter((item) => item.COMMAND.includes(bin))
      .forEach(({ PID }) => candidatePids.add(`${PID}`))
    const roots: string[] = []
    for (const pid of candidatePids) {
      // 归属工具过滤不可读/不匹配根；其他有效 UI 候选继续，确认父后再收完整树。
      if (ProcessOwnedPidsByPid(pid, processes, [bin]).length) roots.push(pid)
    }
    // UI 根需带本次安装标记；确认后的完整子孙可直接随父树停止，不逐 worker 授权。
    const arr = Array.from(
      new Set(roots.flatMap((pid) => ProcessListByExactPid(pid, processes).map(({ PID }) => PID)))
    )
    let finalList = processes
    if (arr.length > 0) {
      if (isWindows()) finalList = await this.stopWindowsServiceProcesses(arr, processes)
      else {
        finalList = await this.stopUnixServicePids('-INT', roots, arr)
      }
    }
    // 空目标仍沿用首次列表，不得把不可读但存活的 UI 候选当成已退出。
    await this.cleanupStoppedServicePidFiles([...candidatePids, ...arr], finalList, [pidPath])
    return arr
  }

  private configContent(): { config: string; users: string } {
    const baseDir = global.Server.ClickHouseDir!
    const dataDir = join(baseDir, 'data')
    const logDir = join(baseDir, 'log')
    const config = `<clickhouse>
    <logger>
        <level>information</level>
        <log>${join(logDir, 'server.log')}</log>
        <errorlog>${join(logDir, 'server.err.log')}</errorlog>
        <size>10M</size>
        <count>3</count>
    </logger>
    <http_port>8123</http_port>
    <tcp_port>9000</tcp_port>
    <listen_host>127.0.0.1</listen_host>
    <path>${dataDir}/</path>
    <tmp_path>${join(dataDir, 'tmp')}/</tmp_path>
    <user_files_path>${join(dataDir, 'user_files')}/</user_files_path>
    <users_config>${join(baseDir, 'users.xml')}</users_config>
    <default_profile>default</default_profile>
</clickhouse>
`
    const users = `<clickhouse>
    <profiles>
        <default/>
    </profiles>
    <users>
        <default>
            <password></password>
            <networks>
                <ip>::/0</ip>
            </networks>
            <profile>default</profile>
            <quota>default</quota>
        </default>
    </users>
    <quotas>
        <default/>
    </quotas>
</clickhouse>
`
    return { config, users }
  }

  private legacyUsersContent(): string {
    return `<clickhouse>
    <users>
        <default>
            <password></password>
            <networks>
                <ip>::/0</ip>
            </networks>
            <profile>default</profile>
            <quota>default</quota>
        </default>
    </users>
</clickhouse>
`
  }

  initConfig(): ForkPromise<string> {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const baseDir = global.Server.ClickHouseDir!
        const confFile = join(baseDir, 'config.xml')
        const usersFile = join(baseDir, 'users.xml')
        const { config, users } = this.configContent()

        await mkdirp(baseDir)
        await mkdirp(join(baseDir, 'data'))
        await mkdirp(join(baseDir, 'log'))

        if (!existsSync(confFile)) {
          await writeFile(confFile, config)
        }
        if (!existsSync(`${confFile}.default`)) {
          await writeFile(`${confFile}.default`, config)
        }
        const migrateUsersFile = async (file: string) => {
          if (!existsSync(file)) {
            await writeFile(file, users)
            return
          }
          const content = await readFile(file, 'utf-8')
          if (content.trim() === this.legacyUsersContent().trim()) {
            await writeFile(file, users)
          }
        }
        await migrateUsersFile(usersFile)
        await migrateUsersFile(`${usersFile}.default`)

        resolve(confFile)
      } catch (error) {
        reject(error)
      }
    })
  }

  _startServer(version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject, on) => {
      on({
        'APP-On-Log': AppLog(
          'info',
          I18nT('appLog.startServiceBegin', { service: `${this.type}-${version.version}` })
        )
      })
      const bin = version.bin
      const baseDir = global.Server.ClickHouseDir!
      const confFile = await this.initConfig().on(on)
      const logDir = join(baseDir, 'log')

      const execEnv: Record<string, string> = {
        LC_ALL: global.Server.Local!,
        LANG: global.Server.Local!
      }
      // clickhouse 多调用二进制：server 子命令前台运行，serviceStartSpawn 负责后台化与 pid
      const execArgs = ['server', `--config-file=${confFile}`]

      try {
        const res = await serviceStartSpawn({
          version,
          pidPath: this.versionPidFile(version),
          baseDir,
          bin,
          execArgs,
          execEnv,
          on,
          waitTime: 3000,
          outFile: join(logDir, 'server.start.out.log'),
          errFile: join(logDir, 'server.start.err.log')
        })
        const spawnedPid = `${res['APP-Service-Start-PID']}`.trim().split('\n').shift()!.trim()
        const managedPid = await this.managedClickHousePid(spawnedPid, version)
        if (!managedPid) {
          throw new Error(I18nT('fork.startFail'))
        }
        await writeFile(this.versionPidFile(version), managedPid)
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.startServiceSuccess', { pid: managedPid }))
        })
        resolve({
          'APP-Service-Start-PID': managedPid
        })
      } catch (e: any) {
        console.log('clickhouse start err: ', e)
        reject(e)
      }
    })
  }

  fetchAllOnlineVersion() {
    return new ForkPromise(async (resolve) => {
      try {
        const all: OnlineVersionItem[] = await this._fetchOnlineVersion('clickhouse')
        all.forEach((a: any) => {
          a.appDir = join(global.Server.AppDir!, `clickhouse-${a.version}`)
          a.zip = isMacOS()
            ? join(global.Server.Cache!, `clickhouse-${a.version}`)
            : join(global.Server.Cache!, `clickhouse-${a.version}.tgz`)
          a.bin = join(a.appDir, 'clickhouse')
          a.downloaded = existsSync(a.zip)
          a.installed = existsSync(a.bin)
          a.name = `ClickHouse-${a.version}`
        })
        resolve(all)
      } catch {
        resolve([])
      }
    })
  }

  async _installSoftHandle(row: any): Promise<void> {
    await mkdirp(dirname(row.bin))
    if (isMacOS()) {
      // macOS 资产是裸二进制：下载产物直接落位
      await copyFile(row.zip, row.bin)
    } else {
      // Linux 资产是 clickhouse-common-static-{bare}-{arch}.tgz
      await unpack(row.zip, row.appDir)
      const bare = `${row.version}`.replace(/-(stable|lts)$/, '')
      let extracted = join(row.appDir, `clickhouse-common-static-${bare}`, 'usr/bin/clickhouse')
      if (!existsSync(extracted)) {
        // 兜底：包内布局变化时在解压目录中定位 clickhouse 可执行文件
        const res = await execPromise(`find "${row.appDir}" -type f -name clickhouse | head -n 1`)
        extracted = res.stdout.trim()
      }
      if (!extracted || !existsSync(extracted)) {
        throw new Error(`clickhouse binary not found in ${row.appDir}`)
      }
      await copyFile(extracted, row.bin)
      await remove(join(row.appDir, `clickhouse-common-static-${bare}`))
    }
    await chmod(row.bin, '0755')
    // 验证二进制可执行；失败则删除落位文件，避免残缺下载被误判为已安装
    try {
      await execPromise(`"${row.bin}" --version`)
    } catch (e) {
      await remove(row.bin)
      throw e
    }
  }

  allInstalledVersions(setup: any) {
    return new ForkPromise(async (resolve) => {
      const all = [versionLocalFetch(setup?.clickhouse?.dirs ?? [], 'clickhouse', 'clickhouse')]
      Promise.all(all)
        .then(async (list) => {
          let versions: SoftInstalled[] = list.flat()
          versions = versionFilterSame(versions)
          const tasks = versions.map((item) => {
            const command = `"${item.bin}" --version`
            const reg = /(\s)(\d+(\.\d+){1,4})(.*?)/g
            return TaskQueue.run(versionBinVersion, item.bin, command, reg)
          })
          return Promise.all(tasks).then((binVersions) => ({ versions, binVersions }))
        })
        .then(({ versions, binVersions }: any) => {
          binVersions.forEach((v: any, i: number) => {
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
}

export default new Manager()
