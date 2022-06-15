const join = require('path').join
const existsSync = require('fs').existsSync
const readFileSync = require('fs').readFileSync
const unlinkSync = require('fs').unlinkSync
const Utils = require('./Utils')
const { spawn } = require('child_process')
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
    execPromise(`echo '${global.Server.Password}' | sudo -S chmod 777 /private/etc/hosts`)
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

  _checkBrew() {
    return new Promise((resolve, reject) => {
      if (global.Server.BrewCellar && global.Server.BrewFormula && global.Server.BrewHome) {
        resolve(0)
        return
      }
      let sh = join(global.Server.Static, 'sh/brew-install.sh')
      console.log('sh: ', sh)
      let copyfile = join(global.Server.Cache, 'brew-install.sh')
      console.log('copyfile: ', copyfile)
      if (existsSync(copyfile)) {
        unlinkSync(copyfile)
      }

      Utils.readFileAsync(sh)
        .then((content) => {
          return Utils.writeFileAsync(copyfile, content)
        })
        .then(() => {
          let stdout = ''
          let stderr = ''
          const child = spawn('zsh', [copyfile, global.Server.Password])

          const handleStdin = (data) => {
            if (data.indexOf('请选择一个下载镜像') >= 0) {
              setTimeout(() => {
                child.stdin.write(Buffer.from('1\n'))
              }, 500)
            } else if (data.indexOf('请输入序号:') >= 0) {
              setTimeout(() => {
                child.stdin.write(Buffer.from('1\n'))
              }, 500)
            } else if (data.indexOf('是否现在开始执行脚本（N/Y）') >= 0) {
              setTimeout(() => {
                child.stdin.write(Buffer.from('Y\n'))
              }, 500)
            } else if (data.indexOf('如果继续运行脚本应该输入Y或者y') >= 0) {
              setTimeout(() => {
                child.stdin.write(Buffer.from('Y\n'))
              }, 500)
            } else if (data.indexOf('开机密码') >= 0) {
              setTimeout(() => {
                child.stdin.write(Buffer.from(global.Server.Password + '\n\r'))
              }, 500)
            } else if (data.indexOf('请选择今后brew install的时候访问那个国内镜像') >= 0) {
              setTimeout(() => {
                child.stdin.write(Buffer.from('1\n'))
              }, 500)
            }
          }

          child.stdout.on('data', (d) => {
            let data = d.toString()
            console.log('stdout: ', data)
            this._handleStd(d, stdout)
            handleStdin(data)
          })

          child.stderr.on('data', (d) => {
            let data = d.toString()
            console.log('stderr: ', d.toString())
            this._handleStd(d, stderr)
            handleStdin(data)
          })

          child.on('close', (code) => {
            if (code === 0) {
              resolve(code)
            } else {
              reject(new Error('Brew安装失败'))
            }
          })
        })
        .catch((err) => {
          console.log('err: ', err)
          reject(err)
        })
    })
  }

  _startServer() {}

  switchVersion(version) {
    this._stopServer()
      .then(() => {
        return this._startServer(version)
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
          .then((res) => {
            if (!res.stderr) {
              setTimeout(() => {
                resolve(0)
              }, 1000)
            } else {
              reject(res.stderr)
            }
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
    child.stdout.on('data', (data) => {
      stdout = this._handleStd(data, stdout)
      console.log('_childHandle stdout: ', stdout)
    })
    child.stderr.on('data', (err) => {
      stderr = this._handleStd(err, stderr)
      console.log('_childHandle stderr: ', stderr)
    })
    child.on('close', function (code) {
      console.log('close: ', code)
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
