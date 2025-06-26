import { dirname, join, basename } from 'path'
import { existsSync } from 'fs'
import { Base } from './Base'
import { I18nT } from '@lang/index'
import type { AppHost, OnlineVersionItem, SoftInstalled } from '@shared/app'
import {
  AppLog,
  brewInfoJson,
  execPromise,
  getAllFileAsync,
  md5,
  portSearch,
  serviceStartExec,
  versionBinVersion,
  versionFilterSame,
  versionFixed,
  versionLocalFetch,
  versionSort,
  readFile,
  writeFile,
  mkdirp,
  serviceStartExecCMD
} from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import TaskQueue from '../TaskQueue'
import { fetchHostList } from './host/HostFile'
import { isMacOS, isWindows, pathFixedToUnix } from '@shared/utils'

class Apache extends Base {
  constructor() {
    super()
    this.type = 'apache'
  }

  init() {
    this.pidPath = join(global.Server.ApacheDir!, 'httpd.pid')
  }

  #resetConf(version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject, on) => {
      let defaultFile = ''
      let defaultFileBack = ''
      if (isMacOS()) {
        defaultFile = join(global.Server.ApacheDir!, `common/conf/${md5(version.bin)}.conf`)
        defaultFileBack = join(
          global.Server.ApacheDir!,
          `common/conf/${md5(version.bin)}.default.conf`
        )
      } else if (isWindows()) {
        defaultFile = join(global.Server.ApacheDir!, `${version.version}.conf`)
        defaultFileBack = join(global.Server.ApacheDir!, `${version.version}.default.conf`)
      }

      const logs = join(global.Server.ApacheDir!, 'common/logs')
      await mkdirp(logs)
      const bin = version.bin
      if (existsSync(defaultFile)) {
        let content = await readFile(defaultFile, 'utf-8')
        let srvroot = ''
        const reg = new RegExp('(Define SRVROOT ")([\\s\\S]*?)(")', 'g')
        try {
          srvroot = reg?.exec?.(content)?.[2] ?? ''
        } catch {}
        if (srvroot) {
          const srvrootReplace = pathFixedToUnix(version.path)
          if (srvroot !== srvrootReplace) {
            content = content.replace(
              `Define SRVROOT "${srvroot}"`,
              `Define SRVROOT "${srvrootReplace}"`
            )
          }
          await writeFile(defaultFile, content)
          await writeFile(defaultFileBack, content)
        }
        resolve(true)
        return
      }
      on({
        'APP-On-Log': AppLog('info', I18nT('appLog.confInit'))
      })
      // Get the default configuration file path for httpd
      let str = ''
      try {
        const res = await execPromise(`${basename(bin)} -V`, {
          cwd: dirname(bin)
        })
        str = res?.stdout?.toString() ?? ''
      } catch (e: any) {
        on({
          'APP-On-Log': AppLog('error', I18nT('appLog.confInitFail', { error: e }))
        })
        reject(new Error(I18nT('fork.apacheLogPathErr')))
        return
      }
      console.log('resetConf: ', str)

      let reg = new RegExp('(SERVER_CONFIG_FILE=")([\\s\\S]*?)(")', 'g')
      let file = ''
      try {
        file = reg?.exec?.(str)?.[2] ?? ''
      } catch {}
      file = file.trim()
      file = join(version.path, file)

      console.log('file: ', file)

      if (!file || !existsSync(file)) {
        on({
          'APP-On-Log': AppLog(
            'error',
            I18nT('appLog.confInitFail', { error: I18nT('appLog.confInitFail') })
          )
        })
        reject(new Error(I18nT('fork.confNotFound')))
        return
      }

      let content = await readFile(file, 'utf-8')

      reg = new RegExp('(CustomLog ")([\\s\\S]*?)(")', 'g')
      let logPath = ''
      try {
        logPath = reg?.exec?.(content)?.[2] ?? ''
      } catch {}
      logPath = logPath.trim()

      reg = new RegExp('(ErrorLog ")([\\s\\S]*?)(")', 'g')
      let errLogPath = ''
      try {
        errLogPath = reg?.exec?.(content)?.[2] ?? ''
      } catch {}
      errLogPath = errLogPath.trim()

      let srvroot = ''
      reg = new RegExp('(Define SRVROOT ")([\\s\\S]*?)(")', 'g')
      try {
        srvroot = reg?.exec?.(content)?.[2] ?? ''
      } catch {}

      /**
       * LoadModule headers_module modules/mod_headers.so
       */
      content = content
        .replace('#LoadModule headers_module', 'LoadModule headers_module')
        .replace('#LoadModule deflate_module', 'LoadModule deflate_module')
        .replace('#LoadModule proxy_module', 'LoadModule proxy_module')
        .replace('#LoadModule proxy_fcgi_module', 'LoadModule proxy_fcgi_module')
        .replace('#LoadModule ssl_module', 'LoadModule ssl_module')
        .replace('#LoadModule access_compat_module', 'LoadModule access_compat_module')
        .replace('#LoadModule rewrite_module modules', 'LoadModule rewrite_module modules')
        .replace('#ServerName www.', 'ServerName www.')

