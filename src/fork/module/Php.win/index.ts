import { join, dirname, basename, isAbsolute } from 'path'
import { createWriteStream, existsSync } from 'fs'
import { Base } from '../Base'
import { I18nT } from '@lang/index'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import {
  AppLog,
  execPromise,
  versionBinVersion,
  versionFilterSame,
  versionFixed,
  versionSort,
  writeFile,
  readFile,
  remove,
  mkdirp,
  copyFile,
  readdir,
  zipUnpack,
  versionLocalFetch,
  serviceStartExecWin
} from '../../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import TaskQueue from '../../TaskQueue'
import axios from 'axios'
import { ProcessListSearch } from '@shared/Process.win'
import Helper from '../../Helper'
import { parse as iniParse } from 'ini'

class Php extends Base {
  constructor() {
    super()
    this.type = 'php'
  }

  init() {
    this.pidPath = join(global.Server.PhpDir!, 'php.pid')
  }

  initCACertPEM() {
    return new ForkPromise(async (resolve) => {
      const capem = join(global.Server.BaseDir!, 'CA/cacert.pem')
      if (!existsSync(capem)) {
        try {
          await mkdirp(dirname(capem))
          await copyFile(join(global.Server.Static!, 'tmpl/cacert.pem'), capem)
        } catch {}
      }
      resolve(true)
    })
  }

  getIniPath(version: SoftInstalled): ForkPromise<string> {
    return new ForkPromise(async (resolve, reject) => {
      const ini = join(version.path, 'php.ini')
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
        dll = join(version.path, 'ext/php_openssl.dll')
        if (existsSync(dll)) {
          content = content + `\nextension=php_openssl.dll`
        }
        dll = join(version.path, 'ext/php_curl.dll')
        if (existsSync(dll)) {
          content = content + `\nextension=php_curl.dll`
        }
        dll = join(version.path, 'ext/php_gd.dll')
        if (existsSync(dll)) {
          content = content + `\nextension=php_gd.dll`
        }
        dll = join(version.path, 'ext/php_fileinfo.dll')
        if (existsSync(dll)) {
          content = content + `\nextension=php_fileinfo.dll`
        }
        dll = join(version.path, 'ext/php_zip.dll')
        if (existsSync(dll)) {
          content = content + `\nextension=php_zip.dll`
        }
        dll = join(version.path, 'ext/php_mbstring.dll')
        if (existsSync(dll)) {
          content = content + `\nextension=php_mbstring.dll`
        }

        content = content + `\nextension=php_mysqli.dll`
        content = content + `\nextension=php_pdo_mysql.dll`
        content = content + `\nextension=php_pdo_odbc.dll`

        // Set CA certificate path
        const cacertpem = join(global.Server.BaseDir!, 'CA/cacert.pem').split('\\').join('/')
        await mkdirp(dirname(cacertpem))
        if (!existsSync(cacertpem)) {
          await copyFile(join(global.Server.Static!, 'tmpl/cacert.pem'), cacertpem)
        }
        content = content.replace(';curl.cainfo =', `curl.cainfo = "${cacertpem}"`)
        content = content.replace(';openssl.cafile=', `openssl.cafile="${cacertpem}"`)

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

      reject(new Error(I18nT('fork.phpiniNotFound')))
    })
  }

  getErrorLogPathFromIni(version: SoftInstalled, iniPath?: string) {
    return new ForkPromise(async (resolve) => {
      const iniFile = iniPath || (await this.getIniPath(version))
      console.log('getErrorLogPathFromIni iniFile ', iniFile)
      if (iniFile && existsSync(iniFile)) {
        const content = await readFile(iniFile, 'utf8')
        const config = iniParse(content)
        console.log('getErrorLogPathFromIni config ', config)
        resolve(config?.PHP?.error_log ?? config?.error_log ?? '')
        return
      }
      resolve('')
    })
  }

