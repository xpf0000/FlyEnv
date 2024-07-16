import { join } from 'path'
import { existsSync } from 'fs'
import { Base } from './Base'
import type { AppHost, SoftInstalled } from '@shared/app'
import { execPromise, hostAlias, spawnPromise, waitTime } from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { readFile, writeFile, mkdirp, chmod, remove } from 'fs-extra'
import { I18nT } from '../lang'

class Caddy extends Base {
  constructor() {
    super()
    this.type = 'caddy'
  }

  init() {
    this.pidPath = join(global.Server.BaseDir!, 'caddy/caddy.pid')
  }

  initConfig() {
    return new ForkPromise(async (resolve) => {
      const baseDir = join(global.Server.BaseDir!, 'caddy')
      const iniFile = join(baseDir, 'Caddyfile')
      if (!existsSync(iniFile)) {
        const tmplFile = join(global.Server.Static!, 'tmpl/Caddyfile')
        let content = await readFile(tmplFile, 'utf-8')
        const sslDir = join(baseDir, 'ssl')
        await mkdirp(sslDir)
        const logFile = join(baseDir, 'caddy.log')
        const vhostDir = join(global.Server.BaseDir!, 'vhost/caddy')
        await mkdirp(sslDir)
        content = content
          .replace('##SSL_ROOT##', sslDir)
          .replace('##LOG_FILE##', logFile)
          .replace('##VHOST-DIR##', vhostDir)
        await writeFile(iniFile, content)
        const defaultIniFile = join(baseDir, 'Caddyfile.default')
        await writeFile(defaultIniFile, content)
      }
      resolve(iniFile)
    })
  }

  fixLogPermit() {
    return new ForkPromise(async (resolve) => {
      const baseDir = join(global.Server.BaseDir!, 'caddy')
      const logFile = join(baseDir, 'caddy.log')
      await execPromise(`echo '${global.Server.Password}' | sudo -S chmod 644 ${logFile}`)
      resolve(true)
    })
  }

  async #fixVHost() {
    const hostAll: Array<AppHost> = []
    const hostfile = join(global.Server.BaseDir!, 'host.json')
    const vhostDir = join(global.Server.BaseDir!, 'vhost/caddy')
    try {
      await mkdirp(vhostDir)
      if (existsSync(hostfile)) {
        const json = await readFile(hostfile, 'utf-8')
        const jsonArr = JSON.parse(json)
        hostAll.push(...jsonArr)
      }
    } catch (e) {}

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
        .replace('##LOG-PATH##', logFile)
        .replace('##ROOT##', root)
        .replace('##PHP-VERSION##', `${phpv}`)
      contentList.push(content)

      if (host.useSSL) {
        let tls = 'internal'
        if (host.ssl.cert && host.ssl.key) {
          tls = `${host.ssl.cert} ${host.ssl.key}`
        }
        const httpHostNameAll = httpsNames.join(',\n')
        const content = tmplSSLContent
          .replace('##HOST-ALL##', httpHostNameAll)
          .replace('##LOG-PATH##', logFile)
          .replace('##SSL##', tls)
          .replace('##ROOT##', root)
          .replace('##PHP-VERSION##', `${phpv}`)
        contentList.push(content)
      }
      await writeFile(confFile, contentList.join('\n'))
    }
  }

  _startServer(version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject, on) => {
      const bin = version.bin
      await this.#fixVHost()
      const iniFile = await this.initConfig()
      const shFile = join(global.Server.BaseDir!, 'caddy/caddy.sh')
      const command = `#!/usr/bin/bash\necho '${global.Server.Password}' | sudo -S ${bin} start --config ${iniFile} --pidfile ${this.pidPath} --watch`
      await writeFile(shFile, command)
      await chmod(shFile, '0777')
      if (existsSync(this.pidPath)) {
        await remove(this.pidPath)
      }
      const checkPid = async (time = 0) => {
        if (existsSync(this.pidPath)) {
          resolve(true)
        } else {
          if (time < 40) {
            await waitTime(500)
            await checkPid(time + 1)
          } else {
            reject(new Error(I18nT('fork.startFail')))
          }
        }
      }
      try {
        spawnPromise('bash', [shFile], {
          detached: true,
          stdio: 'ignore'
        })
          .on(on)
          .then(() => {
            checkPid()
          })
          .catch(reject)
      } catch (e: any) {
        reject(e)
      }
    })
  }
}
export default new Caddy()
