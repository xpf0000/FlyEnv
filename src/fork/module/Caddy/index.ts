import { join } from 'path'
import { existsSync } from 'fs'
import { Base } from '../Base'
import type { AppHost, OnlineVersionItem, SoftInstalled } from '@shared/app'
import {
  AppLog,
  brewInfoJson,
  hostAlias,
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
  serviceStartExecCMD,
  versionBinVersionSync
} from '../../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { I18nT } from '@lang/index'
import TaskQueue from '../../TaskQueue'
import { fetchHostList } from '../Host/HostFile'
import Helper from '../../Helper'
import { isLinux, isWindows, pathFixedToUnix } from '@shared/utils'

class Caddy extends Base {
  constructor() {
    super()
    this.type = 'caddy'
  }

  init() {
    this.pidPath = join(global.Server.BaseDir!, 'caddy/caddy.pid')
  }

  initConfig(): ForkPromise<string> {
    return new ForkPromise(async (resolve, reject, on) => {
      const baseDir = join(global.Server.BaseDir!, 'caddy')
      const iniFile = join(baseDir, 'Caddyfile')
      if (!existsSync(iniFile)) {
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.confInit'))
        })
        const tmplFile = join(global.Server.Static!, 'tmpl/Caddyfile')
        let content = await readFile(tmplFile, 'utf-8')
        const sslDir = join(baseDir, 'ssl')
        await mkdirp(sslDir)
        const logFile = join(baseDir, 'caddy.log')
        const vhostDir = join(global.Server.BaseDir!, 'vhost/caddy')
        await mkdirp(sslDir)
        content = content
          .replace('##SSL_ROOT##', pathFixedToUnix(sslDir))
          .replace('##LOG_FILE##', pathFixedToUnix(logFile))
          .replace('##VHOST-DIR##', pathFixedToUnix(vhostDir))
        await writeFile(iniFile, content)
        const defaultIniFile = join(baseDir, 'Caddyfile.default')
        await writeFile(defaultIniFile, content)
        on({
          'APP-On-Log': AppLog('info', I18nT('appLog.confInitSuccess', { file: iniFile }))
        })
      }
      resolve(iniFile)
    })
  }

  async #fixVHost() {
    let hostAll: Array<AppHost> = []
    const vhostDir = join(global.Server.BaseDir!, 'vhost/caddy')
    try {
      hostAll = await fetchHostList()
    } catch {}
    hostAll = hostAll.filter((h) => !h.type || h.type === 'php')
    await mkdirp(vhostDir)
    let tmplContent = ''
    let tmplSSLContent = ''
    for (const host of hostAll) {
      const name = host.name
      const confFile = join(vhostDir, `${name}.conf`)
      if (existsSync(confFile)) {
        continue
      }
      if (!tmplContent) {
        const tmplFile = join(global.Server.Static!, 'tmpl/CaddyfileVhost')
        tmplContent = await readFile(tmplFile, 'utf-8')
      }
      if (!tmplSSLContent) {
        const tmplFile = join(global.Server.Static!, 'tmpl/CaddyfileVhostSSL')
        tmplSSLContent = await readFile(tmplFile, 'utf-8')
      }
      const httpNames: string[] = []
      const httpsNames: string[] = []
      hostAlias(host).forEach((h) => {
        if (!host?.port?.caddy || host.port.caddy === 80) {
          httpNames.push(`http://${h}`)
        } else {
          httpNames.push(`http://${h}:${host.port.caddy}`)
        }
        if (host.useSSL) {
          httpsNames.push(`https://${h}:${host?.port?.caddy_ssl ?? 443}`)
        }
      })

      const contentList: string[] = []

      const hostName = host.name
      const root = host.root
      const phpv = host.phpVersion
      const logFile = join(global.Server.BaseDir!, `vhost/logs/${hostName}.caddy.log`)

      const httpHostNameAll = httpNames.join(',\n')
      const content = tmplContent
        .replace('##HOST-ALL##', httpHostNameAll)
        .replace('##LOG-PATH##', pathFixedToUnix(logFile))
        .replace('##ROOT##', pathFixedToUnix(root))
        .replace('##PHP-VERSION##', `${phpv}`)
      contentList.push(content)

      if (host.useSSL) {
        let tls = 'internal'
        if (host.ssl.cert && host.ssl.key) {
          tls = `${pathFixedToUnix(host.ssl.cert)} ${pathFixedToUnix(host.ssl.key)}`
        }
        const httpHostNameAll = httpsNames.join(',\n')
        const content = tmplSSLContent
          .replace('##HOST-ALL##', httpHostNameAll)
          .replace('##LOG-PATH##', pathFixedToUnix(logFile))
          .replace('##SSL##', tls)
          .replace('##ROOT##', pathFixedToUnix(root))
          .replace('##PHP-VERSION##', `${phpv}`)
        contentList.push(content)
      }
      await writeFile(confFile, contentList.join('\n'))
    }
  }

  _startServer(version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject, on) => {
      on({
        'APP-On-Log': AppLog(
          'info',
          I18nT('appLog.startServiceBegin', { service: `caddy-${version.version}` })
        )
      })

      await this.#fixVHost()
      const iniFile = await this.initConfig().on(on)

      if (!isWindows()) {
        const sslDir = join(global.Server.BaseDir!, 'caddy/ssl')
        await Helper.send('caddy', 'sslDirFixed', sslDir)
      }

      const bin = version.bin
      const baseDir = join(global.Server.BaseDir!, 'caddy')
      await mkdirp(baseDir)

      if (isWindows()) {
        const execArgs = `start --config "${iniFile}" --pidfile "${this.pidPath}" --watch`
        try {
          const res = await serviceStartExecCMD({
            version,
            pidPath: this.pidPath,
            baseDir,
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
        const execEnv = ``
        const execArgs = `start --config "${iniFile}" --pidfile "${this.pidPath}" --watch`
        try {
          const res = await serviceStartExec({
            root: isLinux(),
            version,
            pidPath: this.pidPath,
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
        const all: OnlineVersionItem[] = await this._fetchOnlineVersion('caddy')
        all.forEach((a: any) => {
          let dir = ''
          let zip = ''
          if (isWindows()) {
            dir = join(global.Server.AppDir!, `caddy-${a.version}`, 'caddy.exe')
            zip = join(global.Server.Cache!, `caddy-${a.version}.zip`)
            a.appDir = join(global.Server.AppDir!, `caddy-${a.version}`)
          } else {
            dir = join(global.Server.AppDir!, `static-caddy-${a.version}`, 'caddy')
            zip = join(global.Server.Cache!, `static-caddy-${a.version}.tar.gz`)
            a.appDir = join(global.Server.AppDir!, `static-caddy-${a.version}`)
          }
          a.zip = zip
          a.bin = dir
          a.downloaded = existsSync(zip)
          a.installed = existsSync(dir)
          a.name = `Caddy-${a.version}`
        })
        resolve(all)
      } catch {
        resolve({})
      }
    })
  }

  allInstalledVersions(setup: any) {
    return new ForkPromise((resolve) => {
      let versions: SoftInstalled[] = []
      let all: Promise<SoftInstalled[]>[] = []
      if (isWindows()) {
        all = [versionLocalFetch(setup?.caddy?.dirs ?? [], 'caddy.exe')]
      } else {
        all = [versionLocalFetch(setup?.caddy?.dirs ?? [], 'caddy', 'caddy')]
      }
      Promise.all(all)
        .then(async (list) => {
          versions = list.flat()
          versions = versionFilterSame(versions)
          const all = versions.map((item) => {
            const command = `"${item.bin}" version`
            const reg = /(v)(\d+(\.\d+){1,4})(.*?)/g
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
        const all = ['caddy']
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
        `"^caddy\\d*$"`,
        (f) => {
          return (
            f.includes('www') && f.includes('Fast, multi-platform web server with automatic HTTPS')
          )
        },
        (name, version) => {
          const bin = join('/opt/local/bin/', name)
          let is = existsSync(bin)
          if (is) {
            const command = `"${bin}" version`
            const reg = /(v)(\d+(\.\d+){1,4})(.*?)/g
            const v = versionBinVersionSync(bin, command, reg)
            console.log('portinfo true v: ', v)
            is = v === version
          }
          return is
        }
      )
      resolve(Info)
    })
  }
}
export default new Caddy()
