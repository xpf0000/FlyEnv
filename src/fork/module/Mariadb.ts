import { join, basename } from 'path'
import { existsSync } from 'fs'
import { Base } from './Base'
import { I18nT } from '../lang'
import type { SoftInstalled } from '@shared/app'
import { spawnPromiseMore, execPromise, waitTime } from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { writeFile, mkdirp, chmod, unlink } from 'fs-extra'

class Manager extends Base {
  constructor() {
    super()
    this.type = 'mariadb'
  }

  init() {
    this.pidPath = join(global.Server.MariaDBDir!, 'mariadb.pid')
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
      const k = join(global.Server.MysqlDir!, 'mariadb.sock')
      const params = [
        `--defaults-file=${m}`,
        `--pid-file=${p}`,
        '--slow-query-log=ON',
        `--slow-query-log-file=${s}`,
        `--log-error=${e}`,
        `--socket=${k}`
      ]
      if (version?.flag === 'port') {
        params.push(`--lc-messages-dir=/opt/local/share/${basename(version.path)}/english`)
      }
      let needRestart = false
      if (!existsSync(dataDir)) {
        needRestart = true
        await mkdirp(dataDir)
        await chmod(dataDir, '0777')
        bin = join(version.path, 'scripts/mariadb-install-db')
        params.splice(0)
        params.push(`--datadir=${dataDir}`)
        params.push(`--basedir=${version.path}`)
        params.push('--auth-root-authentication-method=normal')
      }
      try {
        if (existsSync(p)) {
          await unlink(p)
        }
      } catch (e) {}

      console.log('mariadb start: ', bin, params.join(' '))
      on(I18nT('fork.command') + `: ${bin} ${params.join(' ')}`)
      const { promise, spawn } = spawnPromiseMore(bin, params)
      let success = false
      let checking = false
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
      promise
        .on(async (data) => {
          on(data)
          if (!checking) {
            checking = true
            await checkpid()
          }
        })
        .then(async (code) => {
          if (success) {
            resolve(code)
          } else {
            if (needRestart) {
              try {
                await this._startServer(version).on(on)
                on(I18nT('fork.postgresqlInit', { dir: dataDir }))
                resolve(code)
              } catch (e) {
                reject(e)
              }
            } else {
              reject(code)
            }
          }
        })
        .catch(reject)
    })
  }
}

export default new Manager()
