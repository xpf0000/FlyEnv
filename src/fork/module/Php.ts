import { join, basename, dirname } from 'path'
import { existsSync, unlinkSync, writeFileSync, readFileSync, copyFileSync, statSync } from 'fs'
import { removeSync } from 'fs-extra'
import { Base } from './Base'
import { I18nT } from '../lang'
import type { SoftInstalled } from '@shared/app'
import {createFolder, execPromise, execSyncFix, md5} from '../Fn'
import { ForkPromise } from '../ForkPromise'
import compressing from 'compressing'

class Php extends Base {
  constructor() {
    super()
    this.type = 'php'
  }

  init() {
    this.pidPath = join(global.Server.PhpDir!, 'common/var/run/php-fpm.pid')
  }

  getIniPath(version: SoftInstalled) {
    return new ForkPromise((resolve, reject, on) => {
      let command = ''
      if (version?.phpBin) {
        command = `${version.phpBin} -i | grep php.ini`
      } else {
        command = `${version.path}/bin/php -i | grep php.ini`
      }
      const res = execSyncFix(command)
      let ini: string = res?.trim()?.split('=>')?.pop()?.trim() ?? ''
      ini = ini?.split('=>')?.pop()?.trim() ?? ''
      if (ini) {
        if (!existsSync(ini)) {
          if (!ini.endsWith('.ini')) {
            ini = join(ini, 'php.ini')
          }
          createFolder(dirname(ini))
          const iniPath = join(global.Server.PhpDir!, 'common/conf/php.ini')
          const iniDefaultPath = join(global.Server.PhpDir!, 'common/conf/php.ini.default')
          if (existsSync(iniPath)) {
            copyFileSync(iniPath, ini)
          } else if (existsSync(iniDefaultPath)) {
            copyFileSync(iniPath, ini)
          }
        }
        if (existsSync(ini)) {
          if (statSync(ini).isDirectory()) {
            const baseIni = join(ini, 'php.ini')
            ini = join(ini, 'php.ini-development')
            if (existsSync(ini) && !existsSync(baseIni)) {
              try {
                execSyncFix(`echo '${global.Server.Password}' | sudo -S cp ${ini} ${baseIni}`)
                execSyncFix(`echo '${global.Server.Password}' | sudo -S chmod 755 ${baseIni}`)
              } catch (e) {}
            }
            ini = baseIni
          }
          if (existsSync(ini)) {
            const iniDefault = `${ini}.default`
            if (!existsSync(iniDefault)) {
              execSyncFix(`echo '${global.Server.Password}' | sudo -S cp ${ini} ${iniDefault}`)
            }
            resolve(ini)
            return
          }
        }
      }
      reject(new Error(I18nT('fork.phpiniNoFound')))
    })
  }

