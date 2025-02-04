import { join, basename, dirname } from 'path'
import { createWriteStream, existsSync, statSync, unlinkSync } from 'fs'
import { Base } from './Base'
import { I18nT } from '../lang'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import {
  execPromise,
  getAllFileAsync,
  spawnPromise,
  downFile,
  versionLocalFetch,
  versionMacportsFetch,
  versionBinVersion,
  versionFixed,
  versionSort,
  brewSearch,
  brewInfoJson,
  portSearch,
  versionFilterSame,
  AppLog
} from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import compressing from 'compressing'
import { unlink, writeFile, readFile, copyFile, mkdirp, chmod, remove } from 'fs-extra'
import axios from 'axios'
import TaskQueue from '../TaskQueue'
import { ProcessPidsByPid } from '@shared/Process'
import Helper from '../Helper'

class Php extends Base {
  constructor() {
    super()
    this.type = 'php'
  }

  init() {
    this.pidPath = join(global.Server.PhpDir!, 'common/var/run/php-fpm.pid')
  }

  getIniPath(version: SoftInstalled): ForkPromise<string> {
    return new ForkPromise(async (resolve, reject) => {
      let command = ''
      let res: any
      let ini = ''
      if (version?.phpBin) {
        command = `${version.phpBin} -i | grep php.ini`
      } else {
        command = `${join(version.path, 'bin/php')} -i | grep php.ini`
      }
      try {
        console.log('getIniPath: ', command)
        res = await execPromise(command)
        ini = res?.stdout?.trim()?.split('=>')?.pop()?.trim() ?? ''
        ini = ini?.split('=>')?.pop()?.trim() ?? ''
      } catch (e) {}

      if (!ini) {
        if (version?.phpConfig) {
          command = `${version?.phpConfig} --ini-path`
        } else {
          command = `${join(version.path, 'bin/php-config')} --ini-path`
        }
        try {
          res = await execPromise(command)
          ini = res?.stdout?.trim()
        } catch (e) {}
      }

      if (ini) {
        if (!existsSync(ini)) {
          if (!ini.endsWith('.ini')) {
            const baseDir = ini
            ini = join(baseDir, 'php.ini')
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
            if (!existsSync(baseIni)) {
              if (existsSync(ini)) {
                try {
                  await Helper.send('php', 'iniFileFixed', baseIni, ini)
                } catch (e) {}
              } else {
                const tmpl = join(global.Server.Static!, 'tmpl/php.ini')
                try {
                  await Helper.send('php', 'iniFileFixed', baseIni, tmpl)
                } catch (e) {}
              }
            }
            ini = baseIni
          }
          if (existsSync(ini)) {
            const iniDefault = `${ini}.default`
            if (!existsSync(iniDefault)) {
              try {
                await Helper.send('php', 'iniDefaultFileFixed', iniDefault, ini)
              } catch (e) {}
            }
            resolve(ini)
            return
          }
        }
      }
      reject(new Error(I18nT('fork.phpiniNoFound')))
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
      console.log('args?.flag: ', args?.flag, args.libName)
      if (args?.flag === 'homebrew') {
        const checkSo = async () => {
          const baseDir = args.libName.split('/').pop()
          const dir = join(global.Server.BrewCellar!, baseDir)
          const allFile = await getAllFileAsync(dir)
          const so = allFile.filter((f) => f.endsWith('.so')).pop()
          if (so) {
            const destSo = join(installExtensionDir, basename(so))
            await mkdirp(installExtensionDir)
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
        // try {
        //   // await this._doInstallOrUnInstallByBrew(args.libName, 'install').on(on)
        // } catch (e) {}

        check = await checkSo()
        if (check) {
          resolve(0)
        } else {
          reject(new Error(I18nT('fork.ExtensionInstallFail')))
        }
        return
      }
      if (args?.flag === 'macports') {
        // try {
        //   await this._doInstallOrUnInstallByPort(args.libName, 'install').on(on)
        //   resolve(0)
        // } catch (e) {
        //   reject(e)
        // }
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

  extensionIni(item: any, version: SoftInstalled) {
    return new ForkPromise(async (resolve) => {
      const ini = await this.getIniPath(version)
      let content: string = (await Helper.send('tools', 'readFileByRoot', ini)) as any
      content = content.trim()

      const name = item.soname
      const zend = ['opcache', 'xdebug']
      const type = zend.includes(name) ? 'zend_extension' : 'extension'
      if (item.installed) {
        const regex: RegExp = new RegExp(`^(?!\\s*;)\\s*${type}\\s*=\\s*"?(${name})"?`, 'gm')
        content = content.replace(regex, ``).trim()
        if (name === 'xdebug.so') {
          content = content
            .replace(/;\[FlyEnv-xdebug-ini-begin\]([\s\S]*?);\[FlyEnv-xdebug-ini-end\]/g, ``)
            .trim()
        }
      } else {
        content += `\n${type}=${name}`
        if (name === 'xdebug.so') {
          const output_dir = join(global.Server.PhpDir!, 'xdebug')
          await mkdirp(output_dir)
          content += `\n;[FlyEnv-xdebug-ini-begin]
xdebug.idekey = "PHPSTORM"
xdebug.client_host = localhost
xdebug.client_port = 9003
xdebug.mode = debug
xdebug.profiler_append = 0
xdebug.profiler_output_name = cachegrind.out.%p
xdebug.start_with_request = yes
xdebug.trigger_value=StartProfileForMe
xdebug.output_dir = "${output_dir}"
;[FlyEnv-xdebug-ini-end]`
        }
      }
      content = content.trim()
      await Helper.send('tools', 'writeFileByRoot', ini, content)
      resolve(true)
    })
  }

  unInstallExtends(soPath: string) {
    return new ForkPromise(async (resolve, reject) => {
      try {
        if (existsSync(soPath)) {
          await Helper.send('tools', 'rm', soPath)
        }
      } catch (e) {
        reject(e)
        return
      }
      resolve(true)
    })
  }

  _stopServer(version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject, on) => {
      on({
        'APP-On-Log': AppLog('info', I18nT('appLog.stopServiceBegin', { service: this.type }))
      })
      const arr: Array<string> = []
      if (!!version?.pid?.trim()) {
        const plist: any = await Helper.send('tools', 'processList')
        const pids = ProcessPidsByPid(version.pid.trim(), plist)
        arr.push(...pids)
      } else {
        const v = version?.version?.split('.')?.slice(0, 2)?.join('') ?? ''
        const confPath = join(global.Server.PhpDir!, v, 'conf')
        const command = `ps aux | grep 'php' | awk '{print $2,$11,$12,$13,$14,$15}'`
        const res = await execPromise(command)
        const pids = res?.stdout?.toString()?.trim()?.split('\n') ?? []
        for (const p of pids) {
          if (p.includes(confPath)) {
            arr.push(p.split(' ')[0])
          }
        }
      }
      if (arr.length > 0) {
        const sig = '-INT'
        try {
          await Helper.send('tools', 'kill', sig, arr)
        } catch (e) {}
      }
      on({
        'APP-On-Log': AppLog('info', I18nT('appLog.stopServiceEnd', { service: this.type }))
      })
      resolve({
        'APP-Service-Stop-PID': arr
      })
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
        const res = await this._startServer(version).on(on)
        await this._resetEnablePhpConf(version)
        resolve(res)
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
        content = content.replace('##VERSION##', v)
        await writeFile(confPath, content)
      }
      resolve(true)
    })
  }

  _startServer(version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject, on) => {
      on({
        'APP-On-Log': AppLog(
          'info',
          I18nT('appLog.startServiceBegin', { service: `${this.type}-${version.version}` })
        )
      })
      const bin = version.bin
      const v = version?.version?.split('.')?.slice(0, 2)?.join('') ?? ''
      const confPath = join(global.Server.PhpDir!, v, 'conf')
      const varPath = join(global.Server.PhpDir!, v, 'var')
      const logPath = join(varPath, 'log')
      const runPath = join(varPath, 'run')
      const pid = join(runPath, 'php-fpm.pid')
      await mkdirp(confPath)
      await mkdirp(varPath)
      await mkdirp(logPath)
      await mkdirp(runPath)
      const phpFpmConf = join(confPath, 'php-fpm.conf')
      if (!existsSync(phpFpmConf)) {
        const phpFpmConfTmpl = join(global.Server.Static!, 'tmpl/php-fpm.conf')
        let content = await readFile(phpFpmConfTmpl, 'utf-8')
        content = content.replace('##PHP-CGI-VERSION##', v)
        await writeFile(phpFpmConf, content)
      }
      if (existsSync(pid)) {
        try {
          await remove(pid)
        } catch (e) {}
      }
      on({
        'APP-On-Log': AppLog('info', I18nT('appLog.execStartCommand'))
      })
      try {
        await spawnPromise(bin, ['-p', varPath, '-y', phpFpmConf, '-g', pid])
      } catch (e) {
        on({
          'APP-On-Log': AppLog(
            'error',
            I18nT('appLog.execStartCommandFail', {
              error: e,
              service: `${this.type}-${version.version}`
            })
          )
        })
        console.log('start e: ', e)
        reject(e)
        return
      }

      on({
        'APP-On-Log': AppLog('info', I18nT('appLog.execStartCommandSuccess'))
      })
      on({
        'APP-Service-Start-Success': true
      })
      const res = await this.waitPidFile(pid)
      if (res && res?.pid) {
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.startServiceSuccess', { pid: res.pid }))
        })
        resolve({
          'APP-Service-Start-PID': res.pid
        })
        return
      }
      on({
        'APP-On-Log': AppLog(
          'error',
          I18nT('appLog.execStartCommandFail', {
            error: res ? res?.error : 'Start Fail',
            service: `${this.type}-${version.version}`
          })
        )
      })
      reject(new Error(res ? res?.error : 'Start Fail'))
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
        let params: string[] = [copyfile, global.Server.Cache!, version.path, extendVersion, arch]
        if (isPort) {
          params = [
            copyfile,
            global.Server.Cache!,
            extendVersion,
            version.phpize!,
            version.phpConfig!
          ]
        }
        const command = params.join(' ')
        on(I18nT('fork.ExtensionInstallFailTips', { command }))
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
          content = content.replace('##NAME##', name)
          await writeFile(copyfile, content)
          await chmod(copyfile, '0777')
          const params = [copyfile]
          const command = params.join(' ')
          on(I18nT('fork.ExtensionInstallFailTips', { command }))
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
        doRun(copyfile, extendv, shellFile.endsWith('-port.sh'))
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
                // await ([`mkdir`, '-p', extendsDir])
              }
              // await ([`cp`, tmplPath, soPath])
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
          } else if (versionNumber < 8.3) {
            extendv = '5.0.3'
          } else {
            extendv = '5.1.1'
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
            extendv = '5.11.1'
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
          const params = [copyfile, global.Server.Cache!, extendsDir, versionNums, archStr]
          const command = params.join(' ')
          on(I18nT('fork.ExtensionInstallFailTips', { command }))
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
        await execPromise(command)
        resolve(true)
      } catch (e) {
        reject(e)
      }
    })
  }

  fetchAllOnLineVersion() {
    return new ForkPromise(async (resolve) => {
      try {
        const all: OnlineVersionItem[] = await this._fetchOnlineVersion('php')
        const dict: any = {}
        all.forEach((a: any) => {
          const dir = join(global.Server.AppDir!, `static-php-${a.version}`, 'sbin/php-fpm')
          const zip = join(global.Server.Cache!, `static-php-${a.version}.tar.gz`)
          a.appDir = join(global.Server.AppDir!, `static-php-${a.version}`)
          a.zip = zip
          a.bin = dir
          a.downloaded = existsSync(zip)
          a.installed = existsSync(dir)
          dict[`php-${a.version}`] = a
        })
        resolve(dict)
      } catch (e) {
        resolve({})
      }
    })
  }

  installSoft(row: any) {
    return new ForkPromise(async (resolve, reject, on) => {
      const refresh = () => {
        row.downloaded = existsSync(row.zip)
        row.installed = existsSync(row.bin)
      }

      const cliZIP = join(dirname(row.zip), `static-php-${row.version}-cli.tar.gz`)
      if (existsSync(row.zip) && existsSync(cliZIP)) {
        let success = false
        try {
          let bin = join(row.appDir, 'bin')
          await mkdirp(bin)
          await execPromise(`tar -xzf ${cliZIP} -C ${bin}`)

          bin = join(row.appDir, 'sbin')
          await mkdirp(bin)
          await execPromise(`tar -xzf ${row.zip} -C ${bin}`)

          success = true
        } catch (e) {}
        if (success) {
          refresh()
          row.downState = 'success'
          row.progress = 100
          on(row)
          resolve(true)
          return
        }
      }
      const proxy = this.getAxiosProxy()
      let p0 = 0
      let p1 = 0
      const downFPM = (): Promise<boolean> => {
        return new Promise((resolve) => {
          axios({
            method: 'get',
            url: row.url,
            proxy,
            responseType: 'stream',
            onDownloadProgress: (progress) => {
              if (progress.total) {
                p0 = (progress.loaded * 100.0) / progress.total
                row.progress = Math.round(((p0 + p1) / 200.0) * 100.0)
                on(row)
              }
            }
          })
            .then(function (response) {
              const stream = createWriteStream(row.zip)
              response.data.pipe(stream)
              stream.on('error', (err: any) => {
                console.log('stream error: ', err)
                try {
                  if (existsSync(row.zip)) {
                    unlinkSync(row.zip)
                  }
                } catch (e) {}
                resolve(false)
              })
              stream.on('finish', async () => {
                try {
                  if (existsSync(row.zip)) {
                    const sbin = join(row.appDir, 'sbin')
                    await mkdirp(sbin)
                    await execPromise(`tar -xzf ${row.zip} -C ${sbin}`)
                  }
                } catch (e) {}
                resolve(true)
              })
            })
            .catch((err) => {
              console.log('down error: ', err)
              try {
                if (existsSync(row.zip)) {
                  unlinkSync(row.zip)
                }
              } catch (e) {}
              resolve(false)
            })
        })
      }
      const downCLI = (): Promise<boolean> => {
        return new Promise((resolve) => {
          const url = row.url.replace('-fpm-', '-cli-')
          axios({
            method: 'get',
            url,
            proxy,
            responseType: 'stream',
            onDownloadProgress: (progress) => {
              if (progress.total) {
                p1 = (progress.loaded * 100.0) / progress.total
                row.progress = Math.round(((p0 + p1) / 200.0) * 100.0)
                on(row)
              }
            }
          })
            .then(function (response) {
              const stream = createWriteStream(cliZIP)
              response.data.pipe(stream)
              stream.on('error', (err: any) => {
                console.log('stream error: ', err)
                try {
                  if (existsSync(cliZIP)) {
                    unlinkSync(cliZIP)
                  }
                } catch (e) {}
                resolve(false)
              })
              stream.on('finish', async () => {
                try {
                  if (existsSync(cliZIP)) {
                    const bin = join(row.appDir, 'bin')
                    await mkdirp(bin)
                    await execPromise(`tar -xzf ${cliZIP} -C ${bin}`)
                  }
                } catch (e) {}
                resolve(true)
              })
            })
            .catch((err) => {
              console.log('down error: ', err)
              try {
                if (existsSync(cliZIP)) {
                  unlinkSync(cliZIP)
                }
              } catch (e) {}
              resolve(false)
            })
        })
      }

      Promise.all([downFPM(), downCLI()]).then(async ([res0, res1]: [boolean, boolean]) => {
        if (res0 && res1) {
          row.downState = 'success'
          refresh()
          on(row)
          resolve(true)
          return
        }
        await remove(row.appDir)
        row.downState = 'exception'
        refresh()
        on(row)
        setTimeout(() => {
          resolve(false)
        }, 1500)
      })
    })
  }

  allInstalledVersions(setup: any) {
    return new ForkPromise(async (resolve) => {
      const base = '/opt/local/'
      const allSbinFile = await getAllFileAsync(join(base, 'sbin'), false)
      const fpms = allSbinFile.filter((f) => f.startsWith('php-fpm')).map((f) => `sbin/${f}`)
      let versions: SoftInstalled[] = []
      Promise.all([
        versionLocalFetch(setup?.php?.dirs ?? [], 'php-fpm', 'php'),
        versionMacportsFetch(fpms)
      ])
        .then(async (list) => {
          versions = list.flat()
          versions = versionFilterSame(versions)
          const all = versions.map((item) => {
            const command = `${item.bin} -n -v`
            const reg = /(\s)(\d+(\.\d+){1,4})([-\s])/g
            return TaskQueue.run(versionBinVersion, command, reg)
          })
          return Promise.all(all)
        })
        .then((list) => {
          list.forEach((v, i) => {
            const { error, version } = v
            const num = version
              ? Number(versionFixed(version).split('.').slice(0, 2).join(''))
              : null
            Object.assign(versions[i], {
              version: version,
              num,
              enable: version !== null,
              error
            })
          })
          for (const item of versions) {
            if (item.flag === 'macports') {
              const v = item.bin.split('sbin/php-fpm').pop() ?? ''
              Object.assign(item, {
                phpBin: `/opt/local/bin/php${v}`,
                phpConfig: `/opt/local/bin/php-config${v}`,
                phpize: `/opt/local/bin/phpize${v}`
              })
            }
          }
          resolve(versionSort(versions))
        })
        .catch(() => {
          resolve([])
        })
    })
  }

  brewinfo() {
    return new ForkPromise(async (resolve, reject) => {
      try {
        let all: Array<string> = ['php']
        const cammand = 'brew search -q --formula "/^(php|shivammathur/php/php)@[\\d\\.]+$/"'
        all = await brewSearch(all, cammand)
        const info = await brewInfoJson(all)
        resolve(info)
      } catch (e) {
        reject(e)
        return
      }
    })
  }

  portinfo() {
    return new ForkPromise(async (resolve) => {
      const Info: { [k: string]: any } = await portSearch(
        `^php\\d*$`,
        (f) => {
          return f.includes('lang www') && f.includes('PHP: Hypertext Preprocessor')
        },
        (name) => {
          return existsSync(join('/opt/local/bin/', name))
        }
      )
      resolve(Info)
    })
  }
}
export default new Php()
