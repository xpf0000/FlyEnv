import { join, basename, dirname } from 'path'
import { existsSync } from 'fs'
import { Base } from './Base'
import { I18nT } from '@lang/index'
import type { AppHost, OnlineVersionItem, SoftInstalled } from '@shared/app'
import {
  AppLog,
  execPromise,
  getAllFileAsync,
  spawnPromise,
  versionBinVersion,
  versionFilterSame,
  versionFixed,
  versionInitedApp,
  versionLocalFetch,
  versionSort
} from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { mkdirp, readFile, remove, writeFile } from 'fs-extra'
import TaskQueue from '../TaskQueue'
import { fetchHostList } from './host/HostFile'

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
      const defaultFile = join(global.Server.ApacheDir!, `${version.version}.conf`)
      const defaultFileBack = join(global.Server.ApacheDir!, `${version.version}.default.conf`)
      const bin = version.bin
      if (existsSync(defaultFile)) {
        let content = await readFile(defaultFile, 'utf-8')
        let srvroot = ''
        const reg = new RegExp('(Define SRVROOT ")([\\s\\S]*?)(")', 'g')
        try {
          srvroot = reg?.exec?.(content)?.[2] ?? ''
        } catch (e) {}
        if (srvroot) {
          const srvrootReplace = version.path.split('\\').join('/')
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
      // 获取httpd的默认配置文件路径
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
      } catch (e) {}
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
        reject(new Error(I18nT('fork.confNoFound')))
        return
      }
      let content = await readFile(file, 'utf-8')

      reg = new RegExp('(CustomLog ")([\\s\\S]*?)(")', 'g')
      let logPath = ''
      try {
        logPath = reg?.exec?.(content)?.[2] ?? ''
      } catch (e) {}
      logPath = logPath.trim()

      reg = new RegExp('(ErrorLog ")([\\s\\S]*?)(")', 'g')
      let errLogPath = ''
      try {
        errLogPath = reg?.exec?.(content)?.[2] ?? ''
      } catch (e) {}
      errLogPath = errLogPath.trim()

      let srvroot = ''
      reg = new RegExp('(Define SRVROOT ")([\\s\\S]*?)(")', 'g')
      try {
        srvroot = reg?.exec?.(content)?.[2] ?? ''
      } catch (e) {}

      content = content
        .replace('#LoadModule deflate_module', 'LoadModule deflate_module')
        .replace('#LoadModule deflate_module', 'LoadModule deflate_module')
        .replace('#LoadModule proxy_module', 'LoadModule proxy_module')
        .replace('#LoadModule proxy_fcgi_module', 'LoadModule proxy_fcgi_module')
        .replace('#LoadModule ssl_module', 'LoadModule ssl_module')
        .replace('#LoadModule access_compat_module', 'LoadModule access_compat_module')
        .replace('#LoadModule rewrite_module modules', 'LoadModule rewrite_module modules')
        .replace('#ServerName www.', 'ServerName www.')

      if (logPath) {
        const logPathReplace = join(global.Server.ApacheDir!, `${version.version}.access.log`)
          .split('\\')
          .join('/')
        content = content.replace(`CustomLog "${logPath}"`, `CustomLog "${logPathReplace}"`)
      }

      if (errLogPath) {
        const errLogPathReplace = join(global.Server.ApacheDir!, `${version.version}.error.log`)
          .split('\\')
          .join('/')
        content = content.replace(`ErrorLog "${errLogPath}"`, `ErrorLog "${errLogPathReplace}"`)
      }

      if (srvroot) {
        const srvrootReplace = version.path.split('\\').join('/')
        content = content.replace(
          `Define SRVROOT "${srvroot}"`,
          `Define SRVROOT "${srvrootReplace}"`
        )
      }

      let find = content.match(/\nUser _www(.*?)\n/g)
      content = content.replace(find?.[0] ?? '###@@@&&&', '\n#User _www\n')
      find = content.match(/\nGroup _www(.*?)\n/g)
      content = content.replace(find?.[0] ?? '###@@@&&&', '\n#Group _www\n')

      const pidPath = join(global.Server.ApacheDir!, 'httpd.pid').split('\\').join('/')
      let vhost = join(global.Server.BaseDir!, 'vhost/apache/')
      await mkdirp(vhost)
      vhost = vhost.split('\\').join('/')

      content += `\nPidFile "${pidPath}"
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
    let host: Array<AppHost> = []
    try {
      host = await fetchHostList()
    } catch (e) {}
    if (host.length === 0) {
      return
    }
    const allNeedPort: Set<number> = new Set([80])
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
    const regex = /([\s\n]?[^\n]*)Listen\s+\d+(.*?)([^\n])(\n|$)/g
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
    const configpath = join(global.Server.ApacheDir!, `${version.version}.conf`)
    let confContent = await readFile(configpath, 'utf-8')
    regex.lastIndex = 0
    if (regex.test(confContent)) {
      regex.lastIndex = 0
      confContent = confContent.replace(regex, '\n').replace(/\n+/g, '\n').trim()
    }
    confContent = confContent
      .replace(/#PhpWebStudy-Apache-Listen-Begin#([\s\S]*?)#PhpWebStudy-Apache-Listen-End#/g, '')
      .replace(/\n+/g, '\n')
      .trim()
    const txts: Array<string> = Array.from(allNeedPort).map((s) => `Listen ${s}`)
    txts.unshift('#PhpWebStudy-Apache-Listen-Begin#')
    txts.push('#PhpWebStudy-Apache-Listen-End#')
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
      await this.initLocalApp(version, 'apache').on(on)
      await this.#resetConf(version).on(on)
      on({
        'APP-On-Log': AppLog('info', I18nT('appLog.apachePortHandleBegin'))
      })
      await this.#handleListenPort(version)
      on({
        'APP-On-Log': AppLog('info', I18nT('appLog.apachePortHandleEnd'))
      })
      const bin = version.bin
      if (!existsSync(bin)) {
        on({
          'APP-On-Log': AppLog('error', I18nT('fork.binNoFound'))
        })
        reject(new Error(I18nT('fork.binNoFound')))
        return
      }
      const conf = join(global.Server.ApacheDir!, `${version.version}.conf`)
      if (!existsSync(conf)) {
        on({
          'APP-On-Log': AppLog('error', I18nT('fork.confNoFound'))
        })
        reject(new Error(I18nT('fork.confNoFound')))
        return
      }

      const pidPath = join(global.Server.ApacheDir!, 'httpd.pid')
      if (existsSync(pidPath)) {
        try {
          await remove(pidPath)
        } catch (e) {}
      }

      const appPidFile = join(global.Server.BaseDir!, `pid/${this.type}.pid`)
      await mkdirp(dirname(appPidFile))
      if (existsSync(appPidFile)) {
        try {
          await remove(appPidFile)
        } catch (e) {}
      }

      const outFile = join(global.Server.ApacheDir!, 'start.out.log')
      const errFile = join(global.Server.ApacheDir!, 'start.error.log')

      const execArgs = `-f \`"${conf}\`"`

      let psScript = await readFile(join(global.Server.Static!, 'sh/flyenv-async-exec.ps1'), 'utf8')

      psScript = psScript
        .replace('#BIN#', bin)
        .replace('#ARGS#', execArgs)
        .replace('#OUTLOG#', outFile)
        .replace('#ERRLOG#', errFile)

      const psName = `start.ps1`
      const psPath = join(global.Server.ApacheDir!, psName)
      await writeFile(psPath, psScript)

      on({
        'APP-On-Log': AppLog('info', I18nT('appLog.execStartCommand'))
      })
      process.chdir(global.Server.ApacheDir!)
      try {
        await spawnPromise(
          'powershell.exe',
          [
            '-NoProfile',
            '-ExecutionPolicy',
            'Bypass',
            '-Command',
            `"Unblock-File -LiteralPath './${psName}'; & './${psName}'"`
          ],
          {
            shell: 'powershell.exe'
          }
        )
      } catch (e: any) {
        console.log('-k start err: ', e)
        on({
          'APP-On-Log': AppLog(
            'error',
            I18nT('appLog.execStartCommandFail', { error: e, service: `apache-${version.version}` })
          )
        })
        reject(e)
        return
      }
      on({
        'APP-On-Log': AppLog('info', I18nT('appLog.execStartCommandSuccess'))
      })
      on({
        'APP-Service-Start-Success': true
      })
      const res = await this.waitPidFile(pidPath)
      if (res) {
        if (res?.pid) {
          await writeFile(appPidFile, res.pid)
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
            I18nT('appLog.startServiceFail', {
              error: res?.error ?? 'Start Fail',
              service: `apache-${version.version}`
            })
          )
        })
        reject(new Error(res?.error ?? 'Start Fail'))
        return
      }
      let msg = 'Start Fail'
      if (existsSync(errFile)) {
        msg = (await readFile(errFile, 'utf-8')) || 'Start Fail'
      }
      on({
        'APP-On-Log': AppLog(
          'error',
          I18nT('appLog.startServiceFail', { error: msg, service: `apache-${version.version}` })
        )
      })
      reject(new Error(msg))
    })
  }

  fetchAllOnLineVersion() {
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
      } catch (e) {
        resolve([])
      }
    })
  }

  allInstalledVersions(setup: any) {
    return new ForkPromise((resolve) => {
      let versions: SoftInstalled[] = []
      Promise.all([versionLocalFetch(setup?.apache?.dirs ?? [], 'httpd.exe')])
        .then(async (list) => {
          versions = list.flat()
          versions = versionFilterSame(versions)
          const all = versions.map((item) => {
            const command = `${basename(item.bin)} -v`
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
          const appInited = await versionInitedApp('apache', 'bin/httpd.exe')
          versions.push(...appInited.filter((a) => !versions.find((v) => v.bin === a.bin)))
          resolve(versionSort(versions))
        })
        .catch(() => {
          resolve([])
        })
    })
  }
}

export default new Apache()
