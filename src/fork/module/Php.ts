import { join, basename, dirname } from 'path'
import { existsSync, statSync } from 'fs'
import { Base } from './Base'
import { I18nT } from '../lang'
import type { AppHost, SoftInstalled } from '@shared/app'
import { execPromise, getAllFileAsync, spawnPromise, downFile } from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import compressing from 'compressing'
import { unlink, writeFile, readFile, copyFile, mkdirp, chmod, remove } from 'fs-extra'

class Php extends Base {
  constructor() {
    super()
    this.type = 'php'
  }

  init() {
    this.pidPath = join(global.Server.PhpDir!, 'common/var/run/php-fpm.pid')
  }

  getIniPath(version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject) => {
      try {
        let command = ''
        if (version?.phpBin) {
          command = `${version.phpBin} -i | grep php.ini`
        } else {
          command = `${version.path}/bin/php -i | grep php.ini`
        }
        const res = await execPromise(command)
        let ini: string = res?.stdout?.trim()?.split('=>')?.pop()?.trim() ?? ''
        ini = ini?.split('=>')?.pop()?.trim() ?? ''
        if (ini) {
          if (!existsSync(ini)) {
            if (!ini.endsWith('.ini')) {
              ini = join(ini, 'php.ini')
            }
            await mkdirp(dirname(ini))
            const iniPath = join(global.Server.PhpDir!, 'common/conf/php.ini')
            const iniDefaultPath = join(global.Server.PhpDir!, 'common/conf/php.ini.default')
            if (existsSync(iniPath)) {
              await copyFile(iniPath, ini)
            } else if (existsSync(iniDefaultPath)) {
              await copyFile(iniPath, ini)
            }
          }
          if (existsSync(ini)) {
            if (statSync(ini).isDirectory()) {
              const baseIni = join(ini, 'php.ini')
              ini = join(ini, 'php.ini-development')
              if (existsSync(ini) && !existsSync(baseIni)) {
                try {
                  await execPromise(
                    `echo '${global.Server.Password}' | sudo -S cp ${ini} ${baseIni}`
                  )
                  await execPromise(
                    `echo '${global.Server.Password}' | sudo -S chmod 755 ${baseIni}`
                  )
                } catch (e) {}
              }
              ini = baseIni
            }
            if (existsSync(ini)) {
              const iniDefault = `${ini}.default`
              if (!existsSync(iniDefault)) {
                await execPromise(
                  `echo '${global.Server.Password}' | sudo -S cp ${ini} ${iniDefault}`
                )
              }
              resolve(ini)
              return
            }
          }
        }
        reject(new Error(I18nT('fork.phpiniNoFound')))
      } catch (e) {
        reject(e)
      }
    })
  }

  installExtends(args: any) {
    return new ForkPromise(async (resolve, reject, on) => {
      const { version, versionNumber, extend, installExtensionDir } = args
      if (!existsSync(version?.bin)) {
        reject(new Error(I18nT('fork.binNoFound')))
        return
      }
      if (!version?.version) {
        reject(new Error(I18nT('fork.versionNoFound')))
        return
      }
      if (args?.flag === 'homebrew') {
        const checkSo = async () => {
          const baseDir = args.libName.split('/').pop()
          const dir = join(global.Server.BrewCellar!, baseDir)
          const allFile = await getAllFileAsync(dir)
          const so = allFile.filter((f) => f.endsWith('.so')).pop()
          if (so) {
            const destSo = join(installExtensionDir, basename(so))
            await copyFile(so, destSo)
            return existsSync(destSo)
          }
          return false
        }
        let check = await checkSo()
        if (check) {
          resolve(0)
          return
        }
        try {
          await this._doInstallOrUnInstallByBrew(args.libName, 'install').on(on)
        } catch (e) {}

        check = await checkSo()
        if (check) {
          resolve(0)
        } else {
          reject(new Error(I18nT('fork.ExtensionInstallFail')))
        }
        return
      }
      if (args?.flag === 'macports') {
        try {
          await this._doInstallOrUnInstallByPort(args.libName, 'install').on(on)
          resolve(0)
        } catch (e) {
          reject(e)
        }
        return
      }
      try {
        await this._doInstallExtends(version, versionNumber, extend, installExtensionDir).on(on)
        let name = `${extend}.so`
        if (extend === 'sg11') {
          name = 'ixed.dar'
        }
        const installedSo = join(installExtensionDir, name)
        if (existsSync(installedSo)) {
          resolve(0)
        } else {
          reject(new Error(I18nT('fork.ExtensionInstallFail')))
        }
      } catch (e) {
        reject(e)
      }
    })
  }

  unInstallExtends() {
    return new ForkPromise((resolve) => {
      resolve(0)
    })
  }

  _stopServer(version: SoftInstalled) {
    return new ForkPromise(async (resolve) => {
      const v = version?.version?.split('.')?.slice(0, 2)?.join('') ?? ''
      const confPath = join(global.Server.PhpDir!, v, 'conf')
      const varPath = join(global.Server.PhpDir!, v, 'var')
      const command = `ps aux | grep 'php' | awk '{print $2,$11,$12,$13,$14,$15}'`
      const res = await execPromise(command)
      const pids = res?.stdout?.toString()?.trim()?.split('\n') ?? []
      const arr: Array<string> = []
      for (const p of pids) {
        if (p.includes(confPath) && p.includes(varPath)) {
          arr.push(p.split(' ')[0])
        }
      }
      if (arr.length === 0) {
        resolve(true)
      } else {
        const pids = arr.join(' ')
        const sig = '-INT'
        try {
          await execPromise(`echo '${global.Server.Password}' | sudo -S kill ${sig} ${pids}`)
        } catch (e) {}
        resolve(true)
      }
    })
  }

  startService(version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject, on) => {
      if (!existsSync(version?.bin)) {
        reject(new Error(I18nT('fork.binNoFound')))
        return
      }
      if (!version?.version) {
        reject(new Error(I18nT('fork.versionNoFound')))
        return
      }
      try {
        await this._stopServer(version)
        await this._startServer(version).on(on)
        await this._resetEnablePhpConf(version)
        await this._updateVhostPhpVersion(version)
        resolve(true)
      } catch (e) {
        reject(e)
      }
    })
  }

  _resetEnablePhpConf(version: SoftInstalled) {
    return new ForkPromise(async (resolve) => {
      const v = version?.version?.split('.')?.slice(0, 2)?.join('') ?? ''
      const confPath = join(global.Server.NginxDir!, 'common/conf/enable-php.conf')
      const tmplPath = join(global.Server.Static!, 'tmpl/enable-php.conf')
      if (existsSync(tmplPath)) {
        let content = await readFile(tmplPath, 'utf-8')
        const replace = `fastcgi_pass  unix:/tmp/phpwebstudy-php-cgi-${v}.sock;`
        content = content.replace('fastcgi_pass  unix:/tmp/phpwebstudy-php-cgi-80.sock;', replace)
        await writeFile(confPath, content)
      }
      resolve(true)
    })
  }

  _updateVhostPhpVersion(version: SoftInstalled) {
    return new ForkPromise(async (resolve) => {
      const hostFile = join(global.Server.BaseDir!, 'host.json')
      let hostList: Array<AppHost> = []
      let hasError = false
      if (existsSync(hostFile)) {
        try {
          const txt = await readFile(hostFile, 'utf-8')
          hostList = JSON.parse(txt)
        } catch (e) {
          hasError = true
          console.log(e)
        }
      }
      if (hasError) {
        resolve(true)
        return
      }
      const setPhpVersion = async (host: AppHost) => {
        const name = host.name
        const nginxvpath = join(global.Server.BaseDir!, 'vhost/nginx')
        const apachevpath = join(global.Server.BaseDir!, 'vhost/apache')

        const nvhost = join(nginxvpath, `${name}.conf`)
        const avhost = join(apachevpath, `${name}.conf`)

        const v = version?.version?.split('.')?.slice(0, 2)?.join('') ?? ''

        if (existsSync(nvhost)) {
          let content = await readFile(nvhost, 'utf-8')
          const find = content.match(/include enable-php(.*?)\.conf;/g)
          const replace = `include enable-php-${v}.conf;`
          content = content.replace(find?.[0] ?? '###@@@&&&', replace)
          await writeFile(nvhost, content)
        }

        if (existsSync(avhost)) {
          let content = await readFile(avhost, 'utf-8')
          const find = content.match(/SetHandler "proxy:(.*?)"/g)
          const replace = `SetHandler "proxy:unix:/tmp/phpwebstudy-php-cgi-${v}.sock|fcgi://localhost"`
          content = content.replace(find?.[0] ?? '###@@@&&&', replace)
          await writeFile(avhost, content)
        }

        host.phpVersion = Number(v)
      }
      if (hostList.length > 0) {
        let needWrite = false
        for (const h of hostList) {
          if (!h?.phpVersion) {
            await setPhpVersion(h)
            needWrite = true
          }
        }
        if (needWrite) {
          await writeFile(hostFile, JSON.stringify(hostList))
        }
      }
      resolve(true)
    })
  }

  _startServer(version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject, on) => {
      const bin = version.bin
      const v = version?.version?.split('.')?.slice(0, 2)?.join('') ?? ''
      const confPath = join(global.Server.PhpDir!, v, 'conf')
      const varPath = join(global.Server.PhpDir!, v, 'var')
      const logPath = join(varPath, 'log')
      const runPath = join(varPath, 'run')
      await mkdirp(confPath)
      await mkdirp(varPath)
      await mkdirp(logPath)
      await mkdirp(runPath)
      const phpFpmConf = join(confPath, 'php-fpm.conf')
      console.log('phpFpmConf: ', phpFpmConf)
      if (!existsSync(phpFpmConf)) {
        const phpFpmConfTmpl = join(global.Server.Static!, 'tmpl/php-fpm.conf')
        console.log('phpFpmConfTmpl: ', phpFpmConfTmpl)
        let content = await readFile(phpFpmConfTmpl, 'utf-8')
        content = content.replace('##PHP-CGI-VERSION##', v)
        await writeFile(phpFpmConf, content)
      }
      spawnPromise(bin, ['-p', varPath, '-y', phpFpmConf]).on(on).then(resolve).catch(reject)
    })
  }

  _doInstallExtends(
    version: SoftInstalled,
    versionNumber: number,
    extend: string,
    extendsDir: string
  ) {
    return new ForkPromise(async (resolve, reject, on) => {
      const arch = global.Server.isAppleSilicon ? '-arm64' : '-x86_64'
      const doRun = (copyfile: string, extendVersion: string, isPort = false) => {
        let params = [
          copyfile,
          global.Server.Cache!,
          version.path,
          extendVersion,
          arch,
          global.Server.Password
        ]
        if (isPort) {
          params = [
            copyfile,
            global.Server.Cache!,
            extendVersion,
            global.Server.Password,
            version.phpize,
            version.phpConfig
          ]
        }
        const command = params.join(' ')
        on(I18nT('fork.ExtensionInstallFailTips', { command }))
        spawnPromise('zsh', params).on(on).then(resolve).catch(reject)
      }

      const installByMacports = async (type: string) => {
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
          sh = join(global.Server.Static!, 'sh/port-install.sh')
          copyfile = join(global.Server.Cache!, 'port-install.sh')
          if (existsSync(copyfile)) {
            await unlink(copyfile)
          }
          let content = await readFile(sh, 'utf-8')
          content = content
            .replace('##PASSWORD##', global.Server.Password!)
            .replace('##NAME##', name)
          await writeFile(copyfile, content)
          chmod(copyfile, '0777')
          const params = [copyfile]
          const command = params.join(' ')
          on(I18nT('fork.ExtensionInstallFailTips', { command }))
          spawnPromise('zsh', params).on(on).then(resolve).catch(reject)
          return true
        }
        return false
      }

      const installByShell = async (shellFile: string, extendv: string) => {
        sh = join(global.Server.Static!, `sh/${shellFile}`)
        copyfile = join(global.Server.Cache!, shellFile)
        if (existsSync(copyfile)) {
          await unlink(copyfile)
        }
        await copyFile(sh, copyfile)
        await chmod(copyfile, '0777')
        doRun(copyfile, extendv, !!version?.phpBin)
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
          const tmplPath = join(global.Server.Cache!, `ioncube_loader_mac_${versionNumber}.so`)
          const doCopy = async () => {
            if (existsSync(tmplPath)) {
              if (!existsSync(extendsDir)) {
                await execPromise(
                  `echo '${global.Server.Password}' | sudo -S mkdir -p ${extendsDir}`
                )
              }
              await execPromise(
                `echo '${global.Server.Password}' | sudo -S cp ${tmplPath} ${soPath}`
              )
              if (existsSync(soPath)) {
                resolve(true)
                return true
              }
            }
            return false
          }
          let res = await doCopy()
          if (res) {
            return
          }
          const url = `http://mbimage.ybvips.com/electron/phpwebstudy/ioncube/ioncube_loader_mac_${versionNumber}.so`
          try {
            await downFile(url, tmplPath)
            res = await doCopy()
            if (res) {
              return
            }
          } catch (e) {
            reject(new Error('File Download Fail'))
          }
          break
        case 'redis':
          soPath = join(extendsDir, 'redis.so')
          if (existsSync(soPath)) {
            resolve(true)
            return
          }
          if (await installByMacports(extend)) {
            return
          }
          extendv = versionNumber < 7.0 ? '4.3.0' : '5.3.7'
          await installByShell('php-redis.sh', extendv)
          break
        case 'memcache':
          soPath = join(extendsDir, 'memcache.so')
          if (existsSync(soPath)) {
            resolve(true)
            return
          }
          if (await installByMacports(extend)) {
            return
          }
          extendv = versionNumber < 7.0 ? '3.0.8' : versionNumber >= 8.0 ? '8.2' : '4.0.5.2'
          await installByShell('php-memcache.sh', extendv)
          break
        case 'memcached':
          soPath = join(extendsDir, 'memcached.so')
          if (existsSync(soPath)) {
            resolve(true)
            return
          }
          if (await installByMacports(extend)) {
            return
          }
          extendv = versionNumber < 7.0 ? '2.2.0' : '3.2.0'
          await installByShell('php-memcached.sh', extendv)
          break
        case 'swoole':
          soPath = join(extendsDir, 'swoole.so')
          if (existsSync(soPath)) {
            resolve(true)
            return
          }
          if (await installByMacports(extend)) {
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
          await installByShell('php-swoole.sh', extendv)
          break
        case 'xdebug':
          soPath = join(extendsDir, 'xdebug.so')
          if (existsSync(soPath)) {
            resolve(true)
            return
          }
          if (await installByMacports(extend)) {
            return
          }
          if (versionNumber < 7.2) {
            extendv = '2.5.5'
          } else {
            extendv = '3.1.5'
          }
          await installByShell('php-xdebug.sh', extendv)
          break
        case 'xlswriter':
          soPath = join(extendsDir, 'xlswriter.so')
          if (existsSync(soPath)) {
            resolve(true)
            return
          }
          extendv = '1.5.5'
          await installByShell(
            version?.phpBin ? 'php-xlswriter-port.sh' : 'php-xlswriter.sh',
            extendv
          )
          break
        case 'ssh2':
          soPath = join(extendsDir, 'ssh2.so')
          if (existsSync(soPath)) {
            resolve(true)
            return
          }
          if (await installByMacports(extend)) {
            return
          }
          extendv = versionNumber < 7.0 ? '1.1.2' : '1.4'
          await installByShell('php-ssh2.sh', extendv)
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
          await installByShell(
            version?.phpBin ? 'php-pdo_sqlsrv-port.sh' : 'php-pdo_sqlsrv.sh',
            extendv
          )
          break
        case 'imagick':
          if (existsSync(join(extendsDir, 'imagick.so'))) {
            resolve(true)
            return
          }
          if (await installByMacports(extend)) {
            return
          }
          extendv = '3.7.0'
          await installByShell('php-imagick.sh', extendv)
          break
        case 'mongodb':
          soPath = join(extendsDir, 'mongodb.so')
          if (existsSync(soPath)) {
            resolve(true)
            return
          }
          if (await installByMacports(extend)) {
            return
          }
          extendv = versionNumber < 7.2 ? '1.7.5' : '1.14.1'
          await installByShell('php-mongodb.sh', extendv)
          break
        case 'yaf':
          soPath = join(extendsDir, 'yaf.so')
          if (existsSync(soPath)) {
            resolve(true)
            return
          }
          if (await installByMacports(extend)) {
            return
          }
          extendv = versionNumber < 7.0 ? '2.3.5' : '3.3.5'
          await installByShell('php-yaf.sh', extendv)
          break
        case 'sg11':
          if (existsSync(join(extendsDir, 'ixed.dar'))) {
            resolve(true)
            return
          }
          sh = join(global.Server.Static!, 'sh/php-sg11.sh')
          copyfile = join(global.Server.Cache!, 'php-sg11.sh')
          if (existsSync(copyfile)) {
            await unlink(copyfile)
          }
          await copyFile(sh, copyfile)
          await chmod(copyfile, '0777')
          const versionNums = version?.version?.split('.')?.splice(2)?.join('.') ?? ''
          let archStr = ''
          if (versionNumber >= 7.4 && arch === '-arm64') {
            archStr = arch
          }
          const params = [
            copyfile,
            global.Server.Cache!,
            extendsDir,
            versionNums,
            archStr,
            global.Server.Password
          ]
          const command = params.join(' ')
          on(I18nT('fork.ExtensionInstallFailTips', { command }))
          spawnPromise('zsh', params).on(on).then(resolve).catch(reject)
          break
      }
    })
  }

  doObfuscator(params: any) {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const cacheDir = global.Server.Cache!
        const obfuscatorDir = join(cacheDir, 'php-obfuscator')
        await remove(obfuscatorDir)
        const zipFile = join(global.Server.Static!, 'zip/php-obfuscator.zip')
        await compressing.zip.uncompress(zipFile, obfuscatorDir)
        const bin = join(obfuscatorDir, 'yakpro-po.php')
        let command = ''
        if (params.config) {
          const configFile = join(cacheDir, 'php-obfuscator.cnf')
          await writeFile(configFile, params.config)
          command = `${params.bin} ${bin} --config-file ${configFile} ${params.src} -o ${params.desc}`
        } else {
          command = `${params.bin} ${bin} ${params.src} -o ${params.desc}`
        }
        console.log('command: ', command)
        await execPromise(command)
        resolve(true)
      } catch (e) {
        reject(e)
      }
    })
  }
}
export default new Php()
