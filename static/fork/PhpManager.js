const join = require('path').join
const existsSync = require('fs').existsSync
const unlinkSync = require('fs').unlinkSync
const copyFileSync = require('fs').copyFileSync
const Shell = require('shelljs')
const { spawn, execSync } = require('child_process')
const Utils = require('./Utils')
const BaseManager = require('./BaseManager')
class PhpManager extends BaseManager {
  constructor () {
    super()
    this.type = 'php'
  }

  init () {
    this.pidPath = join(global.Server.PhpDir, 'common/var/run/php-fpm.pid')
  }

  installExtends (args) {
    let version = args[0]
    let flag = args[1]
    let extendsDir = args[2]
    let iniPath = args[3]
    let a = this._doInstallExtends(version, flag, extendsDir)
    let b = this._updateIni(flag, true, iniPath)
    Promise.all([a, b]).then(res => {
      return this._reloadServer()
    }).then(code => {
      process.send({ command: 'application:php-extends-stat', info: { flag: flag, status: true } })
      process.send({ command: 'application:task-php-result', info: 'SUCCESS' })
      process.send({ command: 'application:task-php-end', info: 0 })
    }).catch(err => {
      console.log('err: ', err)
      process.send({ command: 'application:task-php-log', info: `${err}<br/>` })
      process.send({ command: 'application:task-php-result', info: 'FAIL' })
      process.send({ command: 'application:task-php-end', info: 1 })
    })
  }

  unInstallExtends (args) {
    let flag = args[0]
    let iniPath = args[1]
    this._updateIni(flag, false, iniPath).then(res => {
      return this._reloadServer()
    }).then(code => {
      process.send({ command: 'application:php-extends-stat', info: { flag: flag, status: false } })
      process.send({ command: 'application:task-php-result', info: 'SUCCESS' })
      process.send({ command: 'application:task-php-end', info: 0 })
    }).catch(err => {
      process.send({ command: 'application:task-php-log', info: `${err}<br/>` })
      process.send({ command: 'application:task-php-result', info: 'FAIL' })
      process.send({ command: 'application:task-php-end', info: 1 })
    })
  }

  _doInitDepends (version) {
    return new Promise((resolve, reject) => {
      const sh = join(global.Server.Static, 'sh/php.sh')
      const copyfile = join(global.Server.Cache, 'php.sh')
      copyFileSync(sh, copyfile)
      let reinstall = ''
      let v = version.replace('php-', '').split('.')
      v = parseInt(v[0] + v[1])
      console.log('v: ', v)
      if (v > 55) {
        let current = ''
        try {
          current = execSync('brew info icu4c').toString()
        } catch (e) {}
        console.log('current: ', current)
        if (current.indexOf('icu4c: stable 67') < 0 || current.indexOf('Not installed') > 0) {
          copyFileSync(join(global.Server.BrewPhp, 'icu4c@67.1.rb'), join(global.Server.BrewFormula, 'icu4c.rb'))
          reinstall = 'icu4c'
        }
      } else {
        let current = ''
        try {
          current = execSync('brew info icu4c@56.2').toString()
        } catch (e) {}
        if (current.indexOf('icu4c@56.2: stable 56.2') < 0 || current.indexOf('Not installed') > 0) {
          copyFileSync(join(global.Server.BrewPhp, 'icu4c@56.2.rb'), join(global.Server.BrewFormula, 'icu4c@56.2.rb'))
          reinstall = 'icu4c@56.2'
        }
        let openssl = ''
        try {
          openssl = execSync('brew info openssl@1.0.2u').toString()
        } catch (e) {}
        console.log('openssl: ', openssl)
        if (openssl.indexOf('Built from source on') < 0) {
          copyFileSync(join(global.Server.BrewPhp, 'openssl@1.0.2u.rb'), join(global.Server.BrewFormula, 'openssl@1.0.2u.rb'))
          reinstall = reinstall.length === 0 ? 'openssl@1.0.2u' : reinstall + ' openssl@1.0.2u'
        }
      }
      console.log('reinstall: ', reinstall)
      const child = spawn('zsh', [copyfile, reinstall], { env: Shell.env })
      this._childHandle(child, resolve, reject)
    })
  }

