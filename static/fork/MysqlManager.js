const join = require('path').join
const { existsSync, writeFileSync } = require('fs')
const { spawn } = require('child_process')
const BaseManager = require('./BaseManager')
const Utils = require('./Utils')
const { I18nT } = require('./lang/index.js')

class MysqlManager extends BaseManager {
  constructor() {
    super()
    this.type = 'mysql'
  }

  init() {
    this.pidPath = join(global.Server.MysqlDir, 'mysql.pid')
  }

  _startServer(version) {
    return new Promise((resolve, reject) => {
      console.log('version: ', version)
      let bin = version.bin
      if (!existsSync(bin)) {
        reject(new Error(I18nT('fork.binNoFound')))
        return
      }
      const v = version.version.split('.').slice(0, 2).join('.')
      let m = join(global.Server.MysqlDir, `my-${v}.cnf`)
      const oldm = join(global.Server.MysqlDir, 'my.cnf')
      const dataDir = join(global.Server.MysqlDir, `data-${v}`)
      if (!existsSync(m)) {
        let conf = `[mysqld]
# Only allow connections from localhost
bind-address = 127.0.0.1
sql-mode=NO_ENGINE_SUBSTITUTION

#设置数据目录
#brew安装的mysql, 数据目录是一样的, 会导致5.x版本和8.x版本无法互相切换, 所以为每个版本单独设置自己的数据目录
#如果配置文件已更改, 原配置文件在: ${oldm}
#可以复制原配置文件的内容, 使用原来的配置
datadir=${dataDir}`
        writeFileSync(m, conf)
      }

      let p = join(global.Server.MysqlDir, 'mysql.pid')
      let s = join(global.Server.MysqlDir, 'slow.log')
      let e = join(global.Server.MysqlDir, 'error.log')
      const params = [
        `--defaults-file=${m}`,
        `--pid-file=${p}`,
        '--user=mysql',
        `--slow-query-log-file=${s}`,
        `--log-error=${e}`
      ]
      let needRestart = false
      if (!existsSync(dataDir)) {
        needRestart = true
        Utils.createFolder(dataDir)
        Utils.chmod(dataDir, '0777')
        if (version.version.indexOf('5.6.') === 0) {
          bin = join(version.path, 'scripts/mysql_install_db')
          params.splice(0)
          params.push(`--datadir=${dataDir}`)
          params.push(`--basedir=${version.path}`)
        } else {
          params.push('--initialize-insecure')
        }
      }
      console.log('mysql start: ', bin, params.join(' '))
      process.send({
        command: this.ipcCommand,
        key: this.ipcCommandKey,
        info: {
          code: 200,
          msg: I18nT('fork.command') + `: ${bin} ${params.join(' ')}`
        }
      })
      const child = spawn(bin, params)

      let success = false
      function checkpid(time = 0) {
        if (existsSync(p)) {
          console.log('time: ', time)
          success = true
          spawn('kill', ['-9', child.pid])
        } else {
          if (time < 40) {
            setTimeout(() => {
              checkpid(time + 1)
            }, 500)
          } else {
            spawn('kill', ['-9', child.pid])
          }
        }
      }
      let checking = false
      child.stdout.on('data', (data) => {
        let str = data.toString().replace(/\r\n/g, '<br/>').replace(/\n/g, '<br/>')
        process.send({
          command: this.ipcCommand,
          key: this.ipcCommandKey,
          info: {
            code: 200,
            msg: str
          }
        })
        if (!checking) {
          checking = true
          checkpid()
        }
      })
      child.stderr.on('data', (err) => {
        let str = err.toString().replace(/\r\n/g, '<br/>').replace(/\n/g, '<br/>')
        process.send({
          command: this.ipcCommand,
          key: this.ipcCommandKey,
          info: {
            code: 200,
            msg: str
          }
        })
      })
      child.on('close', (code) => {
        console.log('close: ', code)
        if (!code && success) {
          resolve(code)
        } else {
          if (needRestart) {
            this._startServer(version)
              .then((code) => {
                resolve(code)
              })
              .catch((err) => {
                reject(err)
              })
          } else {
            reject(code)
          }
        }
      })
    })
  }
}
module.exports = MysqlManager
