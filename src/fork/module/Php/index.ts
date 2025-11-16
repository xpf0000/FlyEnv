import { join, dirname } from 'path'
import { createWriteStream, existsSync, statSync, unlinkSync } from 'fs'
import { Base } from '../Base'
import { I18nT } from '@lang/index'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import {
  execPromise,
  getAllFileAsync,
  versionLocalFetch,
  versionMacportsFetch,
  versionBinVersion,
  versionFixed,
  versionSort,
  brewSearch,
  brewInfoJson,
  portSearch,
  versionFilterSame,
  AppLog,
  serviceStartExec,
  writeFile,
  readFile,
  copyFile,
  mkdirp,
  remove
} from '../../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import compressing from 'compressing'
import axios from 'axios'
import TaskQueue from '../../TaskQueue'
import { ProcessPidsByPid } from '@shared/Process'
import Helper from '../../Helper'
import { unpack } from '../../util/Zip'
import { parse as iniParse } from 'ini'

class Php extends Base {
  constructor() {
    super()
    this.type = 'php'
  }

  init() {
    this.pidPath = join(global.Server.PhpDir!, 'common/var/run/php-fpm.pid')
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
      } catch {}

      if (!ini) {
        if (version?.phpConfig) {
          command = `${version?.phpConfig} --ini-path`
        } else {
          command = `${join(version.path, 'bin/php-config')} --ini-path`
        }
        try {
          res = await execPromise(command)
          ini = res?.stdout?.trim()
        } catch {}
      }

      if (ini) {
        if (!existsSync(ini)) {
          if (!ini.endsWith('.ini')) {
            const baseDir = ini
            ini = join(baseDir, 'php.ini')
          }
          const tmpl = join(global.Server.Static!, 'tmpl/php.ini')
          const content = await readFile(tmpl, 'utf-8')
          const cacheFile = join(global.Server.Cache!, 'php.ini')
          await writeFile(cacheFile, content)
          try {
            await Helper.send('php', 'iniFileFixed', ini, cacheFile)
            await Helper.send('tools', 'chmod', ini, '777')
          } catch {}
          await remove(cacheFile)
        }
        if (existsSync(ini)) {
          if (statSync(ini).isDirectory()) {
            const baseIni = join(ini, 'php.ini')
            ini = join(ini, 'php.ini-development')
            if (!existsSync(baseIni)) {
              if (existsSync(ini)) {
                try {
                  await Helper.send('php', 'iniFileFixed', baseIni, ini)
                  await Helper.send('tools', 'chmod', baseIni, '777')
                } catch {}
              } else {
                const tmpl = join(global.Server.Static!, 'tmpl/php.ini')
                const content = await readFile(tmpl, 'utf-8')
                const cacheFile = join(global.Server.Cache!, 'php.ini')
                await writeFile(cacheFile, content)
                try {
                  await Helper.send('php', 'iniFileFixed', baseIni, cacheFile)
                  await Helper.send('tools', 'chmod', baseIni, '777')
                } catch {}
                await remove(cacheFile)
              }
            }
            ini = baseIni
          }
          if (existsSync(ini)) {
            const iniDefault = `${ini}.default`
            if (!existsSync(iniDefault)) {
              try {
                await Helper.send('php', 'iniDefaultFileFixed', iniDefault, ini)
              } catch {}
            }
            resolve(ini)
            return
          }
        }
      }
      reject(new Error(I18nT('php.phpiniNotFound')))
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
      if (version?.pid?.trim()) {
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

      const baseDir = global.Server.PhpDir!
      const execEnv = ''
      const execArgs = `-p "${varPath}" -y "${phpFpmConf}" -g "${pid}"`

      try {
        const res = await serviceStartExec({
          version,
          pidPath: pid,
          baseDir,
          bin,
          execArgs,
          execEnv,
          on
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

  fetchAllOnlineVersion() {
    return new ForkPromise(async (resolve) => {
      try {
        const all: OnlineVersionItem[] = await this._fetchOnlineVersion('php')
        all.forEach((a: any) => {
          const dir = join(global.Server.AppDir!, `static-php-${a.version}`, 'sbin/php-fpm')
          const zip = join(global.Server.Cache!, `static-php-${a.version}.tar.gz`)
          a.appDir = join(global.Server.AppDir!, `static-php-${a.version}`)
          a.zip = zip
          a.bin = dir
          a.downloaded = existsSync(zip)
          a.installed = existsSync(dir)
          a.name = `PHP-${a.version}`
        })
        resolve(all)
      } catch {
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
          await unpack(cliZIP, bin)

          bin = join(row.appDir, 'sbin')
          await mkdirp(bin)
          await unpack(row.zip, bin)

          success = true
        } catch {}
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
                } catch {}
                resolve(false)
              })
              stream.on('finish', async () => {
                try {
                  if (existsSync(row.zip)) {
                    const sbin = join(row.appDir, 'sbin')
                    await mkdirp(sbin)
                    await unpack(row.zip, sbin)
                  }
                } catch {}
                resolve(true)
              })
            })
            .catch((err) => {
              console.log('down error: ', err)
              try {
                if (existsSync(row.zip)) {
                  unlinkSync(row.zip)
                }
              } catch {}
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
                } catch {}
                resolve(false)
              })
              stream.on('finish', async () => {
                try {
                  if (existsSync(cliZIP)) {
                    const bin = join(row.appDir, 'bin')
                    await mkdirp(bin)
                    await unpack(cliZIP, bin)
                  }
                } catch {}
                resolve(true)
              })
            })
            .catch((err) => {
              console.log('down error: ', err)
              try {
                if (existsSync(cliZIP)) {
                  unlinkSync(cliZIP)
                }
              } catch {}
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
            const command = `"${item.bin}" -n -v`
            const reg = /(\s)(\d+(\.\d+){1,4})([-\s])/g
            return TaskQueue.run(versionBinVersion, item.bin, command, reg)
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
        const command = 'brew search -q --formula "/^(php|shivammathur/php/php)@[\\d\\.]+$/"'
        all = await brewSearch(all, command)
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
        `"^php\\d*$"`,
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
