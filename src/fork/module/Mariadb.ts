import { join, basename, dirname } from 'path'
import { existsSync, readdirSync } from 'fs'
import { Base } from './Base'
import { I18nT } from '@lang/index'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import {
  execPromise,
  waitTime,
  versionLocalFetch,
  versionMacportsFetch,
  versionFixed,
  versionSort,
  getSubDirAsync,
  versionBinVersion,
  brewInfoJson,
  brewSearch,
  portSearch,
  versionFilterSame,
  AppLog,
  serviceStartExec,
  writeFile,
  mkdirp,
  chmod,
  remove,
  serviceStartExecCMD,
  zipUnpack,
  moveChildDirToParent
} from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import TaskQueue from '../TaskQueue'
import Helper from '../Helper'
import { isMacOS, isWindows, pathFixedToUnix } from '@shared/utils'

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
      let promise: Promise<any> | undefined
      if (isMacOS()) {
        promise = execPromise('./mariadb-admin --socket=/tmp/mysql.sock -uroot password "root"', {
          cwd: dirname(version.bin)
        })
      } else if (isWindows()) {
        const bin = join(dirname(version.bin), 'mariadb-admin.exe')
        const v = version?.version?.split('.')?.slice(0, 2)?.join('.') ?? ''
        const m = join(global.Server.MariaDBDir!, `my-${v}.cnf`)

        promise = execPromise(
          `${basename(bin)} --defaults-file="${m}" --port=3306 -uroot password "root"`,
          {
            cwd: dirname(bin)
          }
        )
      }

      promise!
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
      const v = version?.version?.split('.')?.slice(0, 2)?.join('.') ?? ''
      const m = pathFixedToUnix(join(global.Server.MariaDBDir!, `my-${v}.cnf`))
      const dataDir = pathFixedToUnix(join(global.Server.MariaDBDir!, `data-${v}`))
      if (!existsSync(m)) {
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.confInit'))
        })
        const conf = `[mariadbd]
# Only allow connections from localhost
bind-address = 127.0.0.1
sql-mode=NO_ENGINE_SUBSTITUTION
port = 3306
datadir=${dataDir}`
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

      const baseDir = global.Server.MariaDBDir!
      await mkdirp(baseDir)

      const doStart = async () => {
        return new Promise(async (resolve, reject) => {
          const p = join(global.Server.MariaDBDir!, 'mariadb.pid')
          const s = join(global.Server.MariaDBDir!, 'slow.log')
          const e = join(global.Server.MariaDBDir!, 'error.log')
          const bin = version.bin

          if (isMacOS()) {
            const params = [
              `--defaults-file="${m}"`,
              `--pid-file="${p}"`,
              '--slow-query-log=ON',
              `--slow-query-log-file="${s}"`,
              `--log-error="${e}"`,
              `--socket=/tmp/mysql.sock`
            ]
            if (version?.flag === 'macports') {
              params.push(`--lc-messages-dir="/opt/local/share/${basename(version.path)}/english"`)
            }

            const bin = version.bin
            const execEnv = ''
            const execArgs = params.join(' ')

            try {
              const res = await serviceStartExec({
                version,
                pidPath: p,
                baseDir,
                bin,
                execArgs,
                execEnv,
                on
              })
              resolve(res)
            } catch (e: any) {
              console.log('-k start err: ', e)
              reject(e)
              return
            }
          } else if (isWindows()) {
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
              const res = await serviceStartExecCMD({
                version,
                pidPath: p,
                baseDir,
                bin,
                execArgs,
                execEnv,
                on,
                maxTime: 20,
                timeToWait: 1000
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
        if (isMacOS()) {
          let bin = join(version.path, 'bin/mariadb-install-db')
          if (!existsSync(bin)) {
            bin = join(version.path, 'bin/mysql_install_db')
          }
          const params: string[] = []
          params.push(`--datadir="${dataDir}"`)
          params.push(`--basedir="${version.path}"`)
          params.push('--auth-root-authentication-method=normal')
          params.push(`--defaults-file="${m}"`)
          if (version?.flag === 'macports') {
            const enDir = join(version.path, 'share')
            if (!existsSync(enDir)) {
              const shareDir = `/opt/local/share/${basename(version.path)}`
              if (existsSync(shareDir)) {
                await Helper.send('mariadb', 'macportsDirFixed', enDir, shareDir)
              }
            }
          }
          try {
            await execPromise(`cd "${dirname(bin)}" && ./${basename(bin)} ${params.join(' ')}`)
          } catch (e) {
            on({
              'APP-On-Log': AppLog('error', I18nT('appLog.initDBDataDirFail', { error: e }))
            })
            reject(e)
            return
          }
        } else if (isWindows()) {
          const binInstallDB = join(version.path, 'bin/mariadb-install-db.exe')

          const params = [`--datadir="${dataDir}"`, `--config="${m}"`]

          process.chdir(dirname(binInstallDB))
          const command = `${basename(binInstallDB)} ${params.join(' ')}`
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
        .filter((f) => f.startsWith('mariadb'))
        .map((f) => `lib/${f}/bin/mariadbd-safe`)
      let versions: SoftInstalled[] = []
      let all: Promise<SoftInstalled[]>[] = []
      if (isMacOS()) {
        all = [
          versionLocalFetch(setup?.mariadbd?.dirs ?? [], 'mariadbd-safe', 'mariadb'),
          versionMacportsFetch(fpms)
        ]
      } else if (isWindows()) {
        all = [versionLocalFetch(setup?.mariadb?.dirs ?? [], 'mariadbd.exe')]
      }
      Promise.all(all)
        .then(async (list) => {
          versions = list.flat()
          versions = versionFilterSame(versions)
          const all = versions.map((item) => {
            const command = `"${item.bin}" -V`
            const reg = /(Ver )(\d+(\.\d+){1,4})([-\s])/g
            return TaskQueue.run(versionBinVersion, item.bin, command, reg)
          })
          return Promise.all(all)
        })
        .then((list) => {
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

  async _installSoftHandle(row: any): Promise<void> {
    if (isWindows()) {
      await remove(row.appDir)
      await mkdirp(row.appDir)
      await zipUnpack(row.zip, row.appDir)
      await moveChildDirToParent(row.appDir)
    }
  }

  brewinfo() {
    return new ForkPromise(async (resolve, reject) => {
      try {
        let all: Array<string> = ['mariadb']
        const cammand = 'brew search -q --formula "/mariadb@[\\d\\.]+$/"'
        all = await brewSearch(all, cammand)
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
        '^mariadb-([\\d\\.]*)\\d$',
        (f) => {
          return f.includes('Multithreaded SQL database server')
        },
        (name) => {
          return (
            existsSync(join('/opt/local/lib', name, 'bin/mariadbd-safe')) ||
            existsSync(join('/opt/local/lib', name, 'bin/mysqld_safe'))
          )
        }
      )
      resolve(Info)
    })
  }
}

export default new Manager()
