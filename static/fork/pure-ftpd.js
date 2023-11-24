const BaseManager = require('./BaseManager')
const { AppI18n } = require('./lang/index')
const { join } = require('path')
const { existsSync, writeFileSync, readFileSync, statSync } = require('fs')
const { I18nT } = require('./lang/index.js')
const Utils = require('./Utils.js')
const { exec: execPromise } = require('child-process-promise')
const { execSync, spawn } = require('child_process')
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

  getPort() {
    let port = 21
    const conf = join(global.Server.FTPDir, 'pure-ftpd.conf')
    if (existsSync(conf)) {
      const content = readFileSync(conf, 'utf-8')
      const reg = new RegExp('Bind(.*?),(.*?)\n', 'g')
      let result
      if ((result = reg.exec(content)) != null) {
        port = result[2].trim()
      }
    }
    this._processSend({
      code: 0,
      data: port
    })
  }

  getAllFtp() {
    const json = join(global.Server.FTPDir, 'pureftpd.json')
    const all = []
    if (existsSync(json)) {
      try {
        const arr = JSON.parse(readFileSync(json, 'utf-8').toString())
        all.push(...arr)
      } catch (e) {}
    }
    this._processSend({
      code: 0,
      data: all
    })
  }

  _delFtp(item, version) {
    const cwd = join(version.path, 'bin')
    const user = item.user
    const pdb = join(global.Server.FTPDir, 'pureftpd.pdb')
    const passwd = join(global.Server.FTPDir, 'pureftpd.passwd')
    const cammand = `./pure-pw userdel ${user} -f ${passwd} -F ${pdb} -m`
    try {
      execSync(cammand, {
        cwd,
        env: this._fixEnv()
      })
    } catch (e) {}
  }

  delFtp(item, version) {
    console.log('delFtp: ', item, version)
    const bin = join(version.path, 'bin/pure-pw')
    if (!existsSync(bin)) {
      this._catchError(I18nT('fork.binNoFound'))
      return
    }
    this._delFtp(item, version)
    const json = join(global.Server.FTPDir, 'pureftpd.json')
    const all = []
    if (existsSync(json)) {
      try {
        const arr = JSON.parse(readFileSync(json, 'utf-8').toString())
        all.push(...arr)
      } catch (e) {}
    }
    const findOld = all.findIndex((a) => a.user === item.user)
    if (findOld >= 0) {
      all.splice(findOld, 1)
    }
    writeFileSync(json, JSON.stringify(all))
    this._thenSuccess()
  }

  addFtp(item, version) {
    console.log('addFtp: ', item, version)
    const bin = join(version.path, 'bin/pure-pw')
    if (!existsSync(bin)) {
      this._catchError(I18nT('fork.binNoFound'))
      return
    }
    this._delFtp(item, version)

    const dir = item.dir
    const dirStat = statSync(dir)

    const cwd = join(version.path, 'bin')
    const user = item.user
    const pass = item.pass
    const pdb = join(global.Server.FTPDir, 'pureftpd.pdb')
    const passwd = join(global.Server.FTPDir, 'pureftpd.passwd')

    const sub = spawn(
      './pure-pw',
      [
        'useradd',
        user,
        '-u',
        dirStat.uid,
        '-g',
        dirStat.gid,
        '-d',
        dir,
        '-F',
        pdb,
        '-f',
        passwd,
        '-m'
      ],
      {
        cwd,
        env: this._fixEnv()
      }
    )

    const stderr = []
    sub.stdout.on('data', (data) => {
      const txt = data.toString().trim()
      if (txt === 'Password:' || txt === 'Enter it again:') {
        sub.stdin.write(`${pass}\n`)
      }
    })
    sub.stderr.on('data', (data) => {
      stderr.push(data)
    })
    sub.on('close', (code) => {
      const err = Buffer.concat(stderr)
      if (!code) {
        const json = join(global.Server.FTPDir, 'pureftpd.json')
        const all = []
        if (existsSync(json)) {
          try {
            const arr = JSON.parse(readFileSync(json, 'utf-8').toString())
            all.push(...arr)
          } catch (e) {}
        }
        const findOld = all.findIndex((a) => a.user === item.user)
        if (findOld >= 0) {
          all.splice(findOld, 1, item)
        } else {
          all.unshift(item)
        }
        writeFileSync(json, JSON.stringify(all))
        this._thenSuccess()
      } else {
        this._catchError(err.toString().trim())
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