  _doInstall (rb) {
    return new Promise((resolve, reject) => {
      const child = spawn('brew', ['install', '--verbose', rb], { env: Shell.env })
      this._childHandle(child, resolve, resolve)
    })
  }

  _installVersion (version) {
    let rbtmpl = join(global.Server.BrewPhp, `${version}.rb`)
    let brewVersion = version.replace('-', '@')
    let ngrb = join(global.Server.BrewFormula, `${brewVersion}.rb`)
    copyFileSync(rbtmpl, ngrb)

    try {
      Shell.env['HOMEBREW_NO_AUTO_UPDATE'] = true
      Shell.env['HOMEBREW_NO_SANDBOX'] = 1
      Shell.env['PATH'] = `/usr/local/bin:${Shell.env['PATH']}`
      this._doInitDepends(version).then(_ => {
        return this._doInstall(brewVersion)
      }).then(code => {
        return this._stopServer()
      })
        .then(code => {
          return this._startServer(version)
        })
        .then(code => {
          process.send({ command: 'application:server-stat', info: { php: true } })
          process.send({ command: 'application:task-log', info: `安装成功,${version}已成功运行<br/>` })
          process.send({ command: 'application:task-result', info: 'SUCCESS' })
          process.send({ command: 'application:task-end', info: 0 })
        }).catch(code => {
          process.send({ command: 'application:task-log', info: '安装失败<br/>' })
          process.send({ command: 'application:task-result', info: 'FAIL' })
          process.send({ command: 'application:task-end', info: 1 })
        })
    } catch (e) {
      process.send({ command: 'application:task-log', info: `${e}<br/>` })
      process.send({ command: 'application:task-result', info: 'FAIL' })
      process.send({ command: 'application:task-end', info: 1 })
    }
  }

  _startServer (version) {
    return new Promise((resolve, reject) => {
      let vpath = this._versionPath(version)
      let bin = join(vpath, 'sbin/php-fpm')
      if (!existsSync(bin)) {
        reject(new Error('启动文件不存在,服务器启动失败'))
        return
      }
      let p = join(global.Server.PhpDir, 'common/var')
      let y = join(global.Server.PhpDir, 'common/conf/php-fpm.conf')
      let c = join(global.Server.PhpDir, 'common/conf/php.ini')
      console.log(`${bin} -p ${p} -y ${y} -c ${c}`)
      const child = spawn(bin, ['-p', p, '-y', y, '-c', c], { env: Shell.env })
      this._childHandle(child, resolve, reject)
    })
  }

