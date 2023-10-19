const join = require('path').join
const existsSync = require('fs').existsSync
const BaseManager = require('./BaseManager')
const Utils = require('./Utils')
const { I18nT } = require('./lang/index.js')
const execPromise = require('child-process-promise').exec
class MemcachedManager extends BaseManager {
  constructor() {
    super()
    this.type = 'memcached'
  }

  init() {
    this.pidPath = join(global.Server.MemcachedDir, 'logs/memcached.pid')
  }

  _startServer(version) {
    return new Promise((resolve, reject) => {
      const bin = version.bin
      let common = join(global.Server.MemcachedDir, 'logs')
      Utils.createFolder(common)
      let pid = join(common, 'memcached.pid')
      let log = join(common, 'memcached.log')
      let command = `${bin} -d -P ${pid} -vv >> ${log} 2>&1`
      execPromise(command)
        .then((res) => {
          console.log('res: ', res)
          setTimeout(() => {
            if (existsSync(pid)) {
              resolve(0)
            } else {
              reject(new Error(I18nT('fork.startFail')))
            }
          }, 600)
        })
        .catch((err) => {
          reject(err)
        })
    })
  }
}
module.exports = MemcachedManager
