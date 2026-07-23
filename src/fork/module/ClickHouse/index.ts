import { join, dirname } from 'path'
import { existsSync } from 'fs'
import { Base } from '../Base'
import { I18nT } from '@lang/runtime'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import {
  AppLog,
  brewInfoJson,
  chmod,
  copyFile,
  execPromise,
  mkdirp,
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
      { name: 'start-error', path: join(logDir, 'server.start.err.log') }
    ]
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
    return { config, users }
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
      const confFile = join(baseDir, 'config.xml')
      const usersFile = join(baseDir, 'users.xml')
      const logDir = join(baseDir, 'log')

      await mkdirp(baseDir)
      await mkdirp(join(baseDir, 'data'))
      await mkdirp(logDir)

      // 首次启动生成配置；.default 副本供 Conf 编辑器 "load default" 使用
      if (!existsSync(confFile)) {
        const { config, users } = this.configContent()
        await writeFile(confFile, config)
        await writeFile(`${confFile}.default`, config)
        if (!existsSync(usersFile)) {
          await writeFile(usersFile, users)
          await writeFile(`${usersFile}.default`, users)
        }
      }

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

  brewinfo() {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const all = ['clickhouse']
        const info = await brewInfoJson(all)
        resolve(info)
      } catch (e) {
        reject(e)
        return
      }
    })
  }
}

export default new Manager()
