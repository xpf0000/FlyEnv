import { join, dirname, basename } from 'path'
import { existsSync, readdirSync } from 'fs'
import { Base } from './Base'
import { I18nT } from '../lang'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import {
  execPromise,
  waitTime,
  execPromiseRoot,
  versionLocalFetch,
  versionFilterSame,
  versionBinVersion,
  versionFixed,
  versionSort
} from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { writeFile, mkdirp, chmod, remove, readFile } from 'fs-extra'
import TaskQueue from '../TaskQueue'
import { EOL } from 'os'

class Manager extends Base {
  constructor() {
    super()
    this.type = 'mariadb'
  }

  init() {
    this.pidPath = join(global.Server.MariaDBDir!, 'mariadb.pid')
  }

  _initPassword(version: SoftInstalled) {
    return new ForkPromise((resolve, reject) => {
      const bin = join(dirname(version.bin), 'mariadb-admin.exe')
      const v = version?.version?.split('.')?.slice(0, 2)?.join('.') ?? ''
      const m = join(global.Server.MariaDBDir!, `my-${v}.cnf`)

      execPromise(`${basename(bin)} --defaults-file="${m}" --port=3306 -uroot password "root"`, {
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
      let bin = version.bin
      const v = version?.version?.split('.')?.slice(0, 2)?.join('.') ?? ''
      const m = join(global.Server.MariaDBDir!, `my-${v}.cnf`)
      const dataDir = join(global.Server.MariaDBDir!, `data-${v}`).split('\\').join('/')
      if (!existsSync(m)) {
        const conf = `[mariadbd]
# Only allow connections from localhost
bind-address = 127.0.0.1
sql-mode=NO_ENGINE_SUBSTITUTION
port = 3306
datadir="${dataDir}"`
        await writeFile(m, conf)
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
          if (existsSync(p)) {
            try {
              await execPromiseRoot(`del -Force "${p}"`)
            } catch (e) {}
          }

          const startLogFile = join(global.Server.MariaDBDir!, `start.log`)
          const startErrLogFile = join(global.Server.MariaDBDir!, `start.error.log`)
          if (existsSync(startErrLogFile)) {
            try {
              await execPromiseRoot(`del -Force "${startErrLogFile}"`)
            } catch (e) {}
          }

          const params = [
            `--defaults-file="${m}"`,
            `--pid-file="${p}"`,
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
          const sh = join(global.Server.MariaDBDir!, cmdName)
          await writeFile(sh, command)

          const appPidFile = join(global.Server.BaseDir!, `pid/${this.type}.pid`)
          await mkdirp(dirname(appPidFile))
          if (existsSync(appPidFile)) {
            try {
              await execPromiseRoot(`del -Force "${appPidFile}"`)
            } catch (e) {}
          }

          process.chdir(global.Server.MariaDBDir!)
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

        bin = join(version.path, 'bin/mariadb-install-db.exe')

        const params = [`--datadir="${dataDir}"`, `--config="${m}"`]

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

  fetchAllOnLineVersion() {
    return new ForkPromise(async (resolve) => {
      try {
        const all: OnlineVersionItem[] = await this._fetchOnlineVersion('mariadb')
        all.forEach((a: any) => {
          const dir = join(
            global.Server.AppDir!,
            `mariadb-${a.version}`,
            `mariadb-${a.version}-winx64`,
            'bin/mariadbd.exe'
          )
          const zip = join(global.Server.Cache!, `mariadb-${a.version}.zip`)
          a.appDir = join(global.Server.AppDir!, `mariadb-${a.version}`)
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