  _stopServer(version: SoftInstalled): ForkPromise<{ 'APP-Service-Stop-PID': string[] }> {
    return new ForkPromise(async (resolve, reject, on) => {
      on({
        'APP-On-Log': AppLog('info', I18nT('appLog.stopServiceBegin', { service: this.type }))
      })
      const all = await ProcessListSearch(`phpwebstudy.90${version.num}`, false)
      const arr: Array<string> = []
      const fpm: Array<string> = []
      all.forEach((item) => {
        if (item?.COMMAND?.includes('php-cgi-spawner.exe')) {
          fpm.push(item.PID)
        } else {
          arr.push(item.PID)
        }
      })
      arr.unshift(...fpm)
      console.log('php arr: ', arr)
      if (arr.length > 0) {
        try {
          await Helper.send('tools', 'kill', '-INT', arr)
        } catch {}
      }
      on({
        'APP-On-Log': AppLog('info', I18nT('appLog.stopServiceEnd', { service: this.type }))
      })
      resolve({
        'APP-Service-Stop-PID': arr
      })
    })
  }

  #initFPM() {
    return new Promise((resolve) => {
      const fpm = join(global.Server.PhpDir!, 'php-cgi-spawner.exe')
      if (!existsSync(fpm)) {
        zipUnpack(join(global.Server.Static!, `zip/php_cgi_spawner.7z`), global.Server.PhpDir!)
          .then(resolve)
          .catch(resolve)
        return
      }
      resolve(true)
    })
  }

  startService(version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject, on) => {
      if (!existsSync(version?.bin)) {
        reject(new Error(I18nT('fork.binNotFound')))
        return
      }
      if (!version?.version) {
        reject(new Error(I18nT('fork.versionNotFound')))
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

  _startServer(version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject, on) => {
      on({
        'APP-On-Log': AppLog(
          'info',
          I18nT('appLog.startServiceBegin', { service: `${this.type}-${version.version}` })
        )
      })
      await this.#initFPM()
      await this.getIniPath(version)
      if (!existsSync(join(version.path, 'php-cgi-spawner.exe'))) {
        await copyFile(
          join(global.Server.PhpDir!, 'php-cgi-spawner.exe'),
          join(version.path, 'php-cgi-spawner.exe')
        )
      }

      const ini = join(version.path, 'php.ini')
      const runIni = join(version.path, `php.phpwebstudy.90${version.num}.ini`)
      if (existsSync(runIni)) {
        await remove(runIni)
      }
      await copyFile(ini, runIni)

      const bin = join(version.path, 'php-cgi-spawner.exe')
      const pidPath = join(global.Server.PhpDir!, `php${version.num}.pid`)
      const execArgs = `\`"php-cgi.exe -c php.phpwebstudy.90${version.num}.ini\`" 90${version.num} 4`

      try {
        const res = await serviceStartExecWin({
          version,
          pidPath,
          baseDir: global.Server.PhpDir!,
          bin,
          execArgs,
          execEnv: '',
          on,
          checkPidFile: false
        })
        resolve(res)
      } catch (e: any) {
        console.log('-k start err: ', e)
        reject(e)
        return
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
        await zipUnpack(zipFile, obfuscatorDir)
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

  fetchAllOnlineVersion() {
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
          a.name = `PHP-${a.version}`
        })
        resolve(all)
      } catch {
        resolve([])
      }
    })
  }

  allInstalledVersions(setup: any) {
    return new ForkPromise((resolve) => {
      let versions: SoftInstalled[] = []
      Promise.all([versionLocalFetch(setup?.php?.dirs ?? [], 'php-cgi.exe')])
        .then(async (list) => {
          versions = list.flat()
          versions = versionFilterSame(versions)
          const all = versions.map((item) => {
            const command = `"${item.bin}" -n -v`
            const reg = /(PHP )(\d+(\.\d+){1,4})( )/g
            return TaskQueue.run(versionBinVersion, item.bin, command, reg)
          })
          return Promise.all(all)
        })
        .then(async (list) => {
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
          resolve(versionSort(versions))
        })
        .catch(() => {
          resolve([])
        })
    })
  }

  fetchExtensionDir(version: SoftInstalled): ForkPromise<string> {
    return new ForkPromise(async (resolve) => {
      const ini = await this.getIniPath(version)
      let content: string = await readFile(ini, 'utf-8')

      let dir: string = ''
      const regex: RegExp = /^(?!\s*;)\s*extension_dir\s*=\s*"?([^"\s]+)"?/gm
      let m: any
      while ((m = regex.exec(content)) !== null) {
        if (m && m.length > 0) {
          dir = m[1].trim()
        }
      }

      if (!dir) {
        content = content.trim() + `\nextension_dir = "ext"`
        await writeFile(ini, content)
        dir = join(dirname(version.bin), 'ext')
      } else if (!isAbsolute(dir)) {
        dir = join(dirname(version.bin), dir)
      }
      if (existsSync(dir)) {
        resolve(dir)
      }
      resolve('')
    })
  }

  localExec(item: any, version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject) => {
      const ini = await this.getIniPath(version)
      let content: string = await readFile(ini, 'utf-8')
      content = content.trim()

      if (item.installed) {
        const type = item.iniStr.includes('zend_') ? 'zend_extension' : 'extension'
        const regex: RegExp = new RegExp(
          `^(?!\\s*;)\\s*${type}\\s*=\\s*"?(${item.name})(\\.dll)?"?`,
          'gm'
        )
        content = content.replace(regex, ``).trim()
        if (item.name === 'php_xdebug') {
          content = content
            .replace(/;\[FlyEnv-xdebug-ini-begin\]([\s\S]*?);\[FlyEnv-xdebug-ini-end\]/g, ``)
            .trim()
        }
      } else {
        let dll = item.iniStr
        if (!dll.includes(`.dll`)) {
          dll = dll.replace(/"/g, '').trim()
          dll += '.dll'
        }
        content += `\n${dll}`
        if (item.name === 'php_xdebug') {
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
      await writeFile(ini, content)
      this.fetchLocalExtend(version).then(resolve).catch(reject)
    })
  }

  fetchLocalExtend(version: SoftInstalled) {
    return new ForkPromise(async (resolve) => {
      const ini = await this.getIniPath(version)
      let content: string = await readFile(ini, 'utf-8')

      let dir: string = ''
      let regex: RegExp = /^(?!\s*;)\s*extension_dir\s*=\s*"?([^"\s]+)"?/gm
      let m: any
      while ((m = regex.exec(content)) !== null) {
        if (m && m.length > 0) {
          dir = m[1].trim()
        }
      }

      if (!dir) {
        content = content.trim() + `\nextension_dir = "ext"`
        await writeFile(ini, content)
        dir = join(dirname(version.bin), 'ext')
      } else if (!isAbsolute(dir)) {
        dir = join(dirname(version.bin), dir)
      }

      console.log('fetchLocalExtend dir: ', dir)

      const local: any = []
      const used: any = []

      regex = /^(?!\s*;)\s*extension\s*=\s*"?([^"\s]+)"?/gm
      while ((m = regex.exec(content)) !== null) {
        if (m && m.length > 0) {
          const name = m[1].split('.').shift().trim()
          const iniStr = m[0].trim()
          used.push({
            name,
            iniStr
          })
        }
      }

      regex.lastIndex = 0
      regex = /^(?!\s*;)\s*zend_extension\s*=\s*"?([^"\s]+)"?/gm
      while ((m = regex.exec(content)) !== null) {
        if (m && m.length > 0) {
          const name = m[1].split('.').shift().trim()
          const iniStr = m[0].trim()
          used.push({
            name,
            iniStr
          })
        }
      }

      const zend = ['php_opcache', 'php_xdebug']

      if (existsSync(dir)) {
        let all: any = await readdir(dir)
        all = all
          .map((a: string) => a.split('.').shift()!)
          .map((a: string) => {
            return {
              name: a,
              iniStr: zend.includes(a.toLowerCase()) ? `zend_extension=${a}` : `extension=${a}`
            }
          })
        local.push(...all)
      }

      resolve({
        local,
        used,
        dir
      })
    })
  }

  fetchLibExtend() {
    return new ForkPromise(async (resolve) => {
      let list: any = []
      try {
        const res = await axios({
          url: 'https://api.macphpstudy.com/api/version/php_extension',
          method: 'post',
          proxy: this.getAxiosProxy()
        })
        list = res?.data?.data ?? []
      } catch {}
      resolve(list)
    })
  }

  libExec(item: any, version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject, on) => {
      const ini = await this.getIniPath(version)
      let content: string = await readFile(ini, 'utf-8')
      content = content.trim()

      const name = `php_${item.name.toLowerCase()}`
      const zend = ['php_opcache', 'php_xdebug']
      const type = zend.includes(name) ? 'zend_extension' : 'extension'
      if (item.installed) {
        const regex: RegExp = new RegExp(
          `^(?!\\s*;)\\s*${type}\\s*=\\s*"?(${name})(\\.dll)?"?`,
          'gm'
        )
        content = content.replace(regex, ``).trim()
        if (name === 'php_xdebug') {
          content = content
            .replace(/;\[FlyEnv-xdebug-ini-begin\]([\s\S]*?);\[FlyEnv-xdebug-ini-end\]/g, ``)
            .trim()
        }
      } else {
        const dir: string = await this.fetchExtensionDir(version)
        const file = join(dir, `${name}.dll`)
        if (!existsSync(file)) {
          const handleImagick = async (cacheDir: string) => {
            if (name !== 'php_imagick') {
              return
            }
            const allFile = await readdir(cacheDir)
            const allDLL = allFile.filter((a) => a.toLowerCase().endsWith('.dll'))
            const destDir = version.path
            await Promise.all(allDLL.map((a) => copyFile(join(cacheDir, a), join(destDir, a))))
          }
          const install = () => {
            return new Promise(async (resolve, reject) => {
              const phpVersion = version.version!.split('.').slice(0, 2).join('.')
              const zipFile = join(global.Server.Cache!, `${name}-php${phpVersion}.zip`)
              const cacheDir = join(global.Server.Cache!, `${name}-php${phpVersion}-cache`)
              const dll = join(cacheDir, `${name}.dll`)

              if (existsSync(zipFile)) {
                try {
                  await zipUnpack(zipFile, cacheDir)
                } catch {}
                if (existsSync(dll)) {
                  await copyFile(dll, file)
                  await handleImagick(cacheDir)
                  await remove(cacheDir)
                  if (existsSync(file)) {
                    resolve(true)
                    return
                  } else {
                    reject(new Error(`${name}.dll no found`))
                    return
                  }
                }
                await remove(cacheDir)
                await remove(zipFile)
              }
              const url = item.versions[phpVersion][0].url
              axios({
                method: 'get',
                url,
                proxy: this.getAxiosProxy(),
                responseType: 'stream',
                onDownloadProgress: (progress) => {
                  if (progress.total) {
                    const percent = Math.round((progress.loaded * 100.0) / progress.total)
                    on({
                      percent,
                      state: 'downing'
                    })
                  }
                }
              })
                .then(function (response) {
                  const stream = createWriteStream(zipFile)
                  response.data.pipe(stream)
                  stream.on('error', async (e: any) => {
                    try {
                      if (existsSync(zipFile)) {
                        await remove(zipFile)
                      }
                    } catch {}
                    reject(e)
                  })
                  stream.on('finish', async () => {
                    on({
                      percent: 100,
                      state: 'downing'
                    })
                    try {
                      if (existsSync(zipFile)) {
                        await zipUnpack(zipFile, cacheDir)
                      }
                    } catch (e) {
                      reject(e)
                      return
                    }
                    if (existsSync(dll)) {
                      await copyFile(dll, file)
                      await handleImagick(cacheDir)
                      await remove(cacheDir)
                      if (existsSync(file)) {
                        resolve(true)
                        return
                      }
                    }
                    reject(new Error(`${name}.dll no found`))
                  })
                })
                .catch(reject)
            })
          }
          try {
            await install()
          } catch (e) {
            reject(e)
            return
          }
        }
        content += `\n${type}=${name}.dll`
        if (name === 'php_xdebug') {
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
      await writeFile(ini, content)
      this.fetchLocalExtend(version).then(resolve).catch(reject)
    })
  }
}
export default new Php()
