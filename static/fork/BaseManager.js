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
          msg: 'sudo需要电脑密码,请输入<br/>'
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
            const command = `brew unlink ${v} && brew link --overwrite --force ${v}`
            console.log('_linkVersion command: ', command)
            execPromise(command, opt)
              .then((res) => {
                console.log('_linkVersion res: ', res.stdout)
              })
              .catch((err) => {
                console.log('_linkVersion command err: ', err)
              })
          }
        } catch (e) {
          console.log('_linkVersion err: ', e)
        }
      }
      resolve(true)
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
        let info = code ? code.toString() : '切换失败'
        this._processSend({
          code: 1,
          msg: info,
          version
        })
      })
  }

  stopService() {
    this._stopServer().then(this._thenSuccess).catch(this._catchError)
  }

  reloadService() {
    this._reloadServer().then(this._thenSuccess).catch(this._catchError)
  }

  startService(version) {
    this._stopServer()
      .then(() => {
        return this._startServer(version)
      })
      .then(this._thenSuccess)
      .catch(this._catchError)
  }

  _stopServer() {
    return new Promise((resolve, reject) => {
      try {
        if (existsSync(this.pidPath)) {
          unlinkSync(this.pidPath)
        }
      } catch (e) {}
      let dis = {
        php: 'php-fpm',
        nginx: 'nginx',
        apache: 'httpd',
        mysql: 'mysqld',
        memcached: 'memcached',
        redis: 'redis-server'
      }
      let serverName = dis[this.type]
      let command = `ps aux | grep '${serverName}' | awk '{print $2,$11,$12}'`
      console.log('_stopServer command: ', command)
      execPromise(command)
        .then((res) => {
          let pids = res.stdout.trim().split('\n')
          console.log('pids: ', pids)
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
          console.log('pids 0: ', arr)
          if (arr.length === 0) {
            resolve(0)
          } else {
            arr = arr.join(' ')
            console.log('pids 1: ', arr)
            let sig = this.type === 'mysql' ? '-9' : '-INT'
            return execPromise(`echo '${global.Server.Password}' | sudo -S kill ${sig} ${arr}`)
          }
        })
        .then(() => {
          setTimeout(() => {
            resolve(0)
          }, 1000)
        })
        .catch((err) => {
          console.log('_stopServer err: ', err.stderr)
          reject(err)
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
        reject(new Error('服务未运行'))
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
      console.log('_childHandle stdout: ', stdout)
    })
    child.stderr.on('data', (err) => {
      stderr = this._handleStd(err, stderr)
      console.log('_childHandle stderr: ', stderr)
    })
    child.on('error', function (err) {
      console.log('error: ', err)
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
