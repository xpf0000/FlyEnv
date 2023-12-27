import { join, basename } from 'path'
import { existsSync } from 'fs'
import { Base } from './Base'
import { I18nT } from '../lang'
import type { SoftInstalled } from '@shared/app'
import { spawnPromiseMore, execPromise, waitTime } from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { mkdirp, writeFile, chmod } from 'fs-extra'

class Mysql extends Base {
  constructor() {
    super()
    this.type = 'mysql'
  }

  init() {
    this.pidPath = join(global.Server.MysqlDir!, 'mysql.pid')
  }

  _startServer(version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject, on) => {
      console.log('version: ', version)
      let bin = version.bin
      const v = version?.version?.split('.')?.slice(0, 2)?.join('.') ?? ''
      const m = join(global.Server.MysqlDir!, `my-${v}.cnf`)
      const oldm = join(global.Server.MysqlDir!, 'my.cnf')
      const dataDir = join(global.Server.MysqlDir!, `data-${v}`)
      if (!existsSync(m)) {
        const conf = `[mysqld]
# Only allow connections from localhost
bind-address = 127.0.0.1
sql-mode=NO_ENGINE_SUBSTITUTION

#设置数据目录
#brew安装的mysql, 数据目录是一样的, 会导致5.x版本和8.x版本无法互相切换, 所以为每个版本单独设置自己的数据目录
#如果配置文件已更改, 原配置文件在: ${oldm}
#可以复制原配置文件的内容, 使用原来的配置
datadir=${dataDir}`
        await writeFile(m, conf)
      }

      const p = join(global.Server.MysqlDir!, 'mysql.pid')
      const s = join(global.Server.MysqlDir!, 'slow.log')
      const e = join(global.Server.MysqlDir!, 'error.log')
      const params = [
        `--defaults-file=${m}`,
        `--pid-file=${p}`,
        '--user=mysql',
        `--slow-query-log-file=${s}`,
        `--log-error=${e}`,
        '--socket=/tmp/mysql.sock'
      ]
      if (version?.flag === 'port') {
        params.push(`--lc-messages-dir=/opt/local/share/${basename(version.path)}/english`)
      }
      let needRestart = false
      if (!existsSync(dataDir)) {
        needRestart = true
        await mkdirp(dataDir)
        await chmod(dataDir, '0777')
        if (version?.version?.indexOf('5.6.') === 0) {
          bin = join(version.path, 'scripts/mysql_install_db')
          params.splice(0)
          params.push(`--datadir=${dataDir}`)
          params.push(`--basedir=${version.path}`)
        } else {
          params.push('--initialize-insecure')
        }
      }
      console.log('mysql start: ', bin, params.join(' '))
      on(I18nT('fork.command') + `: ${bin} ${params.join(' ')}`)
      const { promise, spawn } = spawnPromiseMore(bin, params)
      let success = false
      let checking = false
      async function checkpid(time = 0) {
        if (existsSync(p)) {
          console.log('time: ', time)
          success = true
          await execPromise(`kill -9 ${spawn.pid}`)
        } else {
          if (time < 40) {
            await waitTime(500)
            await checkpid(time + 1)
          } else {
            await execPromise(`kill -9 ${spawn.pid}`)
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
export default new Mysql()