  _doInstallExtends (version, flag, extendsDir) {
    return new Promise((resolve, reject) => {
      let sh = ''
      let copyfile = ''
      switch (flag) {
        case 'ioncube':
          if (existsSync(join(extendsDir, 'ioncube.so'))) {
            resolve(true)
            return
          }
          let subv = version.replace('php-', '').split('.')
          Utils.downFile(`https://source.xpfme.com/ioncube/ioncube_loader_dar_${subv[0]}.${subv[1]}.so`, join(extendsDir, 'ioncube.so')).then(res => {
            resolve(true)
          }).catch(err => {
            reject(err)
          })
          break
        case 'redis':
          if (existsSync(join(extendsDir, 'redis.so'))) {
            resolve(true)
            return
          }
          sh = join(global.Server.Static, 'sh/php-redis.sh')
          copyfile = join(global.Server.Cache, 'php-redis.sh')
          if (existsSync(copyfile)) {
            unlinkSync(copyfile)
          }
          Utils.readFileAsync(sh).then(content => {
            return Utils.writeFileAsync(copyfile, content)
          }).then(res => {
            Utils.chmod(copyfile, '0777')
            let redisv = version.indexOf('php-5.') >= 0 ? '4.3.0' : '5.2.0'
            let phpv = version.replace('php-', '')
            console.log('Cache: ', global.Server.Cache)
            console.log('phpv: ', phpv)
            console.log('redisv: ', redisv)
            const child = spawn('bash', [copyfile, global.Server.Cache, phpv, redisv], { env: Shell.env })
            this._childHandle(child, resolve, reject)
          }).catch(err => {
            console.log('err: ', err)
            reject(err)
          })
          break
        case 'memcache':
          if (existsSync(join(extendsDir, 'memcache.so'))) {
            resolve(true)
            return
          }
          sh = join(global.Server.Static, 'sh/php-memcache.sh')
          copyfile = join(global.Server.Cache, 'php-memcache.sh')
          if (existsSync(copyfile)) {
            unlinkSync(copyfile)
          }
          Utils.readFileAsync(sh).then(content => {
            return Utils.writeFileAsync(copyfile, content)
          }).then(res => {
            Utils.chmod(copyfile, '0777')
            let redisv = version.indexOf('php-5.') >= 0 ? '3.0.8' : '4.0.5.2'
            let phpv = version.replace('php-', '')
            const child = spawn('bash', [copyfile, global.Server.Cache, phpv, redisv], { env: Shell.env })
            this._childHandle(child, resolve, reject)
          }).catch(err => {
            console.log('err: ', err)
            reject(err)
          })
          break
        case 'memcached':
          if (existsSync(join(extendsDir, 'memcached.so'))) {
            resolve(true)
            return
          }
          sh = join(global.Server.Static, 'sh/php-memcached.sh')
          copyfile = join(global.Server.Cache, 'php-memcached.sh')
          if (existsSync(copyfile)) {
            unlinkSync(copyfile)
          }
          Utils.readFileAsync(sh).then(content => {
            return Utils.writeFileAsync(copyfile, content)
          }).then(res => {
            Utils.chmod(copyfile, '0777')
            let redisv = version.indexOf('php-5.') >= 0 ? '2.2.0' : '3.1.5'
            let phpv = version.replace('php-', '')
            const child = spawn('bash', [copyfile, global.Server.Cache, phpv, redisv], { env: Shell.env })
            this._childHandle(child, resolve, reject)
          }).catch(err => {
            console.log('err: ', err)
            reject(err)
          })
          break
        case 'swoole':
          if (existsSync(join(extendsDir, 'swoole.so'))) {
            resolve(true)
            return
          }
          sh = join(global.Server.Static, 'sh/php-swoole.sh')
          copyfile = join(global.Server.Cache, 'php-swoole.sh')
          if (existsSync(copyfile)) {
            unlinkSync(copyfile)
          }
          Utils.readFileAsync(sh).then(content => {
            return Utils.writeFileAsync(copyfile, content)
          }).then(res => {
            Utils.chmod(copyfile, '0777')
            let extendv = ''
            if (version.indexOf('php-5.3.') >= 0 || version.indexOf('php-5.4.') >= 0) {
              extendv = '1.10.5'
            } else if (version.indexOf('php-5.5.') >= 0 || version.indexOf('php-5.6.') >= 0) {
              extendv = '2.2.0'
            } else if (version.indexOf('php-7.0.') >= 0 || version.indexOf('php-7.1.') >= 0) {
              extendv = '4.5.11'
            } else {
              extendv = '4.6.3'
            }
            let phpv = version.replace('php-', '')
            console.log([copyfile, global.Server.Cache, phpv, extendv])
            const child = spawn('bash', [copyfile, global.Server.Cache, phpv, extendv], { env: Shell.env })
            this._childHandle(child, resolve, reject)
          }).catch(err => {
            console.log('err: ', err)
            reject(err)
          })
          break
      }
    })
  }

  _updateIni (flag, add, iniPath) {
    return new Promise((resolve, reject) => {
      Utils.readFileAsync(iniPath).then(ini => {
        let str = ''
        switch (flag) {
          case 'ioncube':
            str = '[ioncube]\nzend_extension=ioncube.so'
            break
          case 'redis':
            str = '[redis]\nextension=redis.so'
            break
          case 'memcache':
            str = '[memcache]\nextension=memcache.so'
            break
          case 'memcached':
            str = '[memcached]\nextension=memcached.so'
            break
          case 'swoole':
            str = '[swoole]\nextension=swoole.so'
            break
        }
        if (add) {
          if (ini.indexOf(str) < 0) {
            ini = ini.trim() + '\n' + str
          }
        } else {
          ini = ini.replace(str, '')
        }
        return Utils.writeFileAsync(iniPath, ini)
      }).then(res => {
        resolve(true)
      }).catch(err => {
        reject(err)
      })
    })
  }
}
module.exports = PhpManager
