const { join, dirname } = require('path')
const { existsSync, readFileSync, writeFileSync } = require('fs')
const BaseManager = require('./BaseManager')
const { I18nT } = require('./lang/index.js')
const execPromise = require('child-process-promise').exec
const Utils = require('./Utils')

class NginxManager extends BaseManager {
  constructor() {
    super()
    this.type = 'nginx'
  }

  init() {
    this.pidPath = join(global.Server.NginxDir, 'common/logs/nginx.pid')
  }

  #handlePhpEnableConf() {
    const hostfile = join(global.Server.BaseDir, 'host.json')
    let host = []
    if (existsSync(hostfile)) {
      try {
        const content = readFileSync(hostfile, 'utf-8')
        host = JSON.parse(content)
      } catch (e) {}
    }
    const all = new Set(host.map((h) => h.phpVersion).filter((h) => !!h))
    console.log('all: ', all)
    let tmplFile = join(global.Server.Static, 'tmpl/enable-php.conf')
    let tmplContent = ''
    all.forEach((v) => {
      const name = `enable-php-${v}.conf`
      const confFile = join(global.Server.NginxDir, 'common/conf/', name)
      console.log('confFile: ', confFile)
      if (!existsSync(confFile)) {
        Utils.createFolder(dirname(confFile))
        if (!tmplContent) {
          tmplContent = readFileSync(tmplFile, 'utf-8')
        }
        const content = tmplContent.replace('##VERSION##', v)
        writeFileSync(confFile, content)
      }
    })
  }

  _startServer(version) {
    return new Promise((resolve, reject) => {
      this.#handlePhpEnableConf()
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
