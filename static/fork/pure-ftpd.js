const BaseManager = require('./BaseManager')
const { AppI18n } = require('./lang/index')
const { join } = require('path')
const { existsSync, writeFileSync, readFileSync } = require('fs')
const { I18nT } = require('./lang/index.js')
const Utils = require('./Utils.js')
const { exec: execPromise } = require('child-process-promise')
class Manager extends BaseManager {
  constructor() {
    super()
    this.type = 'pure-ftpd'
  }

  init() {
    this.pidPath = join(global.Server.FTPDir, 'pure-ftpd.pid')
  }

  initConf() {
    this._initConf().then(this._thenSuccess)
  }
  _initConf() {
    return new Promise((resolve) => {
      Utils.createFolder(global.Server.FTPDir)
      const confFile = join(global.Server.FTPDir, 'pure-ftpd.conf')
      if (!existsSync(confFile)) {
        let content = readFileSync(join(global.Server.Static, 'tmpl/pure-ftpd.conf'), 'utf-8')
        content = content.replace(new RegExp('##DIR##', 'g'), global.Server.FTPDir)
        writeFileSync(confFile, content)
        writeFileSync(join(global.Server.FTPDir, 'pure-ftpd.conf.default'), content)
      }
      resolve(confFile)
    })
  }

  _startServer(version) {
    return new Promise(async (resolve, reject) => {
      const confFile = await this._initConf()
      const bin = version.bin
      let command = `echo '${global.Server.Password}' | sudo -S ${bin} ${confFile}`
      await execPromise(command)
      await this._waitTime(1000)
      let res = await execPromise(
        `echo '${global.Server.Password}' | sudo -S ps aux | grep 'pure-ftpd'`
      )
      res = res.stdout.toString()
      if (res.includes(`${bin} ${confFile}`)) {
        resolve(true)
        return
      }
      reject(new Error(I18nT('fork.startFail')))
    })
  }

  _stopServer() {
    return new Promise(async (resolve) => {
      const confFile = join(global.Server.FTPDir, 'pure-ftpd.conf')
      let command = `ps aux | grep 'pure-ftpd' | awk '{print $2,$11,$12}'`
      const res = await execPromise(command)
      let pids = res?.stdout?.toString()?.trim()?.split('\n') ?? []
      let arr = []
      for (let p of pids) {
        if (p.includes(`${confFile}`)) {
          arr.push(p.split(' ')[0])
        }
      }
      if (arr.length === 0) {
        resolve(true)
      } else {
        arr = arr.join(' ')
        let sig = '-INT'
        try {
          await execPromise(`echo '${global.Server.Password}' | sudo -S kill ${sig} ${arr}`)
        } catch (e) {}
        resolve(true)
      }
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
