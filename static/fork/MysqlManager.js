const join = require('path').join
const existsSync = require('fs').existsSync
const { spawn } = require('child_process')
const BaseManager = require('./BaseManager')
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
      let bin = version.bin
      if (!existsSync(bin)) {
        reject(new Error('启动文件不存在,服务启动失败'))
        return
      }
      let m = join(global.Server.MysqlDir, 'my.cnf')
      let p = join(global.Server.MysqlDir, 'mysql.pid')
      let s = join(global.Server.MysqlDir, 'slow.log')
      let e = join(global.Server.MysqlDir, 'error.log')
      const child = spawn(bin, [
        `--defaults-file=${m}`,
        `--pid-file=${p}`,
        '--user=mysql',
        `--slow-query-log-file=${s}`,
        `--log-error=${e}`
      ])

      let success = false
      function checkpid(time = 0) {
        if (existsSync(p)) {
          console.log('time: ', time)
          success = true
          spawn('kill', ['-9', child.pid])
        } else {
          if (time < 10) {
            setTimeout(() => {
              checkpid(time + 1)
            }, 500)
          } else {
            spawn('kill', ['-9', child.pid])
          }
        }
      }

      child.stdout.on('data', (data) => {
        let str = data.toString().replace(/\r\n/g, '<br/>').replace(/\n/g, '<br/>')
        console.log('stdout: ', str)
        process.send({
          command: this.ipcCommand,
          key: this.ipcCommandKey,
          info: {
            code: 200,
            msg: str
          }
        })
        checkpid()
      })
      child.stderr.on('data', (err) => {
        let str = err.toString().replace(/\r\n/g, '<br/>').replace(/\n/g, '<br/>')
        console.log('stderr: ', str)
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
        if (code === null && success) {
          resolve(code)
        } else {
          reject(code)
        }
      })
    })
  }
}
module.exports = MysqlManager
