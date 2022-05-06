const join = require('path').join
const existsSync = require('fs').existsSync
const Utils = require('./Utils')
const BaseManager = require('./BaseManager')
const execPromise = require('child-process-promise').exec

class ApacheManager extends BaseManager {
  constructor() {
    super()
    this.type = 'apache'
  }

  init() {
    this.pidPath = join(global.Server.ApacheDir, 'common/logs/httpd.pid')
  }

  _startServer(version) {
    return new Promise((resolve, reject) => {
      let logs = join(global.Server.ApacheDir, 'common/logs')
      Utils.createFolder(logs)
      let bin = version.bin
      if (!existsSync(bin)) {
        reject(new Error('启动文件不存在,服务启动失败'))
        return
      }
      const conf = join(global.Server.ApacheDir, 'common/conf/httpd.conf')
      if (!existsSync(conf)) {
        reject(new Error('配置文件不存在,服务器启动失败'))
        return
      }
      execPromise(`echo '${global.Server.Password}' | sudo -S ${bin} -f ${conf} -k start`)
        .then((res) => {
          this._handleLog(res.stdout)
          resolve(0)
        })
        .catch((err) => {
          this._handleLog(err)
          reject(err)
        })
    })
  }
}
module.exports = ApacheManager
