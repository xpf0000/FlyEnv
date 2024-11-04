import { join, dirname, basename } from 'path'
import { existsSync } from 'fs'
import { Base } from './Base'
import { I18nT } from '../lang'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import {
  execPromiseRoot,
  versionBinVersion,
  versionFilterSame,
  versionFixed,
  versionLocalFetch,
  versionSort,
  waitTime
} from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { copyFile, readFile, writeFile, mkdirp } from 'fs-extra'
import TaskQueue from '../TaskQueue'
import { EOL } from 'os'

class Manager extends Base {
  constructor() {
    super()
    this.type = 'postgresql'
  }

  init() {}

  _startServer(version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject, on) => {
      const bin = version.bin
      const versionTop = version?.version?.split('.')?.shift() ?? ''
      const dbPath = join(global.Server.PostgreSqlDir!, `postgresql${versionTop}`)
      const confFile = join(dbPath, 'postgresql.conf')
      const pidFile = join(dbPath, 'postmaster.pid')
      const logFile = join(dbPath, 'pg.log')
      let sendUserPass = false

      const doRun = async () => {
        if (existsSync(pidFile)) {
          try {
            await execPromiseRoot(`del -Force "${pidFile}"`)
          } catch (e) {}
        }

        const startLogFile = join(global.Server.PostgreSqlDir!, `start.log`)
        const startErrLogFile = join(global.Server.PostgreSqlDir!, `start.error.log`)
        if (existsSync(startErrLogFile)) {
          try {
            await execPromiseRoot(`del -Force "${startErrLogFile}"`)
          } catch (e) {}
        }

        const commands: string[] = [
          '@echo off',
          'chcp 65001>nul',
          `cd /d "${dirname(bin)}"`,
          `start /B ./${basename(bin)} -D "${dbPath}" -l "${logFile}" start > "${startLogFile}" 2>"${startErrLogFile}"`
        ]

        const command = commands.join(EOL)
        console.log('command: ', command)

        const cmdName = `start.cmd`
        const sh = join(global.Server.PostgreSqlDir!, cmdName)
        await writeFile(sh, command)

        const appPidFile = join(global.Server.BaseDir!, `pid/${this.type}.pid`)
        await mkdirp(dirname(appPidFile))
        if (existsSync(appPidFile)) {
          try {
            await execPromiseRoot(`del -Force "${appPidFile}"`)
          } catch (e) {}
        }

        process.chdir(global.Server.PostgreSqlDir!)
        try {
          await execPromiseRoot(
            `powershell.exe -Command "(Start-Process -FilePath ./${cmdName} -PassThru -WindowStyle Hidden).Id"`
          )
        } catch (e: any) {
          console.log('-k start err: ', e)
          reject(e)
          return
        }
        const res = await this.waitPidFile(pidFile, startErrLogFile)
        if (res) {
          if (res?.pid) {
            if (sendUserPass) {
              on(I18nT('fork.postgresqlInit', { dir: dbPath }))
            }
            const pid = res.pid.trim().split('\n').shift()!.trim()
            await writeFile(appPidFile, pid)
            resolve({
              'APP-Service-Start-PID': pid
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
      }

      if (existsSync(confFile)) {
        await doRun()
      } else if (!existsSync(dbPath)) {
        process.env.LC_ALL = global.Server.Local!
        process.env.LANG = global.Server.Local!

        console.log('global.Server.Local: ', global.Server.Local)

        const binDir = dirname(bin)
        const initDB = join(binDir, 'initdb.exe')
        process.chdir(dirname(initDB))
        const command = `start /B ./${basename(initDB)} -D "${dbPath}" -U root > NUL 2>&1 &`
        try {
          await execPromiseRoot(command)
        } catch (e) {
          reject(e)
          return
        }
        await waitTime(1000)
        if (!existsSync(confFile)) {
          reject(new Error(`Data Dir ${dbPath} create faild`))
          return
        }
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

        const defaultConfFile = join(dbPath, 'postgresql.conf.default')
        await copyFile(confFile, defaultConfFile)
        sendUserPass = true
        await doRun()
      } else {
        reject(new Error(`Data Dir ${dbPath} has exists, but conf file not found in dir`))
      }
    })
  }

  fetchAllOnLineVersion() {
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
      Promise.all([versionLocalFetch(setup?.postgresql?.dirs ?? [], 'pg_ctl.exe')])
        .then(async (list) => {
          versions = list.flat()
          versions = versionFilterSame(versions)
          const all = versions.map((item) => {
            const command = `${basename(item.bin)} --version`
            const reg = /(\s)(\d+(\.\d+){1,4})(.*?)/g
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
          resolve(versionSort(versions))
        })
        .catch(() => {
          resolve([])
        })
    })
  }
}

export default new Manager()
