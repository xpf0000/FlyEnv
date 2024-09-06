import { join } from 'path'
import { existsSync } from 'fs'
import { Base } from './Base'
import type { AppHost, SoftInstalled } from '@shared/app'
import { hostAlias, waitTime } from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { readFile, writeFile, mkdirp } from 'fs-extra'
import { I18nT } from '../lang'
import axios from 'axios'
import { compareVersions } from 'compare-versions'
import { execPromiseRoot } from '@shared/Exec'
import { type ChildProcess, spawn } from 'child_process'
import { fixEnv } from '@shared/utils'

class Caddy extends Base {
  constructor() {
    super()
    this.type = 'caddy'
  }

  init() {
    this.pidPath = join(global.Server.BaseDir!, 'caddy/caddy.pid')
  }

  initConfig(): ForkPromise<string> {
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
      await execPromiseRoot([`chmod`, `644`, logFile])
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
    return new ForkPromise(async (resolve, reject) => {
      const bin = version.bin
      await this.#fixVHost()
      const iniFile = await this.initConfig()
      if (existsSync(this.pidPath)) {
        await execPromiseRoot(['rm', '-rf', this.pidPath])
      }
      const env = await fixEnv()
      let child: ChildProcess
      if (global.Server.isAppleSilicon) {
        child = spawn(
          bin,
          ['start', '--config', iniFile, '--pidfile', this.pidPath, '--watch', '&'],
          {
            detached: true,
            stdio: 'ignore',
            env
          }
        )
      } else {
        child = spawn(
          'sudo',
          ['-S', bin, 'start', '--config', iniFile, '--pidfile', this.pidPath, '--watch', '&'],
          {
            detached: true,
            env
          }
        )
      }

      let checking = false
      const checkPid = async (time = 0) => {
        if (existsSync(this.pidPath)) {
          try {
            await execPromiseRoot(['kill', '-9', `${child.pid}`])
          } catch (e) {}
          resolve(true)
        } else {
          if (time < 40) {
            await waitTime(500)
            await checkPid(time + 1)
          } else {
            try {
              await execPromiseRoot(['kill', '-9', `${child.pid}`])
            } catch (e) {}
            reject(new Error(I18nT('fork.startFail')))
          }
        }
      }

      const onPassword = (data: Buffer) => {
        const str = data.toString()
        if (str.startsWith('Password:')) {
          child?.stdin?.write(global.Server.Password!)
          child?.stdin?.write(`\n`)
          return
        }
        if (!checking) {
          checking = true
          checkPid()
        }
      }
      child?.stdout?.on('data', (data: Buffer) => {
        onPassword(data)
      })
      child?.stderr?.on('data', (err: Buffer) => {
        onPassword(err)
      })
      child.on('exit', (err) => {
        console.log('exit: ', err)
        onPassword(Buffer.from(''))
      })
      child.on('close', (code) => {
        console.log('close: ', code)
        onPassword(Buffer.from(''))
      })
    })
  }

  fetchAllOnLineVersion() {
    return new ForkPromise(async (resolve) => {
      try {
        const urls = ['https://api.github.com/repos/caddyserver/caddy/tags?page=1&per_page=1000']
        const fetchVersions = async (url: string) => {
          const all: any = []
          const res = await axios({
            url,
            method: 'get',
            proxy: this.getAxiosProxy()
          })
          const html = res.data
          let arr: any[] = []
          try {
            if (typeof html === 'string') {
              arr = JSON.parse(html)
            } else {
              arr = html
            }
          } catch (e) {}
          const arch = global.Server.Arch === 'x86_64' ? 'amd64' : 'arm64'
          arr.forEach((a) => {
            const version = a.name.replace('v', '')
            const mv = version.split('.').slice(0, 2).join('.')
            const u = `https://github.com/caddyserver/caddy/releases/download/v${version}/caddy_${version}_mac_${arch}.tar.gz`
            const item = {
              url: u,
              version,
              mVersion: mv
            }
            const find = all.find((f: any) => f.mVersion === item.mVersion)
            if (!find) {
              all.push(item)
            } else {
              if (compareVersions(item.version, find.version) > 0) {
                const index = all.indexOf(find)
                all.splice(index, 1, item)
              }
            }
          })
          return all
        }
        const all: any = []
        const res = await Promise.all(urls.map((u) => fetchVersions(u)))
        const list = res.flat()
        list
          .filter((l: any) => compareVersions(l.version, '2.7.0') > 0)
          .forEach((l: any) => {
            const find = all.find((f: any) => f.mVersion === l.mVersion)
            if (!find) {
              all.push(l)
            } else {
              if (compareVersions(l.version, find.version) > 0) {
                const index = all.indexOf(find)
                all.splice(index, 1, l)
              }
            }
          })

        all.sort((a: any, b: any) => {
          return compareVersions(b.version, a.version)
        })
        const dict: any = {}
        all.forEach((a: any) => {
          const dir = join(global.Server.AppDir!, `static-caddy-${a.version}`, 'caddy')
          const zip = join(global.Server.Cache!, `static-caddy-${a.version}.tar.gz`)
          a.appDir = join(global.Server.AppDir!, `static-caddy-${a.version}`)
          a.zip = zip
          a.bin = dir
          a.downloaded = existsSync(zip)
          a.installed = existsSync(dir)
          dict[`caddy-${a.version}`] = a
        })
        resolve(dict)
      } catch (e) {
        resolve({})
      }
    })
  }
}
export default new Caddy()
