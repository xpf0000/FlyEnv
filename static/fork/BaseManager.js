const join = require('path').join
const existsSync = require('fs').existsSync
const readFileSync = require('fs').readFileSync
const unlinkSync = require('fs').unlinkSync
const Shell = require('shelljs')
const Utils = require('./Utils')
const { spawn, execSync } = require('child_process')
const execPromise = require('child-process-promise').exec
class BaseManager {
  // eslint-disable-next-line no-useless-constructor
  constructor () {
    this.type = ''
    this.pidPath = ''
  }
  exec (commands) {
    let fn = commands[0]
    console.log('fn: ', fn)
    commands.splice(0, 1)
    console.log('commands: ', commands)
    execPromise(`echo '${global.Server.Password}' | sudo -S chmod 777 /private/etc/hosts`).then(res => {
      this[fn](commands)
    }).catch(err => {
      process.send({ command: `application:need-password`, info: false })
      if (fn === 'switchVersion') {
        process.send({ command: 'application:task-log', info: `sudo需要电脑密码,请输入<br/>` })
        process.send({ command: 'application:task-result', info: 'FAIL' })
        process.send({ command: 'application:task-end', info: 1 })
      } else {
        process.send({ command: `application:task-${this.type}-log`, info: `sudo需要电脑密码,请输入<br/>` })
        process.send({ command: `application:task-${this.type}-result`, info: 'FAIL' })
        process.send({ command: `application:task-${this.type}-end`, info: 1 })
      }
      console.log(err)
    })
  }

  _checkBrew () {
    return new Promise((resolve, reject) => {
      if (global.Server.BrewCellar && global.Server.BrewFormula && global.Server.BrewHome) {
        resolve(0)
        return
      }
      process.send({ command: 'application:task-log', info: `检测到未安装Homebrew,开始安装,请稍候...<br/>` })
      let sh = join(global.Server.Static, 'sh/brew-install.sh')
      let copyfile = join(global.Server.Cache, 'brew-install.sh')
      if (existsSync(copyfile)) {
        unlinkSync(copyfile)
      }
      Utils.readFileAsync(sh).then(content => {
        return Utils.writeFileAsync(copyfile, content)
      }).then(res => {
        let stdout = ''
        let stderr = ''
        const child = spawn('zsh', [copyfile, global.Server.Password])
        child.stdout.on('data', (d) => {
          let data = d.toString()
          this._handleStd(d, stdout)
          if (data.indexOf('请选择一个下载镜像') >= 0) {
            child.stdin.write(Buffer.from('1\n'))
          } else if (data.indexOf('是否现在开始执行脚本（N/Y）') >= 0) {
            child.stdin.write(Buffer.from('Y\n'))
          } else if (data.indexOf('如果继续运行脚本应该输入Y或者y') >= 0) {
            child.stdin.write(Buffer.from('Y\n'))
          } else if (data.indexOf('开机密码') >= 0) {
            child.stdin.write(Buffer.from(global.Server.Password + '\n\r'))
          }
        })
        child.stderr.on('data', (d) => {
          this._handleStd(d, stderr)
        })
        child.on('close', (code) => {
          if (code === 0) {
            resolve(code)
          } else {
            reject(new Error('Brew安装失败'))
          }
        })
      }).catch(err => {
        console.log('err: ', err)
        reject(err)
      })
    })
  }

  async switchVersion (version) {
    this.isInstall = true
    version = version[0]
    let brew = await this._checkBrew()
    console.log('brew: ', brew)
    if (brew !== 0) {
      let info = brew ? brew.toString() : '切换失败'
      process.send({ command: 'application:task-log', info: `${info}<br/>` })
      process.send({ command: 'application:task-result', info: 'FAIL' })
      process.send({ command: 'application:task-end', info: 1 })
      return
    } else {
      if (!global.Server.BrewCellar) {
        let repo = execSync('brew --repo').toString().trim()
        let cellar = execSync('brew --cellar').toString().trim()
        global.Server.BrewHome = repo
        global.Server.BrewFormula = join(repo, 'Library/Taps/homebrew/homebrew-core/Formula')
        global.Server.BrewCellar = cellar
        process.send({ command: 'application:global-server-updata', info: global.Server })
      }
    }
    let hasInstalled = this._checkInstalled(version)
    if (!hasInstalled) {
      process.send({ command: 'application:task-log', info: `${version} 未安装,开始安装,请稍候...<br/>` })
      this._installVersion(version)
    } else {
      process.send({ command: 'application:task-log', info: `${version} 已安装,开始切换,请稍候...<br/>` })
      this._stopServer().then(code => {
        return this._startServer(version)
      }).then(code => {
        process.send({ command: 'application:server-stat', info: this._getStat(true) })
        process.send({ command: 'application:task-log', info: `切换成功,${version}已成功运行<br/>` })
        process.send({ command: 'application:task-result', info: 'SUCCESS' })
        process.send({ command: 'application:task-end', info: 0 })
      }).catch(code => {
        console.log('has install catch: ', code)
        let info = code ? code.toString() : '切换失败'
        process.send({ command: 'application:task-log', info: `${info}<br/>` })
        process.send({ command: 'application:task-result', info: 'FAIL' })
        process.send({ command: 'application:task-end', info: 1 })
      })
    }
  }

  stopService () {
    this._stopServer().then(code => {
      process.send({ command: 'application:server-stat', info: this._getStat(false) })
      process.send({ command: `application:task-${this.type}-result`, info: 'SUCCESS' })
      process.send({ command: `application:task-${this.type}-end`, info: 0 })
    }).catch(error => {
      process.send({ command: `application:task-${this.type}-log`, info: `${error}<br/>` })
      process.send({ command: `application:task-${this.type}-result`, info: 'FAIL' })
      process.send({ command: `application:task-${this.type}-end`, info: 1 })
    })
  }