      if (logPath) {
        let logPathReplace = ''
        if (isMacOS()) {
          logPathReplace = join(window.Server.ApacheDir, `common/logs/access.log`)
        } else if (isWindows()) {
          logPathReplace = pathFixedToUnix(
            join(global.Server.ApacheDir!, `${version.version}.access.log`)
          )
        }
        content = content.replace(`CustomLog "${logPath}"`, `CustomLog "${logPathReplace}"`)
      }

      if (errLogPath) {
        let errLogPathReplace = ''
        if (isMacOS()) {
          errLogPathReplace = join(window.Server.ApacheDir, `common/logs/error.log`)
        } else if (isWindows()) {
          errLogPathReplace = pathFixedToUnix(
            join(global.Server.ApacheDir!, `${version.version}.error.log`)
          )
        }
        content = content.replace(`ErrorLog "${errLogPath}"`, `ErrorLog "${errLogPathReplace}"`)
      }

      if (srvroot) {
        const srvrootReplace = pathFixedToUnix(version.path)
        content = content.replace(
          `Define SRVROOT "${srvroot}"`,
          `Define SRVROOT "${srvrootReplace}"`
        )
      }

      let find = content.match(/\nUser _www(.*?)\n/g)
      content = content.replace(find?.[0] ?? '###@@@&&&', '\n#User _www\n')
      find = content.match(/\nGroup _www(.*?)\n/g)
      content = content.replace(find?.[0] ?? '###@@@&&&', '\n#Group _www\n')

      const pidFile = pathFixedToUnix(join(global.Server.ApacheDir!, 'httpd.pid'))
      let vhost = join(global.Server.BaseDir!, 'vhost/apache/')
      await mkdirp(vhost)
      vhost = pathFixedToUnix(vhost)

      content += `\nPidFile "${pidFile}"
IncludeOptional "${vhost}*.conf"`

      await writeFile(defaultFile, content)
      await writeFile(defaultFileBack, content)

