const join = require('path').join
const existsSync = require('fs').existsSync
const BaseManager = require('./BaseManager')
const { I18nT } = require('./lang/index.js')
const execPromise = require('child-process-promise').exec

class NginxManager extends BaseManager {
  constructor() {
    super()
    this.type = 'nginx'
  }

  init() {
    this.pidPath = join(global.Server.NginxDir, 'common/logs/nginx.pid')
  }

  _startServer(version) {
    return new Promise((resolve, reject) => {
      const bin = version.bin
      let c = join(global.Server.NginxDir, 'common/conf/nginx.conf')
      let pid = join(global.Server.NginxDir, 'common/logs/nginx.pid')
      let errlog = join(global.Server.NginxDir, 'common/logs/error.log')
      let g = `pid ${pid};error_log ${errlog};`
      execPromise(`echo '${global.Server.Password}' | sudo -S ${bin} -c ${c} -g '${g}'`)
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
module.exports = NginxManager
