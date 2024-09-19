import { join, dirname, basename } from 'path'
import { existsSync } from 'fs'
import { Base } from './Base'
import { I18nT } from '../lang'
import type { AppHost, OnlineVersionItem, SoftInstalled } from '@shared/app'
import { execPromise, execPromiseRoot } from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { writeFile, readFile, remove, mkdirp, copyFile } from 'fs-extra'
import { zipUnPack } from '@shared/file'

class Php extends Base {
  constructor() {
    super()
    this.type = 'php'
  }

  init() {
    this.pidPath = join(global.Server.PhpDir!, 'php.pid')
  }

  getIniPath(version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject) => {
      let ini = join(version.path, 'php.ini')
      if (existsSync(ini)) {
        resolve(ini)
        return
      }

      const initIniFile = async (file: string) => {
        let content = await readFile(file, 'utf-8')
        content = content.replace(';extension_dir = "ext"', 'extension_dir = "ext"')
        let dll = join(version.path, 'ext/php_redis.dll')
        if (existsSync(dll)) {
          content = content + `\nextension=php_redis.dll`
        }
        dll = join(version.path, 'ext/php_xdebug.dll')
        if (existsSync(dll)) {
          content = content + `\nzend_extension=php_xdebug.dll`
        }
        dll = join(version.path, 'ext/php_mongodb.dll')
        if (existsSync(dll)) {
          content = content + `\nextension=php_mongodb.dll`
        }
        dll = join(version.path, 'ext/php_memcache.dll')
        if (existsSync(dll)) {
          content = content + `\nextension=php_memcache.dll`
        }
        dll = join(version.path, 'ext/php_pdo_sqlsrv.dll')
        if (existsSync(dll)) {
          content = content + `\nextension=php_pdo_sqlsrv.dll`
        }

        content = content + `\nextension=php_mysqli.dll`
        content = content + `\nextension=php_pdo_mysql.dll`
        content = content + `\nextension=php_pdo_odbc.dll`

        await writeFile(ini, content)
        const iniDefault = join(version.path, 'php.ini.default')
        await writeFile(iniDefault, content)
      }

      const devIni = join(version.path, 'php.ini-development')
      if (existsSync(devIni)) {
        await initIniFile(devIni)
        if (existsSync(ini)) {
          resolve(ini)
          return
        }
      }

      const proIni = join(version.path, 'php.ini-production')
      if (existsSync(proIni)) {
        await initIniFile(proIni)
        if (existsSync(ini)) {
          resolve(ini)
          return
        }
      }

      reject(new Error(I18nT('fork.phpiniNoFound')))
    })
  }

  installExtends(args: any) {
    return new ForkPromise(async (resolve, reject, on) => {
      resolve(true)
    })
  }

  unInstallExtends(soPath: string) {
    return new ForkPromise(async (resolve, reject) => {
      resolve(true)
    })
  }

  _stopServer(version: SoftInstalled) {
    return new ForkPromise(async (resolve) => {
      const serverName = 'php-cgi'
      const command = `wmic process get commandline,ProcessId | findstr "${serverName}"`
      console.log('_stopServer command: ', command)
      let res: any = null
      try {
        res = await execPromiseRoot(command)
      } catch (e) { }
      const pids = res?.stdout?.trim()?.split('\n') ?? []
      const arr: Array<string> = []
      const fpm: Array<string> = []
      for (const p of pids) {
        if (p.includes(`phpwebstudy.90${version.num}`)) {
          const pid = p.split(' ').filter((s: string) => {
            return !!s.trim()
          }).pop()
          if (pid) {
            if (p.includes('php-cgi-spawner.exe')) {
              fpm.push(pid.trim())
            } else {
              arr.push(pid.trim())
            }
          }
        }
      }
      arr.unshift(...fpm)
      console.log('php arr: ', arr)
      if (arr.length > 0) {
        const str = arr.map((s) => `/pid ${s}`).join(' ')
        await execPromiseRoot(`taskkill /f /t ${str}`)

        // for (const pid of arr) {
        //   try {
        //     await execPromiseRoot(`wmic process where processid="${pid}" delete`)
        //   } catch (e) { }
        // }
      }
      resolve(true)
    })
  }

  #initFPM() {
    return new Promise((resolve) => {
      const fpm = join(global.Server.PhpDir!, 'php-cgi-spawner.exe')
      if (!existsSync(fpm)) {
        zipUnPack(join(global.Server.Static!, `zip/php_cgi_spawner.7z`), global.Server.PhpDir!)
          .then(resolve)
          .catch(resolve)
        return
      }
      resolve(true)
    })
  }

  startService(version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject, on) => {
      await this.initLocalApp(version, 'php')
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
      const confPath = join(global.Server.NginxDir!, 'conf/enable-php.conf')
      await mkdirp(join(global.Server.NginxDir!, 'conf'))
      const tmplPath = join(global.Server.Static!, 'tmpl/enable-php.conf')
      if (existsSync(tmplPath)) {
        let content = await readFile(tmplPath, 'utf-8')
        content = content.replace('##VERSION##', v)
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
          const replace = `SetHandler "proxy:fcgi:127.0.0.1:90${v}"`
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
      await this.#initFPM()
      await this.getIniPath(version)
      if (!existsSync(join(version.path, 'php-cgi-spawner.exe'))) {
        await copyFile(join(global.Server.PhpDir!, 'php-cgi-spawner.exe'), join(version.path, 'php-cgi-spawner.exe'))
      }

      const ini = join(version.path, 'php.ini')
      const runIni = join(version.path, `php.phpwebstudy.90${version.num}.ini`)
      if (existsSync(runIni)) {
        await remove(runIni)
      }
      await copyFile(ini, runIni)

      process.chdir(dirname(version.bin));

      const command = `start /b ./php-cgi-spawner.exe "php-cgi.exe -c php.phpwebstudy.90${version.num}.ini" 90${version.num} 4`
      console.log('_startServer command: ', command)

      try {
        const res = await execPromiseRoot(command)
        console.log('start res: ', res)
        if (res.stderr) {
          reject(new Error(res.stderr))
          return
        }
        on(res.stdout)
        resolve(0)
      } catch (e: any) {
        reject(e)
      }
    })
  }

  _doInstallExtends(
    version: SoftInstalled,
    versionNumber: number,
    extend: string,
    extendsDir: string
  ) {
    return new ForkPromise(async (resolve, reject, on) => {
    })
  }

  doObfuscator(params: any) {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const cacheDir = global.Server.Cache!
        const obfuscatorDir = join(cacheDir, 'php-obfuscator')
        await remove(obfuscatorDir)
        const zipFile = join(global.Server.Static!, 'zip/php-obfuscator.zip')
        await zipUnPack(zipFile, obfuscatorDir)
        const bin = join(obfuscatorDir, 'yakpro-po.php')
        let command = ''
        if (params.config) {
          const configFile = join(cacheDir, 'php-obfuscator.cnf')
          await writeFile(configFile, params.config)
          command = `${basename(params.bin)} "${bin}" --config-file "${configFile}" "${params.src}" -o "${params.desc}"`
        } else {
          command = `${basename(params.bin)} "${bin}" "${params.src}" -o "${params.desc}"`
        }
        await execPromise(command, {
          cwd: dirname(params.bin)
        })
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
        all.forEach((a: any) => {
          const dir = join(global.Server.AppDir!, `php-${a.version}`, 'php.exe')
          const zip = join(global.Server.Cache!, `php-${a.version}.zip`)
          a.appDir = join(global.Server.AppDir!, `php-${a.version}`)
          a.zip = zip
          a.bin = dir
          a.downloaded = existsSync(zip)
          a.installed = existsSync(dir)
        })
        resolve(all)
      } catch (e) {
        resolve([])
      }
    })
  }
}
export default new Php()
