import { join, dirname, basename } from 'path'
import { existsSync } from 'fs'
import { Base } from './Base'
import type { AppHost, SoftInstalled } from '@shared/app'
import { execPromiseRoot, hostAlias, waitTime } from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { readFile, writeFile, mkdirp, chmod, unlink } from 'fs-extra'
import { zipUnPack } from '@shared/file'
import axios from 'axios'
import { compareVersions } from 'compare-versions'

class Caddy extends Base {
  constructor() {
    super()
    this.type = 'caddy'
  }

  init() {
    this.pidPath = join(global.Server.BaseDir!, 'caddy/caddy.pid')
  }

  #initLocalApp(version: SoftInstalled) {
    return new Promise((resolve, reject) => {
      console.log('initLocalApp: ', version.bin, global.Server.AppDir)
      if (!existsSync(version.bin) && version.bin.includes(join(global.Server.AppDir!, `caddy-${version.version}`))) {
        zipUnPack(join(global.Server.Static!, `zip/caddy-${version.version}.7z`), global.Server.AppDir!)
          .then(resolve)
          .catch((err: any) => {
            console.log('initLocalApp err: ', err)
            reject(err)
          })
        return
      }
      resolve(true)
    })
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
          .replace('##SSL_ROOT##', sslDir.split('\\').join('/'))
          .replace('##LOG_FILE##', logFile.split('\\').join('/'))
          .replace('##VHOST-DIR##', vhostDir.split('\\').join('/'))
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
      await chmod(logFile, 0o644)
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
    } catch (e) { }

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
        .replace('##LOG-PATH##', logFile.split('\\').join('/'))
        .replace('##ROOT##', root.split('\\').join('/'))
        .replace('##PHP-VERSION##', `${phpv}`)
      contentList.push(content)

      if (host.useSSL) {
        let tls = 'internal'
        if (host.ssl.cert && host.ssl.key) {
          tls = `"${host.ssl.cert}" "${host.ssl.key}"`
        }
        const httpHostNameAll = httpsNames.join(',\n')
        const content = tmplSSLContent
          .replace('##HOST-ALL##', httpHostNameAll)
          .replace('##LOG-PATH##', logFile.split('\\').join('/'))
          .replace('##SSL##', tls.split('\\').join('/'))
          .replace('##ROOT##', root.split('\\').join('/'))
          .replace('##PHP-VERSION##', `${phpv}`)
        contentList.push(content)
      }
      await writeFile(confFile, contentList.join('\n'))
    }
  }

  _startServer(version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject, on) => {
      await this.#initLocalApp(version)
      const bin = version.bin
      await this.#fixVHost()
      const iniFile = await this.initConfig()

      try {
        if (existsSync(this.pidPath)) {
          await unlink(this.pidPath)
        }
      } catch (e) { }

      const waitPid = async (time = 0): Promise<boolean> => {
        let res = false
        if (existsSync(this.pidPath)) {
          res = true
        } else {
          if (time < 40) {
            await waitTime(500)
            res = res || await waitPid(time + 1)
          } else {
            res = false
          }
        }
        console.log('waitPid: ', time, res)
        return res
      }

      try {
        process.chdir(dirname(bin));
        console.log(`新的工作目录: ${process.cwd()}`);
      } catch (err) {
        console.error(`改变工作目录失败: ${err}`);
      }

      const command = `start /b ./${basename(bin)} start --config "${iniFile}" --pidfile "${this.pidPath}" --watch`
      console.log('command: ', command)

      try {
        const res = await execPromiseRoot(command)
        console.log('start res: ', res)
        on(res.stdout)
        const check = await waitPid()
        if (check) {
          resolve(0)
        } else {
          reject(new Error('Start failed'))
        }
      } catch (e: any) {
        reject(e)
      }

    })
  }

  fetchAllOnLineVersion() {
    return new ForkPromise(async (resolve) => {
      try {
        const urls = [
          'https://api.github.com/repos/caddyserver/caddy/tags?page=1&per_page=1000',
        ]
        const fetchVersions = async (url: string) => {
          const all: any = []
          const res = await axios({
            url,
            method: 'get'
          })
          const html = res.data
          let arr: any[] = []
          try {
            if (typeof html === 'string') {
              arr = JSON.parse(html)
            } else {
              arr = html
            }
          } catch (e) { }
          arr.forEach((a) => {
            const version = a.name.replace('v', '')
            const mv = version.split('.').slice(0, 2).join('.')
            const u = `https://github.com/caddyserver/caddy/releases/download/v${version}/caddy_${version}_windows_amd64.zip`
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
        list.filter((l: any) => compareVersions(l.version, '2.5.0') > 0).forEach((l: any) => {
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

        all.forEach((a: any) => {
          const dir = join(global.Server.AppDir!, `caddy-${a.version}`, 'caddy.exe')
          const zip = join(global.Server.Cache!, `caddy-${a.version}.zip`)
          a.appDir = join(global.Server.AppDir!, `caddy-${a.version}`)
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
export default new Caddy()
