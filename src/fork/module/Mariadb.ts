import { join, basename, dirname } from 'path'
import { existsSync, readdirSync } from 'fs'
import { Base } from './Base'
import { I18nT } from '../lang'
import type { SoftInstalled } from '@shared/app'
import { spawnPromiseMore, execPromise, waitTime } from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { writeFile, mkdirp, chmod, unlink, remove } from 'fs-extra'

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
port = 3307
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
      let needRestart = false
      if (!existsSync(dataDir) || readdirSync(dataDir).length === 0) {
        needRestart = true
        await mkdirp(dataDir)
        await chmod(dataDir, '0777')
        bin = join(version.path, 'bin/mariadb-install-db')
        if (!existsSync(bin)) {
          bin = join(version.path, 'bin/mysql_install_db')
        }        
        params.splice(0)
        params.push(`--defaults-file=${m}`)
        params.push(`--datadir=${dataDir}`)
        params.push(`--basedir=${version.path}`)
        params.push('--auth-root-authentication-method=normal')
      }
      try {
        if (existsSync(p)) {
          await unlink(p)
        }
      } catch (e) {}

      on(I18nT('fork.command') + `: ${bin} ${params.join(' ')}`)
      const { promise, spawn } = spawnPromiseMore(bin, params)
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
            if (needRestart && readdirSync(dataDir).length > 0) {
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
}

export default new Manager()
