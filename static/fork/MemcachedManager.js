const join = require('path').join
const existsSync = require('fs').existsSync
const BaseManager = require('./BaseManager')
const Utils = require('./Utils')
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
      let bin = version.bin
      if (!existsSync(bin)) {
        reject(new Error('启动文件不存在,服务启动失败'))
        return
      }
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
              reject(new Error('启动失败,请查看日志文件'))
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
