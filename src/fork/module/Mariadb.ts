import { join } from 'path'
import { existsSync, readdirSync } from 'fs'
import { Base } from './Base'
import { I18nT } from '../lang'
import type { SoftInstalled } from '@shared/app'
import { execPromise, waitTime } from '../Fn'
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
      let cwd = ''
      if (existsSync(join(version.path, 'bin/mariadb-admin'))) {
        cwd = join(version.path, 'bin')
      } else if (existsSync(join(version.path, 'sbin/mariadb-admin'))) {
        cwd = join(version.path, 'sbin')
      } else if (version.bin === '/usr/libexec/mysqld' && existsSync('/usr/bin/mariadb-admin')) {
        cwd = '/usr/bin'
      }
      if (!cwd) {
        reject(new Error('Init Password Failed'))
        return
      }

      execPromise('./mariadb-admin --socket=/tmp/mysql.sock -uroot password "root"', {
        cwd
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
      const bin = version.bin
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

      const unlinkDirOnFail = async () => {
        if (existsSync(dataDir)) {
          await remove(dataDir)
        }
        if (existsSync(m)) {
          await remove(m)
        }
      }

      let isInit = false
      if (!existsSync(dataDir) || readdirSync(dataDir).length === 0) {
        isInit = true
        await mkdirp(dataDir)
        await chmod(dataDir, '0777')
        let installDBBin = ''
        if (existsSync(join(version.path, 'mariadb-install-db'))) {
          installDBBin = join(version.path, 'mariadb-install-db')
        } else if (existsSync(join(version.path, 'bin/mariadb-install-db'))) {
          installDBBin = join(version.path, 'bin/mariadb-install-db')
        } else if (existsSync(join(version.path, 'sbin/mariadb-install-db'))) {
          installDBBin = join(version.path, 'sbin/mariadb-install-db')
        } else if (existsSync(join(version.path, 'script/mariadb-install-db'))) {
          installDBBin = join(version.path, 'script/mariadb-install-db')
        } else if (
          version.bin === '/usr/libexec/mariadbd' &&
          existsSync('/usr/bin/mariadb-install-db')
        ) {
          installDBBin = '/usr/bin/mariadb-install-db'
        }
        if (!installDBBin) {
          reject(new Error('Start Failed: No Found mariadb-install-db'))
          return
        }
        const params = [
          `--defaults-file=${m}`,
          `--datadir=${dataDir}`,
          `--basedir=${version.path}`,
          '--auth-root-authentication-method=normal'
        ]

        const command = `${installDBBin} ${params.join(' ')}`
        console.log('mysql start: ', command)
        on(I18nT('fork.command') + `: ${command}`)

        await execPromise(command)
        if (readdirSync(dataDir).length === 0) {
          await unlinkDirOnFail()
          reject(new Error('Start Failed'))
          return
        }
      }

      try {
        if (existsSync(p)) {
          await unlink(p)
        }
      } catch (e) {}

      const checkpid = async (time = 0) => {
        if (existsSync(p)) {
          console.log('time: ', time)
          if (isInit) {
            await this._initPassword(version)
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
      try {
        const command = `nohup ${bin} ${params.join(' ')} &`
        console.log('mysql start: ', command)
        on(I18nT('fork.command') + `: ${command}`)
        await execPromise(command)
        console.log('command end checkpid !!!')
        await checkpid()
      } catch (e) {
        console.log('command error: ', e)
        reject(e)
        return
      }
    })
  }
}

export default new Manager()
