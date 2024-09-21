import { join, basename, dirname } from 'path'
import { existsSync } from 'fs'
import { Base } from './Base'
import { I18nT } from '../lang'
import type { SoftInstalled } from '@shared/app'
import {
  spawnPromiseMore,
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
  versionFilterSame
} from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { writeFile, mkdirp, chmod, unlink, remove } from 'fs-extra'
import { execPromiseRoot } from '@shared/Exec'
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
    return new ForkPromise((resolve, reject) => {
      execPromise('./mariadb-admin --socket=/tmp/mysql.sock -uroot password "root"', {
        cwd: dirname(version.bin)
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
      const dataDir = join(global.Server.MariaDBDir!, `data-${v}`)
      if (!existsSync(m)) {
        const conf = `[mariadbd]
# Only allow connections from localhost
bind-address = 127.0.0.1
sql-mode=NO_ENGINE_SUBSTITUTION
port = 3306
datadir=${dataDir}`
        await writeFile(m, conf)
      }

      const p = join(global.Server.MariaDBDir!, 'mariadb.pid')
      const s = join(global.Server.MariaDBDir!, 'slow.log')
      const e = join(global.Server.MariaDBDir!, 'error.log')
      const params = [
        `--defaults-file=${m}`,
        `--pid-file=${p}`,
        '--slow-query-log=ON',
        `--slow-query-log-file=${s}`,
        `--log-error=${e}`,
        `--socket=/tmp/mysql.sock`
      ]
      if (version?.flag === 'macports') {
        params.push(`--lc-messages-dir=/opt/local/share/${basename(version.path)}/english`)
      }
      let needRestart = false
      if (!existsSync(dataDir)) {
        needRestart = true
        await mkdirp(dataDir)
        await chmod(dataDir, '0777')
        bin = join(version.path, 'bin/mariadb-install-db')
        if (!existsSync(bin)) {
          bin = join(version.path, 'bin/mysql_install_db')
        }
        params.splice(0)
        params.push(`--datadir=${dataDir}`)
        params.push(`--basedir=${version.path}`)
        params.push('--auth-root-authentication-method=normal')
        params.push(`--defaults-file=${m}`)
        if (version?.flag === 'macports') {
          const enDir = join(version.path, 'share')
          if (!existsSync(enDir)) {
            const shareDir = `/opt/local/share/${basename(version.path)}`
            if (existsSync(shareDir)) {
              await execPromiseRoot([`mkdir`, `-p`, enDir])
              await execPromiseRoot([`cp`, `-R`, shareDir, enDir])
            }
          }
        }
      }
      try {
        if (existsSync(p)) {
          await unlink(p)
        }
      } catch (e) {}

      on(I18nT('fork.command') + `: ${bin} ${params.join(' ')}`)
      const { promise, spawn } = await spawnPromiseMore(bin, params)
      let success = false
      let checking = false

      console.log('mariadb start: ', bin, params.join(' '))
      async function checkpid(time = 0) {
        if (existsSync(p)) {
          console.log('time: ', time)
          success = true
          try {
            await execPromise(`kill -9 ${spawn.pid}`)
          } catch (e) {}
        } else {
          if (time < 40) {
            await waitTime(500)
            await checkpid(time + 1)
          } else {
            try {
              await execPromise(`kill -9 ${spawn.pid}`)
            } catch (e) {}
          }
        }
      }
      const unlinkDirOnFail = async () => {
        if (existsSync(dataDir)) {
          await remove(dataDir)
        }
        if (existsSync(m)) {
          await remove(m)
        }
      }
      promise
        .on(async (data) => {
          console.log('promise on: ', data)
          on(data)
          if (!checking) {
            checking = true
            await checkpid()
          }
        })
        .then(async (code) => {
          console.log('promise then: ', code)
          if (success) {
            resolve(code)
          } else {
            if (needRestart) {
              try {
                await this._startServer(version).on(on)
                await this._initPassword(version)
                on(I18nT('fork.postgresqlInit', { dir: dataDir }))
                resolve(code)
              } catch (e) {
                await unlinkDirOnFail()
                reject(e)
              }
            } else {
              reject(code)
            }
          }
        })
        .catch(async (err) => {
          console.log('promise catch: ', err)
          if (needRestart) {
            await unlinkDirOnFail()
          }
          reject(err)
        })
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
      Promise.all([
        versionLocalFetch(setup?.mariadbd?.dirs ?? [], 'mariadbd-safe', 'mariadb'),
        versionMacportsFetch(fpms)
      ])
        .then(async (list) => {
          versions = list.flat()
          versions = versionFilterSame(versions)
          const all = versions.map((item) => {
            const bin = item.bin.replace('-safe', '')
            const command = `${bin} -V`
            const reg = /(Ver )(\d+(\.\d+){1,4})([-\s])/g
            return TaskQueue.run(versionBinVersion, command, reg)
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