      on({
        'APP-On-Log': AppLog('info', I18nT('appLog.confInitSuccess', { file: defaultFile }))
      })
      resolve(true)
    })
  }

  async #handleListenPort(version: SoftInstalled) {
    let lsal: any = await execPromise(`ls -al`, {
      cwd: global.Server.BaseDir
    })
    lsal = lsal.stdout
      .split('\n')
      .filter((s: string) => s.includes('..'))
      .pop()
      .split(' ')
      .filter((s: string) => !!s.trim())
      .map((s: string) => s.trim())
    console.log('lsal: ', lsal)
    const user = lsal[2]
    const group = lsal[3]

    let host: Array<AppHost> = []
    try {
      host = await fetchHostList()
    } catch {}
    if (host.length === 0) {
      return
    }
    const allNeedPort: Set<number> = new Set()
    host.forEach((h) => {
      const apache = Number(h?.port?.apache)
      const apache_ssl = Number(h?.port?.apache_ssl)
      if (apache && !isNaN(apache)) {
        allNeedPort.add(apache)
      }
      if (apache_ssl && !isNaN(apache_ssl)) {
        allNeedPort.add(apache_ssl)
      }
    })
    const portRegex = /<VirtualHost\s+\*:(\d+)>/g
    let regex = /([\s\n]?[^\n]*)Listen\s+\d+(.*?)([^\n])(\n|$)/g
    const allVhostFile = await getAllFileAsync(join(global.Server.BaseDir!, 'vhost/apache'))
    for (const file of allVhostFile) {
      portRegex.lastIndex = 0
      regex.lastIndex = 0
      let content = await readFile(file, 'utf-8')
      if (regex.test(content)) {
        regex.lastIndex = 0
        content = content.replace(regex, '\n').replace(/\n+/g, '\n').trim()
        await writeFile(file, content)
      }
      let m
      while ((m = portRegex.exec(content)) !== null) {
        if (m && m.length > 1) {
          const port = Number(m[1])
          if (port && !isNaN(port)) {
            allNeedPort.add(port)
          }
        }
      }
    }
    console.log('allNeedPort: ', allNeedPort)
    let configpath = ''
    if (isWindows()) {
      configpath = join(global.Server.ApacheDir!, `${version.version}.conf`)
    } else if (isMacOS()) {
      configpath = join(global.Server.ApacheDir!, `common/conf/${md5(version.bin)}.conf`)
    }
    let confContent = await readFile(configpath, 'utf-8')
    regex.lastIndex = 0
    if (regex.test(confContent)) {
      regex.lastIndex = 0
      confContent = confContent.replace(regex, '\n').replace(/\n+/g, '\n').trim()
    }

    regex = /([\s\n#]?[^\n]*)User\s+(.*?)([^\n])(\n|$)/g
    console.log('confContent.match(regex): ', confContent.match(regex))
    confContent = confContent.replace(regex, `\n\n`)

    regex = /([\s\n#]?[^\n]*)Group\s+(.*?)([^\n])(\n|$)/g
    console.log('confContent.match(regex): ', confContent.match(regex))
    confContent = confContent.replace(regex, `\n\n`).replace(/\n+/g, '\n').trim()

    confContent = confContent
      .replace(/#PhpWebStudy-Apache-Listen-Begin#([\s\S]*?)#PhpWebStudy-Apache-Listen-End#/g, '')
      .replace(/#FlyEnv-Apache-Listen-Begin#([\s\S]*?)#FlyEnv-Apache-Listen-End#/g, '')
      .replace(/\n+/g, '\n')
      .trim()
    const txts: Array<string> = Array.from(allNeedPort).map((s) => `Listen ${s}`)
    txts.unshift('#FlyEnv-Apache-Listen-Begin#')
    txts.push(`User ${user}`)
    txts.push(`Group ${group}`)
    txts.push('#FlyEnv-Apache-Listen-End#')
    confContent = txts.join('\n') + '\n' + confContent

    await writeFile(configpath, confContent)
  }

  _startServer(version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject, on) => {
      on({
        'APP-On-Log': AppLog(
          'info',
          I18nT('appLog.startServiceBegin', { service: `apache-${version.version}` })
        )
      })
      await this.#resetConf(version).on(on)
      on({
        'APP-On-Log': AppLog('info', I18nT('appLog.apachePortHandleBegin'))
      })
      await this.#handleListenPort(version)
      on({
        'APP-On-Log': AppLog('info', I18nT('appLog.apachePortHandleEnd'))
      })

      let conf = ''
      if (isMacOS()) {
        conf = join(global.Server.ApacheDir!, `common/conf/${md5(version.bin)}.conf`)
      } else if (isWindows()) {
        conf = join(global.Server.ApacheDir!, `${version.version}.conf`)
      }

      if (!existsSync(conf)) {
        on({
          'APP-On-Log': AppLog('error', I18nT('fork.confNotFound'))
        })
        reject(new Error(I18nT('fork.confNotFound')))
        return
      }

      const pidFile = join(global.Server.ApacheDir!, 'httpd.pid')
      const bin = version.bin
      if (isWindows()) {
        const execArgs = `-f "${conf}"`
        try {
          const res = await serviceStartExecCMD({
            version,
            pidPath: pidFile,
            baseDir: global.Server.ApacheDir!,
            bin,
            execArgs,
            execEnv: '',
            on
          })
          resolve(res)
        } catch (e: any) {
          console.log('-k start err: ', e)
          reject(e)
          return
        }
      } else {
        const logFile = join(window.Server.ApacheDir, `common/logs/access.log`)
        const baseDir = global.Server.ApacheDir!
        const execEnv = ``
        const execArgs = `-f "${conf}" -c "PidFile \"${pidFile}\"" -c "CustomLog \"${logFile}\" common" -k start`

        try {
          const res = await serviceStartExec({
            version,
            pidPath: pidFile,
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
      }
    })
  }

  fetchAllOnlineVersion() {
    return new ForkPromise(async (resolve) => {
      try {
        const all: OnlineVersionItem[] = await this._fetchOnlineVersion('apache')
        all.forEach((a: any) => {
          const subDir = `Apache${a.mVersion.split('.').join('')}`
          const dir = join(global.Server.AppDir!, `apache-${a.version}`, subDir, 'bin/httpd.exe')
          const zip = join(global.Server.Cache!, `apache-${a.version}.zip`)
          a.appDir = join(global.Server.AppDir!, `apache-${a.version}`)
          a.zip = zip
          a.bin = dir
          a.downloaded = existsSync(zip)
          a.installed = existsSync(dir)
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
      let all: Promise<SoftInstalled[]>[] = []
      if (isMacOS()) {
        all = [versionLocalFetch(setup?.apache?.dirs ?? [], 'apachectl', 'httpd')]
      } else if (isWindows()) {
        all = [versionLocalFetch(setup?.apache?.dirs ?? [], 'httpd.exe')]
      }
      Promise.all(all)
        .then(async (list) => {
          versions = list.flat()
          versions = versionFilterSame(versions)
          const all = versions.map((item) => {
            const command = `"${item.bin}" -v`
            const reg = /(Apache\/)(\d+(\.\d+){1,4})( )/g
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

  brewinfo() {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const all = ['httpd']
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
        `^apache\\d*$`,
        (f) => {
          return f.includes('The extremely popular second version of the Apache http server')
        },
        () => {
          return existsSync(join('/opt/local/sbin/', 'apachectl'))
        }
      )
      resolve(Info)
    })
  }
}

export default new Apache()
