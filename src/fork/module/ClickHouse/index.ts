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
import { isMacOS } from '@shared/utils'

import { ProcessKill, ProcessListFetch } from '@shared/Process'
import {
  CH_UI_CONNECTION_NAME,
  CH_UI_PORT,
  chUIConfigContent,
  chUIReleaseURL,
  clickHouseHttpPort
} from './chUI'
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

  _stopServer(version: SoftInstalled, ...args: any) {
    return new ForkPromise(async (resolve, reject, on) => {
      let uiPids: string[] = []
      try {
        uiPids = await this._stopCHUI()
      } catch (error) {
        console.log('clickhouse stop CH-UI err: ', error)
      }
      try {
        const res: any = await super._stopServer(version, ...args).on(on)
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

  private async _stopCHUI(): Promise<string[]> {
    const bin = this.chUIBin()
    const pidPath = this.chUIPidPath()
    const allPid: string[] = []
    const processes = await ProcessListFetch()

    if (existsSync(pidPath)) {
      try {
        const pid = (await readFile(pidPath, 'utf-8')).trim()
        const process = processes.find((item) => item.PID === pid)
        if (process?.COMMAND.includes(bin)) {
          allPid.push(pid)
        }
      } catch {}
    }

    allPid.push(
      ...processes.filter((item) => item.COMMAND.includes(bin)).map((item) => `${item.PID}`)
    )
    const arr = Array.from(new Set(allPid))
    if (arr.length > 0) {
      try {
        await ProcessKill('-INT', arr)
      } catch {}
    }
    try {
      if (existsSync(pidPath)) {
        await remove(pidPath)
      }
    } catch {}
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
          pidPath: this.appPidFile(),
          baseDir,
          bin,
          execArgs,
          execEnv,
          on,
          waitTime: 3000,
          outFile: join(logDir, 'server.start.out.log'),
          errFile: join(logDir, 'server.start.err.log')
        })
        const pid = `${res['APP-Service-Start-PID']}`.trim().split('\n').shift()!.trim()
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.startServiceSuccess', { pid: pid }))
        })
        resolve({
          'APP-Service-Start-PID': pid
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
