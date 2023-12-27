import { join } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { Base } from './Base'
import { I18nT } from '../lang'
import type { SoftInstalled } from '@shared/app'
import { createFolder, chmod, execPromise } from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
class Redis extends Base {
  constructor() {
    super()
    this.type = 'redis'
  }

  init() {
    this.pidPath = join(global.Server.RedisDir!, 'redis.pid')
  }

  initConf(version: SoftInstalled) {
    return new ForkPromise((resolve, reject) => {
      if (!existsSync(version?.bin)) {
        reject(new Error(I18nT('fork.binNoFound')))
        return
      }
      if (!version?.version) {
        reject(new Error(I18nT('fork.versionNoFound')))
        return
      }
      this._initConf(version).then(resolve)
    })
  }
  _initConf(version: SoftInstalled) {
    return new ForkPromise((resolve) => {
      const v = version?.version?.split('.')?.[0] ?? ''
      const confFile = join(global.Server.RedisDir!, `redis-${v}.conf`)
      if (!existsSync(confFile)) {
        const tmplFile = join(global.Server.Static!, 'tmpl/redis.conf')
        const dbDir = join(global.Server.RedisDir!, `db-${v}`)
        createFolder(dbDir)
        chmod(dbDir, '0755')
        let content = readFileSync(tmplFile, 'utf-8')
        content = content
          .replace(/#PID_PATH#/g, join(global.Server.RedisDir!, 'redis.pid'))
          .replace(/#LOG_PATH#/g, join(global.Server.RedisDir!, `redis-${v}.log`))
          .replace(/#DB_PATH#/g, dbDir)
        writeFileSync(confFile, content)
        const defaultFile = join(global.Server.RedisDir!, `redis-${v}-default.conf`)
        writeFileSync(defaultFile, content)
      }
      resolve(confFile)
    })
  }

  _startServer(version: SoftInstalled) {
    return new ForkPromise((resolve, reject, on) => {
      const bin = version.bin
      this._initConf(version).then((confFile) => {
        const checkpid = (time = 0) => {
          if (existsSync(this.pidPath)) {
            resolve(0)
          } else {
            if (time < 20) {
              setTimeout(() => {
                checkpid(time + 1)
              }, 500)
            } else {
              reject(new Error(I18nT('fork.startFail')))
            }
          }
        }
        const command = `echo '${global.Server.Password}' | sudo -S ${bin} ${confFile}`
        execPromise(command)
          .then((res) => {
            on(res.stdout)
            checkpid()
          })
          .catch((err) => {
            reject(err)
          })
      })
    })
  }
}
export default new Redis()