  reloadService () {
    console.log('reloadService !!!!!!')
    this._reloadServer().then(code => {
      process.send({ command: `application:task-${this.type}-result`, info: 'SUCCESS' })
      process.send({ command: `application:task-${this.type}-end`, info: 0 })
    }).catch(error => {
      process.send({ command: `application:task-${this.type}-log`, info: `${error}<br/>` })
      process.send({ command: `application:task-${this.type}-result`, info: 'FAIL' })
      process.send({ command: `application:task-${this.type}-end`, info: 1 })
    })
  }

  startService (version) {
    version = version[0]
    this._stopServer().then(code => {
      return this._startServer(version)
    }).then(code => {
      process.send({ command: 'application:server-stat', info: this._getStat(true) })
      process.send({ command: `application:task-${this.type}-result`, info: 'SUCCESS' })
      process.send({ command: `application:task-${this.type}-end`, info: 0 })
    }).catch(err => {
      let info = err ? err.toString() : '启动失败'
      process.send({ command: `application:task-${this.type}-log`, info: `${info}<br/>` })
      process.send({ command: `application:task-${this.type}-result`, info: 'FAIL' })
      process.send({ command: `application:task-${this.type}-end`, info: 1 })
    })
  }

  _getStat (flag) {
    let stat = {}
    switch (this.type) {
      case 'apache':
        stat = { apache: flag }
        break
      case 'nginx':
        stat = { nginx: flag }
        break
      case 'php':
        stat = { php: flag }
        break
      case 'mysql':
        stat = { mysql: flag }
        break
      case 'memcached':
        stat = { memcached: flag }
        break
      case 'redis':
        stat = { redis: flag }
        break
    }
    return stat
  }

  _versionPath (version) {
    if (!global.Server.BrewCellar) {
      return ''
    }
    let brewVersion = version.replace('-', '@')
    let subVersion = brewVersion.replace(`${this.type}@`, '')
    return join(global.Server.BrewCellar, brewVersion, subVersion)
  }

  _checkInstalled (version) {
    if (!global.Server.BrewCellar) {
      return false
    }
    let vpath = this._versionPath(version)
    return existsSync(vpath)
  }

  _doInstall (rb) {
    return new Promise((resolve, reject) => {
      const child = spawn('brew', ['install', '--verbose', rb, '--build-from-source'], { env: Shell.env })
      this._childHandle(child, resolve, reject)
    })
  }

  _stopServer () {
    return new Promise((resolve, reject) => {
      if (existsSync(this.pidPath)) {
        unlinkSync(this.pidPath)
      }
      let dis = {
        'php': 'php-fpm',
        'nginx': 'nginx',
        'apache': 'httpd',
        'mysql': 'mysqld',
        'memcached': 'memcached',
        'redis': 'redis-server'
      }
      let serverName = dis[this.type]
      let command = `ps aux | grep '${serverName}' | awk '{print $2,$11,$12}'`
      console.log('_stopServer command: ', command)
      execPromise(command).then(res => {
        let pids = res.stdout.trim().split('\n')
        console.log('pids: ', pids)
        let arr = []
        for (let p of pids) {
          if (p.indexOf(' grep ') >= 0 || p.indexOf(' /bin/sh -c') >= 0 || p.indexOf('/Contents/MacOS/') >= 0) {
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
      }).then(res => {
        setTimeout(() => {
          resolve(0)
        }, 1000)
      }).catch(err => {
        console.log('_stopServer err: ', err.stderr)
        resolve(0)
      })
    })
  }

  _reloadServer () {
    return new Promise((resolve, reject) => {
      console.log('this.pidPath: ', this.pidPath)
      if (existsSync(this.pidPath)) {
        let pid = readFileSync(this.pidPath, 'utf-8')
        let sign = this.type === 'apache' || this.type === 'mysql' || this.type === 'nginx' ? '-HUP' : '-USR2'
        execPromise(`echo '${global.Server.Password}' | sudo -S kill ${sign} ${pid}`).then(res => {
          if (!res.stderr) {
            setTimeout(() => {
              resolve(0)
            }, 1000)
          }
        }).catch(err => {
          reject(err)
        })
      } else {
        console.log('服务未运行!!!')
        resolve(0)
      }
    })
  }

  _handleStd (buffer, out) {
    let str = buffer.toString().replace(/\r\n/g, '<br/>').replace(/\n/g, '<br/>')
    out += str
    if (str.endsWith('<br/>') || str.endsWith('%')) {
      this._handlChildOut && this._handlChildOut(out)
      out = out.replace(/ /g, '&ensp;')
      if (this.isInstall) {
        process.send({ command: 'application:task-log', info: out })
      } else {
        process.send({ command: `application:task-${this.type}-log`, info: out })
      }
      out = ''
    }
    return out
  }

  _childHandle (child, resolve, reject) {
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', data => {
      stdout = this._handleStd(data, stdout)
    })
    child.stderr.on('data', err => {
      stderr = this._handleStd(err, stderr)
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

  _handleLog (info) {
    let str = info.toString().replace(/\r\n/g, '<br/>').replace(/\n/g, '<br/>')
    str += '<br/>'
    str = str.replace(/ /g, '&ensp;')
    if (this.isInstall) {
      process.send({ command: 'application:task-log', info: str })
    } else {
      process.send({ command: `application:task-${this.type}-log`, info: str })
    }
  }
}
module.exports = BaseManager
