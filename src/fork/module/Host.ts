import { join } from 'path'
import { existsSync } from 'fs'
import { Base } from './Base'
import { I18nT } from '../lang'
import type { AppHost, SoftInstalled } from '@shared/app'
import { getSubDir, hostAlias, uuid, execPromiseRoot } from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { readFile, writeFile, copyFile, remove, chmod } from 'fs-extra'
import { TaskAddPhpMyAdminSite, TaskAddRandaSite } from './host/Task'
import { setDirRole, updateAutoSSL, updateRootRule } from './host/Host'
import { makeApacheConf, updateApacheConf } from './host/Apache'
import { autoFillNginxRewrite, makeNginxConf, updateNginxConf } from './host/Nginx'
import { makeCaddyConf, updateCaddyConf } from './host/Caddy'

class Host extends Base {
  NginxTmpl = ''
  NginxSSLTmpl = ''
  ApacheTmpl = ''
  ApacheSSLTmpl = ''
  CaddyTmpl = ''
  CaddySSLTmpl = ''

  hostsFile = join('c:/windows/system32/drivers/etc', 'hosts')

  constructor() {
    super()
  }

  hostList() {
    return new ForkPromise(async (resolve) => {
      try {
        const hostfile = join(global.Server.BaseDir!, 'host.json')
        if (!existsSync(hostfile)) {
          await writeFile(hostfile, JSON.stringify([]))
          resolve({
            host: []
          })
          return
        }
        const json = await readFile(hostfile, 'utf-8')
        let host = []
        let parseErr = false
        const hostBackFile = join(global.Server.BaseDir!, 'host.back.json')
        try {
          host = JSON.parse(json)
        } catch (e) {
          if (json.trim().length > 0) {
            await copyFile(hostfile, hostBackFile)
            parseErr = true
          }
        }
        if (parseErr) {
          resolve({
            hostBackFile
          })
        } else {
          resolve({
            host
          })
        }
      } catch (e) {
        resolve({
          host: []
        })
      }
    })
  }

