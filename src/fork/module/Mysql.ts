import { join, dirname, basename } from 'path'
import { existsSync, readdirSync } from 'fs'
import { Base } from './Base'
import { I18nT } from '@lang/index'
import type { MysqlGroupItem, OnlineVersionItem, SoftInstalled } from '@shared/app'
import {
  waitTime,
  versionLocalFetch,
  versionFilterSame,
  versionBinVersion,
  versionFixed,
  versionInitedApp,
  versionSort,
  AppLog,
  execPromise,
  serviceStartExecCMD,
  spawnPromise,
  mkdirp,
  writeFile,
  chmod,
  remove,
  readFile
} from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
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
    return new ForkPromise(async (resolve, reject, on) => {
      on({
        'APP-On-Log': AppLog('info', I18nT('appLog.initDBPass'))
      })
      const bin = join(dirname(version.bin), 'mysqladmin.exe')
      if (existsSync(bin)) {
        process.chdir(dirname(bin))
        try {
          await execPromise(`mysqladmin.exe -uroot password "root"`)
        } catch (e) {
          on({
            'APP-On-Log': AppLog('error', I18nT('appLog.initDBPassFail', { error: e }))
          })
          console.log('_initPassword err: ', e)
          reject(e)
          return
        }
        on({
          'APP-On-Log': AppLog(
            'info',
            I18nT('appLog.initDBPassSuccess', { user: 'root', pass: 'root' })
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
      await this.initLocalApp(version, 'mysql').on(on)
      const bin = version.bin
      const v = version?.version?.split('.')?.slice(0, 2)?.join('.') ?? ''
      const m = join(global.Server.MysqlDir!, `my-${v}.cnf`)
      const dataDir = join(global.Server.MysqlDir!, `data-${v}`).split('\\').join('/')
      if (!existsSync(m)) {
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.confInit'))
        })
        const conf = `[mysqld]
# Only allow connections from localhost
bind-address = 127.0.0.1
sql-mode=NO_ENGINE_SUBSTITUTION
datadir="${dataDir}"`
        await writeFile(m, conf)
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.confInitSuccess', { file: m }))
        })
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
          const baseDir = global.Server.MysqlDir!
          await mkdirp(baseDir)
          const params = [
            `--defaults-file="${m}"`,
            `--pid-file="${p}"`,
            '--user=mysql',
            '--slow-query-log=ON',
            `--slow-query-log-file="${s}"`,
            `--log-error="${e}"`,
            '--standalone'
          ]

          const execEnv = ``
          const execArgs = params.join(' ')

          try {
            const res = await serviceStartExecCMD(
              version,
              p,
              baseDir,
              bin,
              execArgs,
              execEnv,
              on,
              20,
              1000
            )
            resolve(res)
          } catch (e: any) {
            console.log('-k start err: ', e)
            reject(e)
            return
          }
        })
      }

      if (!existsSync(dataDir) || readdirSync(dataDir).length === 0) {
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.initDBDataDir'))
        })
        await mkdirp(dataDir)
        try {
          await chmod(dataDir, '0777')
        } catch {}

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
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.initDBDataDirSuccess', { dir: dataDir }))
        })
        await waitTime(500)
        try {
          const res = await doStart()
          await waitTime(500)
          await this._initPassword(version).on(on)
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
      const arr: Array<number> = []
      let all: PItem[] = []
      try {
        all = await ProcessListSearch(conf, false)
      } catch {}

      all.forEach((item) => arr.push(item.ProcessId))

      if (arr.length > 0) {
        const str = arr.map((s) => `/pid ${s}`).join(' ')
        await execPromise(`taskkill /f /t ${str}`)
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
            await spawnPromise(cmdName, [], {
              shell: 'cmd.exe',
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
          const bin = join(dirname(version.version.bin!), 'mysqladmin.exe')
          if (existsSync(bin)) {
            process.chdir(dirname(bin))
            try {
              await execPromise(
                `${basename(bin)} -P${version.port} -S"${sock}" -uroot password "root"`
              )
            } catch (e) {
              console.log('_initPassword err: ', e)
              reject(e)
              return
            }
          }
          resolve(true)
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
          const res = await execPromise(command)
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
      } catch {
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
