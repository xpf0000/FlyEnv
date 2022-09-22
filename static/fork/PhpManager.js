const join = require('path').join
const { existsSync, unlinkSync, writeFileSync, readFileSync } = require('fs')
const { spawn, execSync } = require('child_process')
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

  #cleanDefaultIni(dir) {
    let ini = execSync(`${dir}/bin/php -i | grep php.ini`).toString().trim()
    ini = ini.split('=>').pop().trim()
    if (ini && existsSync(ini)) {
      let iniContent = readFileSync(ini, 'utf-8')
      iniContent = iniContent.replace('zend_extension="xdebug.so"\n', '')
      writeFileSync(ini, iniContent)
    }
  }

  installExtends(args) {
    const { version, versionNumber, extend, installExtensionDir } = args
    this._doInstallExtends(version, versionNumber, extend, installExtensionDir)
      .then(() => {
        const installedSo = join(installExtensionDir, `${extend}.so`)
        if (existsSync(installedSo)) {
          if (extend === 'xdebug') {
            this.#cleanDefaultIni(version.path)
          }
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
      let opt = this._fixEnv()
      const child = spawn(bin, ['-p', p, '-y', y, '-c', c], opt)
      this._childHandle(child, resolve, reject)
    })
  }

  _doInstallExtends(version, versionNumber, extend, extendsDir) {
    return new Promise((resolve, reject) => {
      let optdefault = { env: process.env }
      if (!optdefault.env['PATH']) {
        optdefault.env[
          'PATH'
        ] = `${version.path}bin/:/opt:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin`
      } else {
        optdefault.env[
          'PATH'
        ] = `${version.path}bin/:/opt:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:${optdefault.env['PATH']}`
      }
      const arch = global.Server.isAppleSilicon ? '-arm64' : '-x86_64'
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
              const child = spawn(
                'bash',
                [copyfile, global.Server.Cache, version.path, redisv, arch],
                optdefault
              )
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
              const child = spawn(
                'bash',
                [copyfile, global.Server.Cache, version.path, redisv, arch],
                optdefault
              )
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
              const child = spawn(
                'bash',
                [copyfile, global.Server.Cache, version.path, redisv, arch],
                optdefault
              )
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
              } else if (versionNumber < 8.0) {
                extendv = '4.8.11'
              } else {
                extendv = '5.0.0'
              }
              const child = spawn(
                'bash',
                [copyfile, global.Server.Cache, version.path, extendv, arch],
                optdefault
              )
              this._childHandle(child, resolve, reject)
            })
            .catch((err) => {
              console.log('err: ', err)
              reject(err)
            })
          break
        case 'xdebug':
          if (existsSync(join(extendsDir, 'xdebug.so'))) {
            resolve(true)
            return
          }
          sh = join(global.Server.Static, 'sh/php-xdebug.sh')
          copyfile = join(global.Server.Cache, 'php-xdebug.sh')
          if (existsSync(copyfile)) {
            unlinkSync(copyfile)
          }
          Utils.readFileAsync(sh)
            .then((content) => {
              return Utils.writeFileAsync(copyfile, content)
            })
            .then(() => {
              this.#cleanDefaultIni(version.path)
              Utils.chmod(copyfile, '0777')
              let extendv = ''
              if (versionNumber < 7.2) {
                extendv = '2.5.5'
              } else {
                extendv = '3.1.5'
              }
              const param = [
                copyfile,
                global.Server.Password,
                global.Server.Cache,
                version.path,
                extendv,
                arch
              ]
              console.log('param: ', param.join(' '))

              const child = spawn('bash', param, optdefault)
              this._childHandle(child, resolve, reject)
            })
            .catch((err) => {
              console.log('err: ', err)
              reject(err)
            })
          break
        case 'ssh2':
          if (existsSync(join(extendsDir, 'ssh2.so'))) {
            resolve(true)
            return
          }
          sh = join(global.Server.Static, 'sh/php-ssh2.sh')
          copyfile = join(global.Server.Cache, 'php-ssh2.sh')
          if (existsSync(copyfile)) {
            unlinkSync(copyfile)
          }
          Utils.readFileAsync(sh)
            .then((content) => {
              return Utils.writeFileAsync(copyfile, content)
            })
            .then(() => {
              Utils.chmod(copyfile, '0777')
              let ev = versionNumber < 7.0 ? '1.1.2' : '1.3.1'
              const child = spawn(
                'bash',
                [copyfile, global.Server.Cache, version.path, ev, arch],
                optdefault
              )
              this._childHandle(child, resolve, reject)
            })
            .catch((err) => {
              console.log('err: ', err)
              reject(err)
            })
          break
        case 'pdo_sqlsrv':
          if (existsSync(join(extendsDir, 'pdo_sqlsrv.so'))) {
            resolve(true)
            return
          }
          sh = join(global.Server.Static, 'sh/php-pdo_sqlsrv.sh')
          copyfile = join(global.Server.Cache, 'php-pdo_sqlsrv.sh')
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
              if (versionNumber < 7.0) {
                extendv = '3.0.1'
              } else if (versionNumber < 7.3) {
                extendv = '4.3.0'
              } else {
                extendv = '5.10.1'
              }
              const child = spawn(
                'bash',
                [copyfile, global.Server.Cache, version.path, extendv, arch],
                optdefault
              )
              this._childHandle(child, resolve, reject)
            })
            .catch((err) => {
              console.log('err: ', err)
              reject(err)
            })
          break
        case 'imagick':
          if (existsSync(join(extendsDir, 'imagick.so'))) {
            resolve(true)
            return
          }
          sh = join(global.Server.Static, 'sh/php-imagick.sh')
          copyfile = join(global.Server.Cache, 'php-imagick.sh')
          if (existsSync(copyfile)) {
            unlinkSync(copyfile)
          }
          Utils.readFileAsync(sh)
            .then((content) => {
              return Utils.writeFileAsync(copyfile, content)
            })
            .then(() => {
              Utils.chmod(copyfile, '0777')
              let extendv = '3.7.0'
              const child = spawn(
                'bash',
                [copyfile, global.Server.Cache, version.path, extendv, arch],
                optdefault
              )
              this._childHandle(child, resolve, reject)
            })
            .catch((err) => {
              console.log('err: ', err)
              reject(err)
            })
          break
        case 'mongodb':
          if (existsSync(join(extendsDir, 'mongodb.so'))) {
            resolve(true)
            return
          }
          sh = join(global.Server.Static, 'sh/php-mongodb.sh')
          copyfile = join(global.Server.Cache, 'php-mongodb.sh')
          if (existsSync(copyfile)) {
            unlinkSync(copyfile)
          }
          Utils.readFileAsync(sh)
            .then((content) => {
              return Utils.writeFileAsync(copyfile, content)
            })
            .then(() => {
              Utils.chmod(copyfile, '0777')
              let redisv = versionNumber < 7.2 ? '1.7.5' : '1.14.1'
              const child = spawn(
                'bash',
                [copyfile, global.Server.Cache, version.path, redisv, arch],
                optdefault
              )
              this._childHandle(child, resolve, reject)
            })
            .catch((err) => {
              console.log('err: ', err)
              reject(err)
            })
          break
        case 'yaf':
          if (existsSync(join(extendsDir, 'yaf.so'))) {
            resolve(true)
            return
          }
          sh = join(global.Server.Static, 'sh/php-yaf.sh')
          copyfile = join(global.Server.Cache, 'php-yaf.sh')
          if (existsSync(copyfile)) {
            unlinkSync(copyfile)
          }
          Utils.readFileAsync(sh)
            .then((content) => {
              return Utils.writeFileAsync(copyfile, content)
            })
            .then(() => {
              Utils.chmod(copyfile, '0777')
              let redisv = versionNumber < 7.0 ? '2.3.5' : '3.3.5'
              const ars = [copyfile, global.Server.Cache, version.path, redisv, arch]
              console.log('yaf: ', ars.join(' '))
              const child = spawn('bash', ars, optdefault)
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