  handleHost(host: AppHost, flag: string, old?: AppHost, park?: boolean) {
    return new ForkPromise(async (resolve) => {
      const hostfile = join(global.Server.BaseDir!, 'host.json')
      let hostList: Array<AppHost> = []

      const writeHostFile = async () => {
        hostList.forEach((h) => {
          if (!h.type) {
            h.type = 'php'
          }
        })
        await writeFile(hostfile, JSON.stringify(hostList))
        resolve({
          host: hostList
        })
      }

      if (existsSync(hostfile)) {
        const content = await readFile(hostfile, 'utf-8')
        try {
          hostList = JSON.parse(content)
        } catch (e) {
          console.log(e)
          if (content.length > 0) {
            const hostBackFile = join(global.Server.BaseDir!, 'host.back.json')
            await copyFile(hostfile, hostBackFile)
            resolve({
              hostBackFile
            })
            return
          }
        }
      }

      const isMakeConf = () => {
        return !['java', 'node', 'go', 'python', 'tomcat'].includes(host?.type ?? '')
      }

      const doPark = () => {
        console.log('doPark !!!')
        return new ForkPromise((resolve) => {
          if (!park || !host || !host.root) {
            resolve(0)
            return
          }
          const root = host.root
          const subDir = getSubDir(root, false)
          if (subDir.length === 0) {
            resolve(0)
            return
          }
          const arrs: Array<AppHost> = []
          for (const d of subDir) {
            const item = JSON.parse(JSON.stringify(host))
            item.nginx.rewrite = ''
            item.ssl.cert = ''
            item.ssl.key = ''
            item.id = uuid(13)
            const hostName = item.name.split('.')
            hostName.unshift(d)
            item.root = join(root, d)
            item.name = hostName.join('.')
            const find = hostList.find((h) => h.name === item.name)
            if (find) {
              continue
            }
            const aliasArr = item.alias
              ? item.alias.split('\n').filter((n: string) => {
                  return n && n?.trim()?.length > 0
                })
              : []
            item.alias = aliasArr
              .map((a: string) => {
                const arr = a.trim().split('.')
                arr.unshift(d)
                return arr.join('.')
              })
              .join('\n')
            arrs.push(item)
          }
          if (arrs.length === 0) {
            resolve(0)
            return
          }
          const all: Array<ForkPromise<any>> = []
          arrs.forEach((a) => {
            all.push(this._addVhost(a, false))
          })
          Promise.all(all)
            .then(() => {
              hostList.unshift(...arrs)
              resolve(1)
            })
            .catch(() => {
              resolve(0)
            })
        })
      }

      let index: number
      switch (flag) {
        case 'add':
          if (isMakeConf()) {
            await this._addVhost(host)
            await doPark()
          }
          const topList = hostList.filter((h) => !!h?.isTop)
          hostList.splice(topList.length, 0, host)
          await writeHostFile()
          break
        case 'del':
          if (host?.name) {
            await this._delVhost(host)
          }
          index = hostList.findIndex((h) => h.id === host.id)
          if (index >= 0) {
            hostList.splice(index, 1)
          }
          await writeHostFile()
          break
        case 'edit':
          if (isMakeConf()) {
            const nginxConfPath = join(global.Server.BaseDir!, 'vhost/nginx/', `${old?.name}.conf`)
            const apacheConfPath = join(
              global.Server.BaseDir!,
              'vhost/apache/',
              `${old?.name}.conf`
            )
            if (
              !existsSync(nginxConfPath) ||
              !existsSync(apacheConfPath) ||
              host.useSSL !== old?.useSSL
            ) {
              await this._delVhost(old!)
              await this._addVhost(host)
            } else {
              await this._editVhost(host, old)
            }
            await doPark()
          } else {
            if (old?.name) {
              await this._delVhost(old!)
            }
          }
          index = hostList.findIndex((h) => h.id === old?.id)
          if (index >= 0) {
            hostList[index] = host
          }
          await writeHostFile()
          break
      }
    })
  }

  _delVhost(host: AppHost) {
    return new ForkPromise(async (resolve) => {
      const nginxvpath = join(global.Server.BaseDir!, 'vhost/nginx')
      const apachevpath = join(global.Server.BaseDir!, 'vhost/apache')
      const rewritepath = join(global.Server.BaseDir!, 'vhost/rewrite')
      const caddyvpath = join(global.Server.BaseDir!, 'vhost/caddy')
      const logpath = join(global.Server.BaseDir!, 'vhost/logs')
      const hostname = host.name
      const nvhost = join(nginxvpath, `${hostname}.conf`)
      const avhost = join(apachevpath, `${hostname}.conf`)
      const cvhost = join(caddyvpath, `${hostname}.conf`)
      const rewritep = join(rewritepath, `${hostname}.conf`)
      const accesslogng = join(logpath, `${hostname}.log`)
      const errorlogng = join(logpath, `${hostname}.error.log`)
      const accesslogap = join(logpath, `${hostname}-access_log`)
      const errorlogap = join(logpath, `${hostname}-error_log`)
      const caddylog = join(logpath, `${hostname}.caddy.log`)
      const autoCA = join(global.Server.BaseDir!, `CA/${host.id}`)
      const arr = [
        nvhost,
        avhost,
        cvhost,
        rewritep,
        accesslogng,
        errorlogng,
        accesslogap,
        errorlogap,
        caddylog,
        autoCA
      ]
      for (const f of arr) {
        if (existsSync(f)) {
          try {
            await remove(f)
          } catch (e) {}
        }
      }
      resolve(true)
    })
  }

  _editVhost(host: AppHost, old: AppHost) {
    return new ForkPromise(async (resolve) => {
      await updateRootRule(host, old)
      await updateAutoSSL(host, old)
      await updateApacheConf(host, old)
      await updateNginxConf(host, old)
      await updateCaddyConf(host, old)
      resolve(true)
    })
  }

