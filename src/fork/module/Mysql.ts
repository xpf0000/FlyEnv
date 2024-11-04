import { join, dirname, basename } from 'path'
import { existsSync, readdirSync } from 'fs'
import { Base } from './Base'
import { I18nT } from '../lang'
import type { MysqlGroupItem, OnlineVersionItem, SoftInstalled } from '@shared/app'
import {
  execPromise,
  waitTime,
  execPromiseRoot,
  versionLocalFetch,
  versionFilterSame,
  versionBinVersion,
  versionFixed,
  versionInitedApp,
  versionSort
} from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { mkdirp, writeFile, chmod, remove, readFile } from 'fs-extra'
import TaskQueue from '../TaskQueue'
import { EOL } from 'os'
import { PItem, ProcessListSearch } from '../Process'

class Mysql extends Base {
  constructor() {
    super()
    this.type = 'mysql'
  }

  init() {
    this.pidPath = join(global.Server.MysqlDir!, 'mysql.pid')
  }

  _initPassword(version: SoftInstalled) {
    return new ForkPromise((resolve, reject) => {
      const bin = join(dirname(version.bin), 'mysqladmin.exe')
      execPromise(`mysqladmin.exe -uroot password "root"`, {
        cwd: dirname(bin)
      })
        .then((res) => {
          console.log('_initPassword res: ', res)
          resolve(true)
        })
        .catch((err) => {
          console.log('_initPassword err: ', err)
          reject(err)
        })
    })
  }

