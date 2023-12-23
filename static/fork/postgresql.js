const BaseManager = require('./BaseManager')
const { AppI18n } = require('./lang/index')
const { join, dirname } = require('path')
const { existsSync, copyFileSync } = require('fs')
const { I18nT } = require('./lang/index.js')
const { exec: execPromise } = require('child-process-promise')
class Manager extends BaseManager {
  constructor() {
    super()
    this.type = 'postgresql'
  }

  init() {}

  _startServer(version) {
    return new Promise(async (resolve, reject) => {
      const bin = version.bin
      const versionTop = version.version.split('.').shift()
      const dbPath = join(global.Server.PostgreSqlDir, `postgresql${versionTop}`)
      const confFile = join(dbPath, 'postgresql.conf')
      const pidFile = join(dbPath, 'postmaster.pid')
      const logFile = join(dbPath, 'pg.log')
      let sendUserPass = false
      const checkpid = (time = 0) => {
        if (existsSync(pidFile)) {
          if (sendUserPass) {
            this._processSend({
              code: 200,
              msg: I18nT('fork.postgresqlInit', { dir: dbPath })
            })
          }
          resolve(true)
        } else {
          if (time < 40) {
            setTimeout(() => {
              checkpid(time + 1)
            }, 500)
          } else {
            reject(new Error('Start Failed'))
          }
        }
      }
      const doRun = async () => {
        const command = `${bin} -D ${dbPath} -l ${logFile} start`
        await execPromise(command)
        await this._waitTime(1000)
        checkpid()
      }
      if (existsSync(confFile)) {
        await doRun()
      } else if (!existsSync(dbPath)) {
        const binDir = dirname(bin)
        const initDB = join(binDir, 'initdb')
        let command = `${initDB} -D ${dbPath} -U root`
        await execPromise(command)
        await this._waitTime(1000)
        if (!existsSync(confFile)) {
          reject(new Error(`Data Dir ${dbPath} create faild`))
          return
        }
        const defaultConfFile = join(dbPath, 'postgresql.conf.default')
        copyFileSync(confFile, defaultConfFile)
        sendUserPass = true
        await doRun()
      } else {
        reject(new Error(`Data Dir ${dbPath} has exists, but conf file not found in dir`))
      }
    })
  }

  _stopServer() {
    return new Promise(async (resolve) => {
      let command = `ps aux | grep 'postgresql' | awk '{print $2,$11,$12,$13}'`
      const res = await execPromise(command)
      let pids = res?.stdout?.toString()?.trim()?.split('\n') ?? []
      let arr = []
      for (let p of pids) {
        if (p.includes(global.Server.PostgreSqlDir)) {
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
