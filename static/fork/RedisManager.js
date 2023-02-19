const join = require('path').join
const existsSync = require('fs').existsSync
const BaseManager = require('./BaseManager')
const { I18nT } = require('./lang/index.js')
const execPromise = require('child-process-promise').exec
class RedisManager extends BaseManager {
  constructor() {
    super()
    this.type = 'redis'
  }

  init() {
    this.pidPath = join(global.Server.RedisDir, 'common/run/redis.pid')
  }

  _startServer(version) {
    return new Promise((resolve, reject) => {
      let bin = version.bin
      if (!existsSync(bin)) {
        reject(new Error(I18nT('fork.binNoFound')))
        return
      }
      let realConf = join(global.Server.RedisDir, 'common/redis.conf')
      let command = `echo '${global.Server.Password}' | sudo -S ${bin} ${realConf}`
      execPromise(command)
        .then((res) => {
          console.log('res: ', res)
          setTimeout(() => {
            if (existsSync(this.pidPath)) {
              resolve(0)
            } else {
              reject(new Error(I18nT('fork.startFail')))
            }
          }, 600)
        })
        .catch((err) => {
          console.log('err: ', err)
          reject(err)
        })
    })
  }
}
module.exports = RedisManager
