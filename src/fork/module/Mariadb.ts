import { join, dirname, basename } from 'path'
import { existsSync, readdirSync } from 'fs'
import { Base } from './Base'
import { I18nT } from '@lang/index'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import {
  execPromise,
  waitTime,
  versionLocalFetch,
  versionFilterSame,
  versionBinVersion,
  versionFixed,
  versionSort,
  AppLog,
  serviceStartExecCMD
} from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { writeFile, mkdirp, chmod, remove } from 'fs-extra'
import TaskQueue from '../TaskQueue'

class Manager extends Base {
  constructor() {
    super()
    this.type = 'mariadb'
  }

  init() {
    this.pidPath = join(global.Server.MariaDBDir!, 'mariadb.pid')
  }

  _initPassword(version: SoftInstalled) {
    return new ForkPromise((resolve, reject, on) => {
      on({
        'APP-On-Log': AppLog('info', I18nT('appLog.initDBPass'))
      })
      const bin = join(dirname(version.bin), 'mariadb-admin.exe')
      const v = version?.version?.split('.')?.slice(0, 2)?.join('.') ?? ''
      const m = join(global.Server.MariaDBDir!, `my-${v}.cnf`)

      execPromise(`${basename(bin)} --defaults-file="${m}" --port=3306 -uroot password "root"`, {
        cwd: dirname(bin)
      })
        .then((res) => {
          console.log('_initPassword res: ', res)
          on({
            'APP-On-Log': AppLog(
              'info',
              I18nT('appLog.initDBPassSuccess', { user: 'root', pass: 'root' })
            )
          })
          resolve(true)
        })
        .catch((err) => {
          on({
            'APP-On-Log': AppLog('error', I18nT('appLog.initDBPassFail', { error: err }))
          })
          console.log('_initPassword err: ', err)
          reject(err)
        })
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
      const v = version?.version?.split('.')?.slice(0, 2)?.join('.') ?? ''
      const m = join(global.Server.MariaDBDir!, `my-${v}.cnf`)
      const dataDir = join(global.Server.MariaDBDir!, `data-${v}`).split('\\').join('/')
      if (!existsSync(m)) {
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.confInit'))
        })
        const conf = `[mariadbd]
# Only allow connections from localhost
bind-address = 127.0.0.1
sql-mode=NO_ENGINE_SUBSTITUTION
port = 3306
datadir="${dataDir}"`
        await writeFile(m, conf)
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.confInitSuccess', { file: m }))
        })
      }

      const p = join(global.Server.MariaDBDir!, 'mariadb.pid')
      const s = join(global.Server.MariaDBDir!, 'slow.log')
      const e = join(global.Server.MariaDBDir!, 'error.log')
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
          const baseDir = global.Server.MariaDBDir!
          await mkdirp(baseDir)
          const params = [
            `--defaults-file="${m}"`,
            `--pid-file="${p}"`,
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
        await chmod(dataDir, '0777')

        const binInstallDB = join(version.path, 'bin/mariadb-install-db.exe')

        const params = [`--datadir="${dataDir}"`, `--config="${m}"`]

        process.chdir(dirname(binInstallDB))
        command = `${basename(binInstallDB)} ${params.join(' ')}`
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

  fetchAllOnlineVersion() {
    return new ForkPromise(async (resolve) => {
      try {
        const all: OnlineVersionItem[] = await this._fetchOnlineVersion('mariadb')
        all.forEach((a: any) => {
          const dir = join(global.Server.AppDir!, `mariadb-${a.version}`, 'bin/mariadbd.exe')
          const zip = join(global.Server.Cache!, `mariadb-${a.version}.zip`)
          a.appDir = join(global.Server.AppDir!, `mariadb-${a.version}`)
          a.zip = zip
          a.bin = dir
          a.downloaded = existsSync(zip)
          const oldDir = join(
            global.Server.AppDir!,
            `mariadb-${a.version}`,
            `mariadb-${a.version}-winx64`,
            'bin/mariadbd.exe'
          )
          a.installed = existsSync(dir) || existsSync(oldDir)
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
      Promise.all([versionLocalFetch(setup?.mariadb?.dirs ?? [], 'mariadbd.exe')])
        .then(async (list) => {
          versions = list.flat()
          versions = versionFilterSame(versions)
          const all = versions.map((item) => {
            const command = `${basename(item.bin)} -V`
            const reg = /(Ver )(\d+(\.\d+){1,4})([-\s])/g
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
