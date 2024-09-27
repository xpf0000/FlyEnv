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
import { copyFile, unlink, readFile, writeFile } from 'fs-extra'
import TaskQueue from '../TaskQueue'

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
      try {
        if (existsSync(pidFile)) {
          await unlink(pidFile)
        }
      } catch (e) {}

      const checkpid = async (time = 0) => {
        if (existsSync(pidFile)) {
          if (sendUserPass) {
            on(I18nT('fork.postgresqlInit', { dir: dbPath }))
          }
          resolve(true)
        } else {
          if (time < 40) {
            await waitTime(500)
            await checkpid(time + 1)
          } else {
            reject(new Error('Start Failed'))
          }
        }
      }
      const doRun = async () => {
        process.chdir(dirname(bin))
        const command = `start /b ./${basename(bin)} -D "${dbPath}" -l "${logFile}" start`
        try {
          await execPromiseRoot(command)
        } catch (e) {
          reject(e)
          return
        }
        await waitTime(1000)
        await checkpid()
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
        const command = `start /b ./${basename(initDB)} -D "${dbPath}" -U root`
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
        await this._stopServer(version)
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
