const join = require('path').join
const { existsSync, unlinkSync } = require('fs')
const { spawn } = require('child_process')
const Utils = require('./Utils')
const BaseManager = require('./BaseManager')
class PhpManager extends BaseManager {
  constructor() {
    super()
    this.type = 'php'
  }

  init() {
    this.pidPath = join(global.Server.PhpDir, 'common/var/run/php-fpm.pid')
  }

  installExtends(args) {
    const { version, versionNumber, extend, installExtensionDir } = args
    this._doInstallExtends(version, versionNumber, extend, installExtensionDir)
      .then(() => {
        const installedSo = join(installExtensionDir, `${extend}.so`)
        if (existsSync(installedSo)) {
          this._thenSuccess()
        } else {
          this._processSend({
            code: 1,
            msg: '扩展安装失败'
          })
        }
      })
      .catch((error) => {
        this._catchError(error)
      })
  }

  unInstallExtends() {
    this._thenSuccess()
  }

  _startServer(version) {
    return new Promise((resolve, reject) => {
      let bin = version.bin
      if (!existsSync(bin)) {
        reject(new Error('启动文件不存在,服务启动失败'))
        return
      }
      let p = join(global.Server.PhpDir, 'common/var')
      let y = join(global.Server.PhpDir, 'common/conf/php-fpm.conf')
      let c = join(global.Server.PhpDir, 'common/conf/php.ini')
      console.log(`${bin} -p ${p} -y ${y} -c ${c}`)
      const child = spawn(bin, ['-p', p, '-y', y, '-c', c])
      this._childHandle(child, resolve, reject)
    })
  }

  _doInstallExtends(version, versionNumber, extend, extendsDir) {
    return new Promise((resolve, reject) => {
      let sh = ''
      let copyfile = ''
      switch (extend) {
        case 'ionCube':
          if (existsSync(join(extendsDir, 'ioncube.so'))) {
            resolve(true)
            return
          }
          const url = `http://mbimage.ybvips.com/electron/phpwebstudy/ioncube/ioncube_loader_mac_${versionNumber}.so`
          console.log('url: ', url)
          Utils.downFile(url, join(extendsDir, 'ioncube.so'))
            .then(() => {
              resolve(true)
            })
            .catch((err) => {
              console.log(err)
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
          Utils.readFileAsync(sh)
            .then((content) => {
              return Utils.writeFileAsync(copyfile, content)
            })
            .then(() => {
              Utils.chmod(copyfile, '0777')
              let redisv = versionNumber < 7.0 ? '4.3.0' : '5.3.7'
              const child = spawn('bash', [copyfile, global.Server.Cache, version.path, redisv])
              this._childHandle(child, resolve, reject)
            })
            .catch((err) => {
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
          Utils.readFileAsync(sh)
            .then((content) => {
              return Utils.writeFileAsync(copyfile, content)
            })
            .then(() => {
              Utils.chmod(copyfile, '0777')
              let redisv = versionNumber < 7.0 ? '3.0.8' : versionNumber >= 8.0 ? '8.0' : '4.0.5.2'
              const child = spawn('bash', [copyfile, global.Server.Cache, version.path, redisv])
              this._childHandle(child, resolve, reject)
            })
            .catch((err) => {
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
          Utils.readFileAsync(sh)
            .then((content) => {
              return Utils.writeFileAsync(copyfile, content)
            })
            .then(() => {
              Utils.chmod(copyfile, '0777')
              let redisv = versionNumber < 7.0 ? '2.2.0' : '3.2.0'
              const child = spawn('bash', [copyfile, global.Server.Cache, version.path, redisv])
              this._childHandle(child, resolve, reject)
            })
            .catch((err) => {
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
          Utils.readFileAsync(sh)
            .then((content) => {
              return Utils.writeFileAsync(copyfile, content)
            })
            .then(() => {
              Utils.chmod(copyfile, '0777')
              let extendv = ''
              if (versionNumber < 5.5) {
                extendv = '1.10.5'
              } else if (versionNumber < 7.0) {
                extendv = '2.2.0'
              } else if (versionNumber < 7.2) {
                extendv = '4.5.11'
              } else {
                extendv = '4.8.9'
              }
              const child = spawn('bash', [copyfile, global.Server.Cache, version.path, extendv])
              this._childHandle(child, resolve, reject)
            })
            .catch((err) => {
              console.log('err: ', err)
              reject(err)
            })
          break
      }
    })
  }
}
module.exports = PhpManager
