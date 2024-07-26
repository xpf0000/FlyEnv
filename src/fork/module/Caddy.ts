import { join } from 'path'
import { createWriteStream, existsSync } from 'fs'
import { Base } from './Base'
import type { AppHost, SoftInstalled } from '@shared/app'
import { execPromise, hostAlias, spawnPromise, waitTime } from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { readFile, writeFile, mkdirp, chmod, remove, copyFile } from 'fs-extra'
import { I18nT } from '../lang'
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

  initCaddyApt() {
    return new ForkPromise(async (resolve, reject) => {
      const sh = join(global.Server.Static!, 'sh/caddy-apt-init.sh')
      const cp = join(global.Server.Cache!, 'caddy-apt-init.sh')
      try {
        await copyFile(sh, cp)
        await execPromise(`echo "${global.Server.Password}" | sudo -S chmod 777 ${cp}`)
        const stdout = await spawnPromise('bash', [cp, global.Server.Password!])
        console.log('initCaddyApt: ', stdout)
        resolve(true)
      } catch (e) {
        reject(e)
      }
    })
  }

  initCaddyDnf() {
    return new ForkPromise(async (resolve, reject) => {
      const sh = join(global.Server.Static!, 'sh/caddy-dnf-init.sh')
      const cp = join(global.Server.Cache!, 'caddy-dnf-init.sh')
      try {
        await copyFile(sh, cp)
        await execPromise(`echo "${global.Server.Password}" | sudo -S chmod 777 ${cp}`)
        const stdout = await spawnPromise('bash', [cp, global.Server.Password!])
        console.log('initCaddyDnf: ', stdout)
        resolve(true)
      } catch (e) {
        reject(e)
      }
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
          } catch (e) {}
          const arch = global.Server.Arch === 'x86_64' ? 'amd64' : 'arm64'
          arr.forEach((a) => {
            const version = a.name.replace('v', '')
            const mv = version.split('.').slice(0, 2).join('.')
            const u = `https://github.com/caddyserver/caddy/releases/download/v${version}/caddy_${version}_linux_${arch}.tar.gz`
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
          .filter((l: any) => compareVersions(l.version, '2.0.0') > 0)
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

        all.forEach((a: any) => {
          const dir = join(global.Server.AppDir!, `static-caddy-${a.version}`, 'caddy')
          const zip = join(global.Server.Cache!, `static-caddy-${a.version}.tar.gz`)
          a.appDir = join(global.Server.AppDir!, `static-caddy-${a.version}`)
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

  installSoft(row: any) {
    return new ForkPromise(async (resolve, reject, on) => {
      const refresh = () => {
        row.downloaded = existsSync(row.zip)
        row.installed = existsSync(row.bin)
      }
      const end = () => {
        refresh()
        if (row.installed) {
          row.downState = 'success'
          row.progress = 100
          on(row)
          resolve(true)
        } else {
          row.downState = 'exception'
          on(row)
          resolve(false)
        }
      }

      const fail = async () => {
        try {
          await remove(row.zip)
          await remove(row.appDir)
        } catch (e) {}
      }

      const unpack = async () => {
        try {
          const dir = row.appDir
          await mkdirp(dir)
          await execPromise(`tar -xzf ${row.zip} -C ${dir}`)
        } catch (e) {
          await fail()
        }
      }

      if (existsSync(row.zip)) {
        await unpack()
        end()
        return
      }

      const proxyUrl =
        Object.values(global?.Server?.Proxy ?? {})?.find((s: string) => s.includes('://')) ?? ''
      let proxy: any = {}
      if (proxyUrl) {
        try {
          const u = new URL(proxyUrl)
          proxy.protocol = u.protocol.replace(':', '')
          proxy.host = u.hostname
          proxy.port = u.port
        } catch (e) {
          proxy = undefined
        }
      } else {
        proxy = undefined
      }

      axios({
        method: 'get',
        url: row.url,
        proxy,
        responseType: 'stream',
        onDownloadProgress: (progress) => {
          if (progress.total) {
            row.progress = Math.round((progress.loaded * 100.0) / progress.total)
            on(row)
          }
        }
      })
        .then(function (response) {
          const stream = createWriteStream(row.zip)
          response.data.pipe(stream)
          stream.on('error', async (err: any) => {
            console.log('stream error: ', err)
            await fail()
            end()
          })
          stream.on('finish', async () => {
            await unpack()
            end()
          })
        })
        .catch(async (err) => {
          console.log('down error: ', err)
          await fail()
          end()
        })
    })
  }
}
export default new Caddy()
