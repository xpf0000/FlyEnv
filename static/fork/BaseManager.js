const { I18nT } = require('./lang/index.js')
const existsSync = require('fs').existsSync
const readFileSync = require('fs').readFileSync
const unlinkSync = require('fs').unlinkSync
const execPromise = require('child-process-promise').exec
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
    let optdefault = { env: process.env }
    if (!optdefault.env['PATH']) {
      optdefault.env['PATH'] =
        '/opt:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin'
    } else {
      optdefault.env[
        'PATH'
      ] = `/opt:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:${optdefault.env['PATH']}`
    }
    if (global.Server.Proxy) {
      for (const k in global.Server.Proxy) {
        optdefault.env[k] = global.Server.Proxy[k]
      }
    }
    return optdefault
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
    this._stopServer(version)
      .then(() => {
        return this._startServer(version)
      })
      .then(this._thenSuccess)
      .catch(this._catchError)
  }

  _stopServer() {
    return new Promise((resolve) => {
      const cleanPid = () => {
        try {
          if (existsSync(this.pidPath)) {
            unlinkSync(this.pidPath)
          }
        } catch (e) {}
        setTimeout(() => {
          resolve(0)
        }, 300)
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
            cleanPid()
          } else {
            arr = arr.join(' ')
            let sig = ''
            switch (this.type) {
              case 'mysql':
              case 'mariadb':
                sig = '-9'
                break
              case 'mongodb':
                sig = '-2'
                break
              default:
                sig = '-INT'
                break
            }
            return execPromise(`echo '${global.Server.Password}' | sudo -S kill ${sig} ${arr}`)
          }
        })
        .then(() => {
          setTimeout(() => {
            cleanPid()
          }, 1000)
        })
        .catch(() => {
          setTimeout(() => {
            cleanPid()
          }, 1000)
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

  _handleStd(buffer, out) {
    let str = buffer.toString().replace(/\r\n/g, '<br/>').replace(/\n/g, '<br/>')
    out += str
    if (str.endsWith('<br/>') || str.endsWith('%')) {
      this._handlChildOut && this._handlChildOut(out)
      out = out.replace(/ /g, '&ensp;').trim()
      process.send({
        command: this.ipcCommand,
        key: this.ipcCommandKey,
        info: {
          code: 200,
          msg: out
        }
      })
      out = ''
    }
    return out
  }

  _childHandle(child, resolve, reject) {
    let stdout = ''
    let stderr = ''
    let exit = false
    child.stdout.on('data', (data) => {
      stdout = this._handleStd(data, stdout)
    })
    child.stderr.on('data', (err) => {
      stderr = this._handleStd(err, stderr)
    })
    child.on('exit', function (code) {
      console.log('exit: ', code)
      if (exit) return
      exit = true
      if (code === 0) {
        resolve(code)
      } else {
        reject(code)
      }
    })
    child.on('close', function (code) {
      console.log('close: ', code)
      if (exit) return
      exit = true
      if (code === 0) {
        resolve(code)
      } else {
        reject(code)
      }
    })
  }

  _handleLog(info) {
    let str = info.toString().replace(/\r\n/g, '<br/>').replace(/\n/g, '<br/>')
    str += '<br/>'
    str = str.replace(/ /g, '&ensp;')
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
