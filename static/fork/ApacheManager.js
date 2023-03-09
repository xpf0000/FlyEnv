const join = require('path').join
const { existsSync, readFileSync, writeFileSync } = require('fs')
const Utils = require('./Utils')
const BaseManager = require('./BaseManager')
const { I18nT } = require('./lang/index.js')
const execPromise = require('child-process-promise').exec

class ApacheManager extends BaseManager {
  constructor() {
    super()
    this.type = 'apache'
  }

  init() {
    this.pidPath = join(global.Server.ApacheDir, 'common/logs/httpd.pid')
  }

  #resetConf(version) {
    return new Promise((resolve, reject) => {
      let logs = join(global.Server.ApacheDir, 'common/logs')
      Utils.createFolder(logs)
      let bin = version.bin
      if (!existsSync(bin)) {
        reject(new Error(I18nT('fork.binNoFound')))
        return
      }
      const defaultFile = join(
        global.Server.ApacheDir,
        `common/conf/${Utils.md5(version.bin)}.conf`
      )
      const defaultFileBack = join(
        global.Server.ApacheDir,
        `common/conf/${Utils.md5(version.bin)}.default.conf`
      )
      if (existsSync(defaultFile)) {
        resolve(true)
        return
      }
      // 获取httpd的默认配置文件路径
      execPromise(`${bin} -D DUMP_INCLUDES`)
        .then((res) => {
          const str = res.stdout.toString()
          console.log('DUMP_INCLUDES: ', str)
          const reg = new RegExp('(\\(*\\) )([\\s\\S]*?)(\\n)', 'g')
          let file = ''
          try {
            file = reg.exec(str)[2]
          } catch (e) {}
          file = file.trim()
          if (!file || !existsSync(file)) {
            reject(new Error(I18nT('fork.confNoFound')))
            return
          }
          if (!existsSync(defaultFile)) {
            let content = readFileSync(file, 'utf-8')
            const reg = new RegExp('(CustomLog ")([\\s\\S]*?)(access_log")', 'g')
            let path = ''
            try {
              path = reg.exec(content)[2]
            } catch (e) {}
            path = path.trim()
            if (!path) {
              reject(new Error(I18nT('fork.apacheLogPathErr')))
              return
            }
            const logs = join(global.Server.ApacheDir, 'common/logs/')
            const vhost = join(global.Server.BaseDir, 'vhost/apache/')
            content = content
              .replace(new RegExp(path, 'g'), logs)
              .replace('#LoadModule deflate_module', 'LoadModule deflate_module')
              .replace('#LoadModule proxy_module', 'LoadModule proxy_module')
              .replace('#LoadModule proxy_fcgi_module', 'LoadModule proxy_fcgi_module')
              .replace('#LoadModule ssl_module', 'LoadModule ssl_module')

            let find = content.match(/\nUser _www(.*?)\n/g)
            content = content.replace(find?.[0], '\n#User _www\n')
            find = content.match(/\nGroup _www(.*?)\n/g)
            content = content.replace(find?.[0], '\n#Group _www\n')

            content += `\nPidFile "${logs}httpd.pid"
IncludeOptional "${vhost}*.conf"`
            writeFileSync(defaultFile, content)
            writeFileSync(defaultFileBack, content)
          }
          resolve(true)
        })
        .catch((err) => {
          reject(err)
        })
    })
  }

  _startServer(version) {
    return new Promise((resolve, reject) => {
      this.#resetConf(version)
        .then(() => {
          let logs = join(global.Server.ApacheDir, 'common/logs')
          Utils.createFolder(logs)
          let bin = version.bin
          if (!existsSync(bin)) {
            reject(new Error(I18nT('fork.binNoFound')))
            return
          }
          const conf = join(global.Server.ApacheDir, `common/conf/${Utils.md5(version.bin)}.conf`)
          if (!existsSync(conf)) {
            reject(new Error(I18nT('fork.confNoFound')))
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
        .catch((err) => {
          reject(err)
        })
    })
  }
}
module.exports = ApacheManager
