const BaseManager = require('./BaseManager')
const { AppI18n } = require('./lang/index')
const { join } = require('path')
const { existsSync, writeFileSync, readFileSync } = require('fs')
const { I18nT } = require('./lang/index.js')
const { spawn } = require('child_process')
const Utils = require('./Utils.js')
class Manager extends BaseManager {
  constructor() {
    super()
    this.type = 'mongodb'
  }

  _startServer(version) {
    return new Promise((resolve, reject) => {
      const bin = version.bin
      if (!existsSync(bin)) {
        reject(new Error(I18nT('fork.binNoFound')))
        return
      }
      const v = version.version.split('.').slice(0, 2).join('.')
      let m = join(global.Server.MongoDBDir, `mongodb-${v}.conf`)
      const dataDir = join(global.Server.MongoDBDir, `data-${v}`)
      if (!existsSync(dataDir)) {
        Utils.createFolder(dataDir)
        Utils.chmod(dataDir, '0777')
      }
      if (!existsSync(m)) {
        const tmpl = join(global.Server.Static, 'tmpl/mongodb.conf')
        let conf = readFileSync(tmpl, 'utf-8')
        conf = conf.replace('##DB-PATH##', dataDir)
        writeFileSync(m, conf)
      }
      const logPath = join(global.Server.MongoDBDir, `mongodb-${v}.log`)
      const pidPath = join(global.Server.MongoDBDir, `mongodb-${v}.pid`)
      const params = ['--config', m, '--logpath', logPath, '--pidfilepath', pidPath, '--fork']
      process.send({
        command: this.ipcCommand,
        key: this.ipcCommandKey,
        info: {
          code: 200,
          msg: I18nT('fork.command') + `: ${bin} ${params.join(' ')}`
        }
      })
      let opt = this._fixEnv()
      const child = spawn(bin, params, opt)
      this._childHandle(child, resolve, reject)
    })
  }
}

let manager = new Manager()
process.on('message', function (args) {
  if (args.Server) {
    global.Server = args.Server
    AppI18n(global.Server.Lang)
  } else {
    manager.exec(args)
  }
})
