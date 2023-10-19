const join = require('path').join
const BaseManager = require('./BaseManager')
const { I18nT } = require('./lang/index.js')
const { readFileSync, existsSync, writeFileSync } = require('fs')
const execPromise = require('child-process-promise').exec
const Utils = require('./Utils')
class RedisManager extends BaseManager {
  constructor() {
    super()
    this.type = 'redis'
  }

  init() {
    this.pidPath = join(global.Server.RedisDir, 'redis.pid')
  }

  initConf(version) {
    if (!existsSync(version?.bin)) {
      this._catchError(I18nT('fork.binNoFound'))
      return
    }
    if (!version?.version) {
      this._catchError(I18nT('fork.versionNoFound'))
      return
    }
    this._initConf(version).then(this._thenSuccess)
  }
  _initConf(version) {
    return new Promise((resolve) => {
      const v = version.version.split('.')[0]
      const confFile = join(global.Server.RedisDir, `redis-${v}.conf`)
      if (!existsSync(confFile)) {
        const tmplFile = join(global.Server.Static, 'tmpl/redis.conf')
        const dbDir = join(global.Server.RedisDir, `db-${v}`)
        Utils.createFolder(dbDir)
        Utils.chmod(dbDir, '0755')
        let content = readFileSync(tmplFile, 'utf-8')
        content = content
          .replace(/#PID_PATH#/g, join(global.Server.RedisDir, 'redis.pid'))
          .replace(/#LOG_PATH#/g, join(global.Server.RedisDir, `redis-${v}.log`))
          .replace(/#DB_PATH#/g, dbDir)
        writeFileSync(confFile, content)
        const defaultFile = join(global.Server.RedisDir, `redis-${v}-default.conf`)
        writeFileSync(defaultFile, content)
      }
      resolve(confFile)
    })
  }

  _startServer(version) {
    return new Promise((resolve, reject) => {
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
        let command = `echo '${global.Server.Password}' | sudo -S ${bin} ${confFile}`
        execPromise(command)
          .then((res) => {
            console.log('res: ', res)
            checkpid()
          })
          .catch((err) => {
            console.log('err: ', err)
            reject(err)
          })
      })
    })
  }
}
module.exports = RedisManager
