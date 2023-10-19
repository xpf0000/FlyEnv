const { AppI18n } = require('./lang/index')
const BaseManager = require('./BaseManager.js')
const { join, basename } = require('path')
const { existsSync, writeFileSync } = require('fs')
const { I18nT } = require('./lang/index.js')
const Utils = require('./Utils.js')
const { spawn } = require('child_process')

class Manager extends BaseManager {
  constructor() {
    super()
    this.type = 'mariadb'
  }

  init() {
    this.pidPath = join(global.Server.MariaDBDir, 'mariadb.pid')
  }

  _startServer(version) {
    return new Promise((resolve, reject) => {
      console.log('version: ', version)
      let bin = version.bin
      const v = version.version.split('.').slice(0, 2).join('.')
      let m = join(global.Server.MariaDBDir, `my-${v}.cnf`)
      const dataDir = join(global.Server.MariaDBDir, `data-${v}`)
      if (!existsSync(m)) {
        let conf = `[mariadbd]
# Only allow connections from localhost
bind-address = 127.0.0.1
sql-mode=NO_ENGINE_SUBSTITUTION
port = 3307
datadir=${dataDir}`
        writeFileSync(m, conf)
      }

      let p = join(global.Server.MariaDBDir, 'mariadb.pid')
      let s = join(global.Server.MariaDBDir, 'slow.log')
      let e = join(global.Server.MariaDBDir, 'error.log')
      let k = join(global.Server.MysqlDir, 'mariadb.sock')
      const params = [
        `--defaults-file=${m}`,
        `--pid-file=${p}`,
        '--slow-query-log=ON',
        `--slow-query-log-file=${s}`,
        `--log-error=${e}`,
        `--socket=${k}`
      ]
      if (version?.flag === 'port') {
        params.push(`--lc-messages-dir=/opt/local/share/${basename(version.path)}/english`)
      }
      let needRestart = false
      if (!existsSync(dataDir)) {
        needRestart = true
        Utils.createFolder(dataDir)
        Utils.chmod(dataDir, '0777')
        bin = join(version.path, 'scripts/mariadb-install-db')
        params.splice(0)
        params.push(`--datadir=${dataDir}`)
        params.push(`--basedir=${version.path}`)
        params.push('--auth-root-authentication-method=normal')
      }
      console.log('mariadb start: ', bin, params.join(' '))
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
        this._handleLog(data)
        if (!checking) {
          checking = true
          checkpid()
        }
      })
      child.stderr.on('data', (err) => {
        this._handleLog(err)
      })
      child.on('close', (code) => {
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

let manager = new Manager()
process.on('message', function (args) {
  if (args.Server) {
    global.Server = args.Server
    AppI18n(global.Server.Lang)
    manager.init()
  } else {
    manager.exec(args)
  }
})
