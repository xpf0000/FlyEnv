const join = require('path').join
const { existsSync, readFileSync, writeFileSync } = require('fs')
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

  #resetConf(version) {
    return new Promise((resolve, reject) => {
      let logs = join(global.Server.ApacheDir, 'common/logs')
      Utils.createFolder(logs)
      let bin = version.bin
      if (!existsSync(bin)) {
        reject(new Error('启动文件不存在,服务启动失败'))
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
            reject(new Error('配置文件不存在,服务器启动失败'))
            return
          }
          console.log('file: ', file)
          const defaultFile = join(
            global.Server.ApacheDir,
            `common/conf/${Utils.md5(version.bin)}.conf`
          )
          console.log('defaultFile: ', defaultFile)
          let defaultConf = ''
          if (!existsSync(defaultFile)) {
            let content = readFileSync(file, 'utf-8')
            const reg = new RegExp('(CustomLog ")([\\s\\S]*?)(access_log")', 'g')
            let path = ''
            try {
              path = reg.exec(content)[2]
            } catch (e) {}
            path = path.trim()
            if (!path) {
              reject(new Error('配置文件日志路径有误, 切换失败'))
              return
            }
            const logs = join(global.Server.ApacheDir, 'common/logs/')
            const vhost = join(global.Server.BaseDir, 'vhost/apache/')
            content = content.replace(new RegExp(path, 'g'), logs)
            content += `\nPidFile "${logs}httpd.pid"
IncludeOptional "${vhost}*.conf"`
            writeFileSync(defaultFile, content)
            defaultConf = content
          } else {
            defaultConf = readFileSync(defaultFile, 'utf-8')
          }
          const conf = join(global.Server.ApacheDir, 'common/conf/httpd.conf')
          const confDefault = join(global.Server.ApacheDir, 'common/conf/httpd.conf.default')
          writeFileSync(conf, defaultConf)
          writeFileSync(confDefault, defaultConf)
          resolve(true)
        })
        .catch((err) => {
          reject(err)
        })
    })
  }

  switchVersion(version) {
    this._stopServer()
      .then(() => {
        return this.#resetConf(version)
      })
      .then(() => {
        return this._startServer(version)
      })
      .then(() => {
        this._processSend({
          code: 0,
          msg: 'SUCCESS',
          version
        })
      })
      .catch((code) => {
        let info = code ? code.toString() : '切换失败'
        this._processSend({
          code: 1,
          msg: info,
          version
        })
      })
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