  _startServer(version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject, on) => {
      await this.initLocalApp(version, 'mysql')
      const bin = version.bin
      const v = version?.version?.split('.')?.slice(0, 2)?.join('.') ?? ''
      const m = join(global.Server.MysqlDir!, `my-${v}.cnf`)
      const oldm = join(global.Server.MysqlDir!, 'my.cnf')
      const dataDir = join(global.Server.MysqlDir!, `data-${v}`).split('\\').join('/')
      if (!existsSync(m)) {
        const conf = `[mysqld]
# Only allow connections from localhost
bind-address = 127.0.0.1
sql-mode=NO_ENGINE_SUBSTITUTION
#设置数据目录
#brew安装的mysql, 数据目录是一样的, 会导致5.x版本和8.x版本无法互相切换, 所以为每个版本单独设置自己的数据目录
#如果配置文件已更改, 原配置文件在: ${oldm}
#可以复制原配置文件的内容, 使用原来的配置
datadir="${dataDir}"`
        await writeFile(m, conf)
      }

      const p = join(global.Server.MysqlDir!, 'mysql.pid')
      const s = join(global.Server.MysqlDir!, 'slow.log')
      const e = join(global.Server.MysqlDir!, 'error.log')
      let command = ''

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
          if (existsSync(p)) {
            try {
              await execPromiseRoot(`del -Force "${p}"`)
            } catch (e) {}
          }

          const startLogFile = join(global.Server.MysqlDir!, `start.log`)
          const startErrLogFile = join(global.Server.MysqlDir!, `start.error.log`)
          if (existsSync(startErrLogFile)) {
            try {
              await execPromiseRoot(`del -Force "${startErrLogFile}"`)
            } catch (e) {}
          }

          const params = [
            `--defaults-file="${m}"`,
            `--pid-file="${p}"`,
            '--user=mysql',
            '--slow-query-log=ON',
            `--slow-query-log-file="${s}"`,
            `--log-error="${e}"`,
            '--standalone'
          ]

          const commands: string[] = [
            '@echo off',
            'chcp 65001>nul',
            `cd /d "${dirname(bin)}"`,
            `start /B ./${basename(bin)} ${params.join(' ')} > "${startLogFile}" 2>"${startErrLogFile}"`
          ]

          command = commands.join(EOL)
          console.log('command: ', command)

          const cmdName = `start.cmd`
          const sh = join(global.Server.MysqlDir!, cmdName)
          await writeFile(sh, command)

          const appPidFile = join(global.Server.BaseDir!, `pid/${this.type}.pid`)
          await mkdirp(dirname(appPidFile))
          if (existsSync(appPidFile)) {
            try {
              await execPromiseRoot(`del -Force "${appPidFile}"`)
            } catch (e) {}
          }

          process.chdir(global.Server.MysqlDir!)
          try {
            await execPromiseRoot(
              `powershell.exe -Command "(Start-Process -FilePath ./${cmdName} -PassThru -WindowStyle Hidden).Id"`
            )
          } catch (e: any) {
            console.log('-k start err: ', e)
            reject(e)
            return
          }
          const res = await this.waitPidFile(p, startErrLogFile)
          if (res) {
            if (res?.pid) {
              await writeFile(appPidFile, res.pid)
              resolve({
                'APP-Service-Start-PID': res.pid
              })
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

      if (!existsSync(dataDir) || readdirSync(dataDir).length === 0) {
        await mkdirp(dataDir)
        await chmod(dataDir, '0777')

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
        command = `${basename(bin)} ${params.join(' ')}`
        console.log('command: ', command)
        try {
          const res = await execPromiseRoot(command)
          console.log('init res: ', res)
          on(res.stdout)
        } catch (e: any) {
          reject(e)
          return
        }
        await waitTime(500)
        try {
          const res = await doStart()
          await waitTime(500)
          await this._initPassword(version)
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

  stopGroupService(version: MysqlGroupItem) {
    console.log(version)
    return new ForkPromise(async (resolve) => {
      const id = version?.id ?? ''
      const conf =
        'PhpWebStudy-Data' +
        join(global.Server.MysqlDir!, `group/my-group-${id}.cnf`).split('PhpWebStudy-Data').pop()
      const arr: Array<string> = []
      let all: PItem[] = []
      try {
        all = await ProcessListSearch(conf, false)
      } catch (e) {}

      all.forEach((item) => arr.push(item.ProcessId))

      if (arr.length > 0) {
        const str = arr.map((s) => `/pid ${s}`).join(' ')
        await execPromiseRoot(`taskkill /f /t ${str}`)
      }
      await waitTime(500)
      resolve({
        'APP-Service-Stop-PID': arr
      })
    })
  }

  startGroupServer(version: MysqlGroupItem) {
    return new ForkPromise(async (resolve, reject, on) => {
      await this.initLocalApp(version.version as any, 'mysql')
      await this.stopGroupService(version)
      const bin = version.version.bin
      const id = version?.id ?? ''
      const m = join(global.Server.MysqlDir!, `group/my-group-${id}.cnf`)
      await mkdirp(dirname(m))
      const dataDir = version.dataDir
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

      const doStart = () => {
        return new Promise(async (resolve, reject) => {
          if (existsSync(p)) {
            try {
              await execPromiseRoot(`del -Force "${p}"`)
            } catch (e) {}
          }

          const startLogFile = join(global.Server.MysqlDir!, `group/start.${id}.log`)
          const startErrLogFile = join(global.Server.MysqlDir!, `start.error.${id}.log`)
          if (existsSync(startErrLogFile)) {
            try {
              await execPromiseRoot(`del -Force "${startErrLogFile}"`)
            } catch (e) {}
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

          const cmdName = `start.cmd`
          const sh = join(global.Server.MysqlDir!, cmdName)
          await writeFile(sh, command)

          process.chdir(global.Server.MysqlDir!)
          try {
            await execPromiseRoot(
              `powershell.exe -Command "(Start-Process -FilePath ./${cmdName} -PassThru -WindowStyle Hidden).Id"`
            )
          } catch (e: any) {
            console.log('-k start err: ', e)
            reject(e)
            return
          }
          const res = await this.waitPidFile(p, startErrLogFile)
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
        return new ForkPromise((resolve, reject) => {
          const bin = join(dirname(version.version.bin!), 'mysqladmin.exe')
          execPromise(`${basename(bin)} -P${version.port} -S"${sock}" -uroot password "root"`, {
            cwd: dirname(bin)
          })
            .then((res) => {
              console.log('_initPassword res: ', res)
              resolve(true)
            })
            .catch((err) => {
              console.log('_initPassword err: ', err)
              reject(err)
            })
        })
      }

      let command = ''
      if (!existsSync(dataDir) || readdirSync(dataDir).length === 0) {
        await mkdirp(dataDir)
        await chmod(dataDir, '0777')
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
          const res = await execPromiseRoot(command)
          console.log('init res: ', res)
          on(res.stdout)
        } catch (e: any) {
          reject(e)
          return
        }
        await waitTime(500)
        try {
          await doStart()
          await waitTime(500)
          await initPassword()
          on(I18nT('fork.postgresqlInit', { dir: dataDir }))
          resolve(true)
        } catch (e) {
          await unlinkDirOnFail()
          reject(e)
        }
      } else {
        doStart().then(resolve).catch(reject)
      }
    })
  }

  fetchAllOnLineVersion() {
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
        })
        resolve(all)
      } catch (e) {
        resolve([])
      }
    })
  }

  allInstalledVersions(setup: any) {
    return new ForkPromise((resolve) => {
      let versions: SoftInstalled[] = []
      Promise.all([versionLocalFetch(setup?.mysql?.dirs ?? [], 'mysqld.exe')])
        .then(async (list) => {
          versions = list.flat().filter((v) => !v.bin.includes('mariadb'))
          versions = versionFilterSame(versions)
          const all = versions.map((item) => {
            const command = `${basename(item.bin)} -V`
            const reg = /(Ver )(\d+(\.\d+){1,4})( )/g
            return TaskQueue.run(versionBinVersion, item.bin, command, reg)
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
          const appInited = await versionInitedApp('mysql', 'bin/mysqld.exe')
          versions.push(...appInited.filter((a) => !versions.find((v) => v.bin === a.bin)))
          resolve(versionSort(versions))
        })
        .catch(() => {
          resolve([])
        })
    })
  }
}
export default new Mysql()