  _addVhost(host: AppHost, chmod = true) {
    return new ForkPromise(async (resolve, reject) => {
      try {
        /**
         * auto fill nginx url rewrite
         */
        autoFillNginxRewrite(host, chmod)
        await updateAutoSSL(host, {} as any)

        await makeCaddyConf(host)
        await makeNginxConf(host)
        await makeApacheConf(host)
        if (chmod) {
          await setDirRole(host.root)
        }
        resolve(true)
      } catch (e) {
        console.log('_addVhost: ', e)
        reject(e)
      }
    })
  }

  _initHost(list: Array<AppHost>, writeToSystem = true, ipv6: boolean) {
    return new ForkPromise(async (resolve, reject) => {
      const allHost: Set<string> = new Set<string>()
      const host: Array<string> = []
      for (const item of list) {
        const alias = hostAlias(item)
        alias.forEach((a) => {
          allHost.add(a)
        })
      }
      allHost.forEach((a) => {
        host.push(`127.0.0.1     ${a}`)
        if (ipv6) {
          host.push(`::1     ${a}`)
        }
      })
      await writeFile(join(global.Server.BaseDir!, 'app.hosts.txt'), host.join('\n'))
      if (!writeToSystem) {
        resolve(true)
        return
      }
      const filePath = this.hostsFile
      if (!existsSync(filePath)) {
        reject(new Error(I18nT('fork.hostsFileNoFound')))
        return
      }
      let content = await readFile(filePath, 'utf-8')
      let x: any = content.match(/(#X-HOSTS-BEGIN#)([\s\S]*?)(#X-HOSTS-END#)/g)
      if (x && x[0]) {
        x = x[0]
        content = content.replace(x, '')
      }
      if (host) {
        x = `#X-HOSTS-BEGIN#\n${host.join('\n')}\n#X-HOSTS-END#`
      } else {
        x = ''
      }
      content = content.trim()
      content += `\n${x}`
      await writeFile(filePath, content.trim())
      resolve(true)
    })
  }

  async _fixHostsRole() {
    console.log('_fixHostsRole !!!')
    try {
      await chmod(this.hostsFile, 0o666)
    } catch (e) {}
    try {
      await execPromiseRoot(`icacls ${this.hostsFile} /grant Everyone:F`)
    } catch (e) {
      console.log('_fixHostsRole err: ', e)
    }
  }

  doFixHostsRole() {
    return new ForkPromise(async (resolve) => {
      await this._fixHostsRole()
      resolve(0)
    })
  }

  writeHosts(write = true, ipv6 = true) {
    return new ForkPromise(async (resolve) => {
      await this._fixHostsRole()
      const hostfile = join(global.Server.BaseDir!, 'host.json')
      const appHost: Array<AppHost> = []
      if (existsSync(hostfile)) {
        let json: any = await readFile(hostfile, 'utf-8')
        try {
          json = JSON.parse(json)
          appHost.push(...json)
        } catch (e) {}
      }
      console.log('writeHosts: ', write)
      if (write) {
        this._initHost(appHost, true, ipv6).then(resolve)
      } else {
        let hosts = await readFile(this.hostsFile, 'utf-8')
        const x = hosts.match(/(#X-HOSTS-BEGIN#)([\s\S]*?)(#X-HOSTS-END#)/g)
        if (x) {
          hosts = hosts.replace(x[0], '')
          await writeFile(this.hostsFile, hosts.trim())
        }
        this._initHost(appHost, false, ipv6).then(resolve)
      }
    })
  }

  addRandaSite(version?: SoftInstalled) {
    return TaskAddRandaSite.call(this, version)
  }

  addPhpMyAdminSite(phpVersion?: number) {
    return TaskAddPhpMyAdminSite.call(this, phpVersion)
  }
}
export default new Host()
