const { I18nT } = require('./lang/index.js')
const existsSync = require('fs').existsSync
const readFileSync = require('fs').readFileSync
const unlinkSync = require('fs').unlinkSync
const execPromise = require('child-process-promise').exec
const Utils = require('./Utils')

class BaseManager {
  constructor() {
    this._thenSuccess = this._thenSuccess.bind(this)
    this._catchError = this._catchError.bind(this)
    this.type = ''
    this.pidPath = ''
    this.ipcCommand = ''
    this.ipcCommandKey = ''
  }
  exec(commands) {
    this.ipcCommand = commands[0]
    commands.splice(0, 1)
    this.ipcCommandKey = commands[0]
    commands.splice(0, 1)

    let fn = commands[0]
    commands.splice(0, 1)
    execPromise(`echo '${global.Server.Password}' | sudo -S -k -l`)
      .then(() => {
        if (this[fn]) {
          this[fn](...commands)
        }
      })
      .catch(() => {
        process.send({
          command: 'application:need-password',
          key: 'application:need-password',
          info: false
        })
        this._processSend({
          code: 1,
          msg: I18nT('fork.needPassWord') + '<br/>'
        })
      })
  }

  _fixEnv() {
    return { env: Utils.fixEnv() }
  }

  _startServer() {}

  _linkVersion(version) {
    return new Promise((resolve) => {
      if (version && version?.bin) {
        try {
          const v = version.bin
            .split(global.Server.BrewCellar + '/')
            .pop()
            ?.split('/')?.[0]
          if (v) {
            const opt = this._fixEnv()
            opt.env.HOMEBREW_NO_INSTALL_FROM_API = 1
            const command = `brew unlink ${v} && brew link --overwrite --force ${v}`
            execPromise(command, opt)
              .then(() => {
                resolve(true)
              })
              .catch((e) => {
                resolve(e.toString())
              })
          } else {
            resolve(I18nT('fork.versionError'))
          }
        } catch (e) {
          resolve(e.toString())
        }
      } else {
        resolve(I18nT('fork.needSelectVersion'))
      }
    })
  }

  doLinkVersion(version) {
    this._linkVersion(version).then((res) => {
      this._processSend({
        code: typeof res === 'boolean' ? 0 : 1,
        msg: res
      })
    })
  }

  switchVersion(version) {
    this._stopServer()
      .then(() => {
        return this._startServer(version)
      })
      .then(() => {
        return this._linkVersion(version)
      })
      .then(() => {
        this._processSend({
          code: 0,
          msg: 'SUCCESS',
          version
        })
      })
      .catch((code) => {
        let info = code ? code.toString() : I18nT('fork.switchFail')
        this._processSend({
          code: 1,
          msg: info,
          version
        })
      })
  }

  stopService(version) {
    this._stopServer(version).then(this._thenSuccess).catch(this._catchError)
  }

  reloadService() {
    this._reloadServer().then(this._thenSuccess).catch(this._catchError)
  }

  startService(version) {
    if (!existsSync(version?.bin)) {
      this._catchError(I18nT('fork.binNoFound'))
      return
    }
    if (!version?.version) {
      this._catchError(I18nT('fork.versionNoFound'))
      return
    }
    this._stopServer(version)
      .then(() => {
        return this._startServer(version)
      })
      .then(this._thenSuccess)
      .catch(this._catchError)
  }

  _stopServer() {
    return new Promise((resolve) => {
      /**
       * 检测pid文件是否删除, 作为服务正常停止的依据
       * @param time
       */
      const checkPid = (time = 0) => {
        /**
         * mongodb 不会自动删除pid文件 直接返回成功
         */
        if (this.type === 'mongodb') {
          setTimeout(() => {
            resolve(0)
          }, 1000)
          return
        }
        if (!existsSync(this.pidPath)) {
          resolve(0)
        } else {
          if (time < 20) {
            setTimeout(() => {
              checkPid(time + 1)
            }, 500)
          } else {
            console.log('服务停止可能失败, 未检测到pid文件被删除', this.type, this.pidPath)
            unlinkSync(this.pidPath)
            resolve(0)
          }
        }
      }

      let dis = {
        php: 'php-fpm',
        nginx: 'nginx',
        apache: 'httpd',
        mysql: 'mysqld',
        mariadb: 'mariadbd',
        memcached: 'memcached',
        redis: 'redis-server',
        mongodb: 'mongod'
      }
      let serverName = dis[this.type]
      let command = `ps aux | grep '${serverName}' | awk '{print $2,$11,$12}'`
      console.log('_stopServer command: ', command)
      execPromise(command)
        .then((res) => {
          let pids = res?.stdout?.trim()?.split('\n') ?? []
          let arr = []
          for (let p of pids) {
            if (
              p.indexOf(' grep ') >= 0 ||
              p.indexOf(' /bin/sh -c') >= 0 ||
              p.indexOf('/Contents/MacOS/') >= 0
            ) {
              continue
            }
            arr.push(p.split(' ')[0])
          }
          if (arr.length === 0) {
            checkPid()
          } else {
            arr = arr.join(' ')
            let sig = ''
            switch (this.type) {
              case 'mysql':
              case 'mariadb':
              case 'mongodb':
                sig = '-TERM'
                break
              default:
                sig = '-INT'
                break
            }
            return execPromise(`echo '${global.Server.Password}' | sudo -S kill ${sig} ${arr}`)
          }
        })
        .then(() => {
          checkPid()
        })
        .catch(() => {
          checkPid()
        })
    })
  }

  _reloadServer() {
    return new Promise((resolve, reject) => {
      console.log('this.pidPath: ', this.pidPath)
      if (existsSync(this.pidPath)) {
        let pid = readFileSync(this.pidPath, 'utf-8')
        let sign =
          this.type === 'apache' || this.type === 'mysql' || this.type === 'nginx'
            ? '-HUP'
            : '-USR2'
        execPromise(`echo '${global.Server.Password}' | sudo -S kill ${sign} ${pid}`)
          .then(() => {
            setTimeout(() => {
              resolve(0)
            }, 1000)
          })
          .catch((err) => {
            reject(err)
          })
      } else {
        reject(new Error(I18nT('fork.serviceNoRun')))
      }
    })
  }

  _childHandle(child, resolve, reject) {
    let exit = false
    const onEnd = (code) => {
      if (exit) return
      exit = true
      if (code === 0) {
        resolve(code)
      } else {
        reject(code)
      }
    }
    child.stdout.on('data', (data) => {
      this._handleLog(data)
    })
    child.stderr.on('data', (err) => {
      this._handleLog(err)
    })
    child.on('exit', onEnd)
    child.on('close', onEnd)
  }

  _handleLog(info) {
    let str = info.toString()
    process.send({
      command: this.ipcCommand,
      key: this.ipcCommandKey,
      info: {
        code: 200,
        msg: str
      }
    })
  }

  _processSend(info) {
    process.send({
      command: this.ipcCommand,
      key: this.ipcCommandKey,
      info: info
    })
  }

  _thenSuccess() {
    this._processSend({
      code: 0,
      msg: 'SUCCESS'
    })
  }

  _catchError(error) {
    this._processSend({
      code: 1,
      msg: `${error}`
    })
  }
}
module.exports = BaseManager