  installExtends(args) {
    console.log('installExtends: ', args)
    const { version, versionNumber, extend, installExtensionDir } = args
    if (!existsSync(version?.bin)) {
      this._catchError(I18nT('fork.binNoFound'))
      return
    }
    if (!version?.version) {
      this._catchError(I18nT('fork.versionNoFound'))
      return
    }
    if (args?.flag === 'homebrew') {
      const checkSo = () => {
        const baseDir = args.libName.split('/').pop()
        const dir = join(global.Server.BrewCellar, baseDir)
        const so = Utils.getAllFile(dir)
          .filter((f) => f.endsWith('.so'))
          .pop()
        if (so) {
          const destSo = join(installExtensionDir, basename(so))
          copyFileSync(so, destSo)
          return existsSync(destSo)
        }
        return false
      }
      if (checkSo()) {
        this._thenSuccess()
        return
      }
      this._doInstallOrUnInstallByBrew(args.libName, 'install')
        .then(() => {
          if (checkSo()) {
            this._thenSuccess()
          } else {
            this._processSend({
              code: 1,
              msg: I18nT('fork.ExtensionInstallFail')
            })
          }
        })
        .catch(this._catchError)
      return
    }
    if (args?.flag === 'macports') {
      this._doInstallOrUnInstallByPort(args.libName, 'install')
        .then(this._thenSuccess)
        .catch(this._catchError)
      return
    }
    this._doInstallExtends(version, versionNumber, extend, installExtensionDir)
      .then(() => {
        let name = `${extend}.so`
        if (extend === 'sg11') {
          name = 'ixed.dar'
        }
        const installedSo = join(installExtensionDir, name)
        if (existsSync(installedSo)) {
          this._thenSuccess()
        } else {
          this._processSend({
            code: 1,
            msg: I18nT('fork.ExtensionInstallFail')
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

  _stopServer(version: SoftInstalled) {
    return new Promise((resolve, reject) => {
      const v = version.version.split('.').slice(0, 2).join('')
      const pidFile = join(global.Server.PhpDir!, v, 'var/run/php-fpm.pid')
      let pid = 0
      try {
        if (existsSync(pidFile)) {
          pid = readFileSync(pidFile, 'utf-8')
        }
      } catch (e) {}
      if (pid) {
        const check = (times = 0) => {
          if (!existsSync(pidFile)) {
            resolve(0)
            return
          }
          if (times > 4) {
            reject(new Error(I18nT('fork.phpStopFail', { version: version.version })))
            return
          }
          setTimeout(() => {
            check(times + 1)
          }, 500)
        }
        execPromise(`echo '${global.Server.Password}' | sudo -S kill -INT ${pid}`)
          .then(() => {
            check()
          })
          .catch((e) => {
            const err = e.toString()
            if (err.includes('No such process')) {
              if (existsSync(pidFile)) {
                unlinkSync(pidFile)
                resolve(0)
              } else {
                reject(new Error(err))
              }
            }
          })
      } else {
        resolve(0)
      }
    })
  }

  startService(version: SoftInstalled) {
    if (!existsSync(version?.bin)) {
      this._catchError(I18nT('fork.binNoFound'))
      return
    }
    if (!version?.version) {
      this._catchError(I18nT('fork.versionNoFound'))
      return
    }
    this._stopServer(version: SoftInstalled)
      .then(() => {
        return this._startServer(version: SoftInstalled)
      })
      .then(() => {
        return this._resetEnablePhpConf(version: SoftInstalled)
      })
      .then(() => {
        return this._updateVhostPhpVersion(version: SoftInstalled)
      })
      .then(this._thenSuccess)
      .catch(this._catchError)
  }

  _resetEnablePhpConf(version: SoftInstalled) {
    return new Promise((resolve) => {
      const v = version.version.split('.').slice(0, 2).join('')
      const confPath = join(global.Server.NginxDir, 'common/conf/enable-php.conf')
      const tmplPath = join(global.Server.Static, 'tmpl/enable-php.conf')
      if (existsSync(tmplPath)) {
        let content = readFileSync(tmplPath, 'utf-8')
        const replace = `fastcgi_pass  unix:/tmp/phpwebstudy-php-cgi-${v}.sock;`
        content = content.replace('fastcgi_pass  unix:/tmp/phpwebstudy-php-cgi-80.sock;', replace)
        writeFileSync(confPath, content)
      }
      resolve(true)
    })
  }

  _updateVhostPhpVersion(version: SoftInstalled) {
    return new Promise((resolve) => {
      const hostFile = join(global.Server.BaseDir, 'host.json')
      let hostList = []
      let hasError = false
      if (existsSync(hostFile)) {
        try {
          hostList = JSON.parse(readFileSync(hostFile, 'utf-8'))
        } catch (e) {
          hasError = true
          console.log(e)
        }
      }
      if (hasError) {
        resolve(true)
        return
      }
      const setPhpVersion = (host) => {
        const name = host.name
        const nginxvpath = join(global.Server.BaseDir, 'vhost/nginx')
        const apachevpath = join(global.Server.BaseDir, 'vhost/apache')

        const nvhost = join(nginxvpath, `${name}.conf`)
        const avhost = join(apachevpath, `${name}.conf`)

        const v = version.version.split('.').slice(0, 2).join('')

        if (existsSync(nvhost)) {
          let content = readFileSync(nvhost, 'utf-8')
          const find = content.match(/include enable-php(.*?)\.conf;/g)
          const replace = `include enable-php-${v}.conf;`
          content = content.replace(find?.[0], replace)
          writeFileSync(nvhost, content)
        }

        if (existsSync(avhost)) {
          let content = readFileSync(avhost, 'utf-8')
          const find = content.match(/SetHandler "proxy:(.*?)"/g)
          const replace = `SetHandler "proxy:unix:/tmp/phpwebstudy-php-cgi-${v}.sock|fcgi://localhost"`
          content = content.replace(find?.[0], replace)
          writeFileSync(avhost, content)
        }

        host.phpVersion = Number(v)
      }
      if (hostList.length > 0) {
        let needWrite = false
        hostList.forEach((h) => {
          if (!h?.phpVersion) {
            setPhpVersion(h)
            needWrite = true
          }
        })
        if (needWrite) {
          writeFileSync(hostFile, JSON.stringify(hostList))
        }
      }
      resolve(true)
    })
  }

  _startServer(version: SoftInstalled) {
    return new Promise((resolve, reject) => {
      const bin = version.bin
      const v = version.version.split('.').slice(0, 2).join('')
      const confPath = join(global.Server.PhpDir!, v, 'conf')
      const varPath = join(global.Server.PhpDir!, v, 'var')
      const logPath = join(varPath, 'log')
      const runPath = join(varPath, 'run')
      Utils.createFolder(confPath)
      Utils.createFolder(varPath)
      Utils.createFolder(logPath)
      Utils.createFolder(runPath)

      const phpFpmConf = join(confPath, 'php-fpm.conf')
      console.log('phpFpmConf: ', phpFpmConf)
      if (!existsSync(phpFpmConf)) {
        const phpFpmConfTmpl = join(global.Server.Static, 'tmpl/php-fpm.conf')
        console.log('phpFpmConfTmpl: ', phpFpmConfTmpl)
        let content = readFileSync(phpFpmConfTmpl, 'utf-8')
        content = content.replace('##PHP-CGI-VERSION##', v)
        writeFileSync(phpFpmConf, content)
      }

      const opt = this._fixEnv()
      const child = spawn(bin, ['-p', varPath, '-y', phpFpmConf], opt)
      this._childHandle(child, resolve, reject)
    })
  }

  _doInstallExtends(version, versionNumber, extend, extendsDir) {
    return new Promise((resolve, reject) => {
      const optdefault = {
        env: Utils.fixEnv()
      }
      const arch = global.Server.isAppleSilicon ? '-arm64' : '-x86_64'

      const doRun = (copyfile, extendVersion, isPort = false) => {
        let params = [
          copyfile,
          global.Server.Cache,
          version.path,
          extendVersion,
          arch,
          global.Server.Password
        ]
        if (isPort) {
          params = [
            copyfile,
            global.Server.Cache,
            extendVersion,
            global.Server.Password,
            version.phpize,
            version.phpConfig
          ]
        }
        const command = params.join(' ')
        process.send({
          command: this.ipcCommand,
          key: this.ipcCommandKey,
          info: {
            code: 200,
            msg: I18nT('fork.ExtensionInstallFailTips', { command })
          }
        })
        const child = spawn('zsh', params, optdefault)
        this._childHandle(child, resolve, reject)
      }

      const installByMacports = (type) => {
        if (version?.phpBin) {
          const baseName = basename(version.phpBin)
          let name = ''
          switch (type) {
            case 'redis':
            case 'memcache':
            case 'memcached':
            case 'swoole':
            case 'xdebug':
            case 'ssh2':
            case 'mongodb':
            case 'yaf':
              name = `${baseName}-${type}`
              break
            case 'imagick':
              name = `pkgconfig autoconf automake libtool ImageMagick ${baseName}-imagick`
              break
          }
          sh = join(global.Server.Static, 'sh/port-install.sh')
          copyfile = join(global.Server.Cache, 'port-install.sh')
          if (existsSync(copyfile)) {
            unlinkSync(copyfile)
          }
          Utils.readFileAsync(sh)
            .then((content) => {
              content = content
                .replace('##PASSWORD##', global.Server.Password)
                .replace('##NAME##', name)
              return Utils.writeFileAsync(copyfile, content)
            })
            .then(() => {
              Utils.chmod(copyfile, '0777')
              const params = [copyfile]
              const command = params.join(' ')
              process.send({
                command: this.ipcCommand,
                key: this.ipcCommandKey,
                info: {
                  code: 200,
                  msg: I18nT('fork.ExtensionInstallFailTips', { command })
                }
              })
              const child = spawn('zsh', params, optdefault)
              this._childHandle(child, resolve, reject)
            })
            .catch((err) => {
              reject(err)
            })
          return true
        }
        return false
      }

      const installByShell = (shellFile, extendv) => {
        sh = join(global.Server.Static, `sh/${shellFile}`)
        copyfile = join(global.Server.Cache, shellFile)
        if (existsSync(copyfile)) {
          unlinkSync(copyfile)
        }
        Utils.readFileAsync(sh)
          .then((content) => {
            return Utils.writeFileAsync(copyfile, content)
          })
          .then(() => {
            Utils.chmod(copyfile, '0777')
            doRun(copyfile, extendv, version?.phpBin)
          })
          .catch((err) => {
            reject(err)
          })
      }

      let sh = ''
      let copyfile = ''
      let soPath = ''
      let extendv = ''
      switch (extend) {
        case 'ionCube':
          soPath = join(extendsDir, 'ioncube.so')
          if (existsSync(soPath)) {
            resolve(true)
            return
          }
          const tmplPath = join(global.Server.Cache, `ioncube_loader_mac_${versionNumber}.so`)
          const doCopy = () => {
            if (existsSync(tmplPath)) {
              if (!existsSync(extendsDir)) {
                execSync(`echo '${global.Server.Password}' | sudo -S mkdir -p ${extendsDir}`)
              }
              execSync(`echo '${global.Server.Password}' | sudo -S cp ${tmplPath} ${soPath}`)
              if (existsSync(soPath)) {
                resolve(true)
                return true
              }
            }
            return false
          }
          if (doCopy()) {
            return
          }
          const url = `http://mbimage.ybvips.com/electron/phpwebstudy/ioncube/ioncube_loader_mac_${versionNumber}.so`
          Utils.downFile(url, tmplPath)
            .then(() => {
              if (doCopy()) {
                return
              }
              reject(new Error('File Download Fail'))
            })
            .catch((err) => {
              console.log(err)
              reject(err)
            })
          break
        case 'redis':
          soPath = join(extendsDir, 'redis.so')
          if (existsSync(soPath)) {
            resolve(true)
            return
          }
          if (installByMacports(extend)) {
            return
          }
          extendv = versionNumber < 7.0 ? '4.3.0' : '5.3.7'
          installByShell('php-redis.sh', extendv)
          break
        case 'memcache':
          soPath = join(extendsDir, 'memcache.so')
          if (existsSync(soPath)) {
            resolve(true)
            return
          }
          if (installByMacports(extend)) {
            return
          }
          extendv = versionNumber < 7.0 ? '3.0.8' : versionNumber >= 8.0 ? '8.2' : '4.0.5.2'
          installByShell('php-memcache.sh', extendv)
          break
        case 'memcached':
          soPath = join(extendsDir, 'memcached.so')
          if (existsSync(soPath)) {
            resolve(true)
            return
          }
          if (installByMacports(extend)) {
            return
          }
          extendv = versionNumber < 7.0 ? '2.2.0' : '3.2.0'
          installByShell('php-memcached.sh', extendv)
          break
        case 'swoole':
          soPath = join(extendsDir, 'swoole.so')
          if (existsSync(soPath)) {
            resolve(true)
            return
          }
          if (installByMacports(extend)) {
            return
          }
          if (versionNumber < 5.5) {
            extendv = '1.10.5'
          } else if (versionNumber < 7.0) {
            extendv = '2.2.0'
          } else if (versionNumber < 7.2) {
            extendv = '4.5.11'
          } else if (versionNumber < 8.0) {
            extendv = '4.8.11'
          } else {
            extendv = '5.0.3'
          }
          installByShell('php-swoole.sh', extendv)
          break
        case 'xdebug':
          soPath = join(extendsDir, 'xdebug.so')
          if (existsSync(soPath)) {
            resolve(true)
            return
          }
          if (installByMacports(extend)) {
            return
          }
          if (versionNumber < 7.2) {
            extendv = '2.5.5'
          } else {
            extendv = '3.1.5'
          }
          installByShell('php-xdebug.sh', extendv)
          break
        case 'xlswriter':
          soPath = join(extendsDir, 'xlswriter.so')
          if (existsSync(soPath)) {
            resolve(true)
            return
          }
          extendv = '1.5.5'
          installByShell(version?.phpBin ? 'php-xlswriter-port.sh' : 'php-xlswriter.sh', extendv)
          break
        case 'ssh2':
          soPath = join(extendsDir, 'ssh2.so')
          if (existsSync(soPath)) {
            resolve(true)
            return
          }
          if (installByMacports(extend)) {
            return
          }
          extendv = versionNumber < 7.0 ? '1.1.2' : '1.4'
          installByShell('php-ssh2.sh', extendv)
          break
        case 'pdo_sqlsrv':
          soPath = join(extendsDir, 'pdo_sqlsrv.so')
          if (existsSync(soPath)) {
            resolve(true)
            return
          }
          if (versionNumber < 7.0) {
            extendv = '3.0.1'
          } else if (versionNumber < 7.3) {
            extendv = '5.9.0'
          } else {
            extendv = '5.11.0'
          }
          installByShell(version?.phpBin ? 'php-pdo_sqlsrv-port.sh' : 'php-pdo_sqlsrv.sh', extendv)
          break
        case 'imagick':
          if (existsSync(join(extendsDir, 'imagick.so'))) {
            resolve(true)
            return
          }
          if (installByMacports(extend)) {
            return
          }
          extendv = '3.7.0'
          installByShell('php-imagick.sh', extendv)
          break
        case 'mongodb':
          soPath = join(extendsDir, 'mongodb.so')
          if (existsSync(soPath)) {
            resolve(true)
            return
          }
          if (installByMacports(extend)) {
            return
          }
          extendv = versionNumber < 7.2 ? '1.7.5' : '1.14.1'
          installByShell('php-mongodb.sh', extendv)
          break
        case 'yaf':
          soPath = join(extendsDir, 'yaf.so')
          if (existsSync(soPath)) {
            resolve(true)
            return
          }
          if (installByMacports(extend)) {
            return
          }
          extendv = versionNumber < 7.0 ? '2.3.5' : '3.3.5'
          installByShell('php-yaf.sh', extendv)
          break
        case 'sg11':
          if (existsSync(join(extendsDir, 'ixed.dar'))) {
            resolve(true)
            return
          }
          sh = join(global.Server.Static, 'sh/php-sg11.sh')
          copyfile = join(global.Server.Cache, 'php-sg11.sh')
          if (existsSync(copyfile)) {
            unlinkSync(copyfile)
          }
          Utils.readFileAsync(sh)
            .then((content) => {
              return Utils.writeFileAsync(copyfile, content)
            })
            .then(() => {
              Utils.chmod(copyfile, '0777')
              let versionNums = version.version.split('.')
              versionNums.splice(2)
              versionNums = versionNums.join('.')
              let archStr = ''
              if (versionNumber >= 7.4 && arch === '-arm64') {
                archStr = arch
              }
              const params = [
                copyfile,
                global.Server.Cache,
                extendsDir,
                versionNums,
                archStr,
                global.Server.Password
              ]
              const command = params.join(' ')
              process.send({
                command: this.ipcCommand,
                key: this.ipcCommandKey,
                info: {
                  code: 200,
                  msg: I18nT('fork.ExtensionInstallFailTips', { command })
                }
              })
              const child = spawn('zsh', params, optdefault)
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

  doObfuscator(params) {
    const cacheDir = global.Server.Cache
    const obfuscatorDir = join(cacheDir, 'php-obfuscator')
    removeSync(obfuscatorDir)
    const zipFile = join(global.Server.Static, 'zip/php-obfuscator.zip')
    compressing.zip
      .uncompress(zipFile, obfuscatorDir)
      .then(() => {
        const bin = join(obfuscatorDir, 'yakpro-po.php')
        let command = ''
        if (params.config) {
          const configFile = join(cacheDir, 'php-obfuscator.cnf')
          writeFileSync(configFile, params.config)
          command = `${params.bin} ${bin} --config-file ${configFile} ${params.src} -o ${params.desc}`
        } else {
          command = `${params.bin} ${bin} ${params.src} -o ${params.desc}`
        }
        console.log('command: ', command)
        return execPromise(command)
      })
      .then(() => {
        this._thenSuccess()
      })
      .catch((e) => {
        this._processSend({
          code: 1,
          msg: e.toString()
        })
      })
  }
}
export default new Php()
