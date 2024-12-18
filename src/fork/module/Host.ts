import { join } from 'path'
import { existsSync, accessSync, constants } from 'fs'
import { Base } from './Base'
import { I18nT } from '../lang'
import type { AppHost, SoftInstalled } from '@shared/app'
import { getSubDir, hostAlias, uuid } from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { readFile, writeFile } from 'fs-extra'
import { execPromiseRoot } from '@shared/Exec'
import { makeCaddyConf, updateCaddyConf } from './host/Caddy'
import { makeApacheConf, updateApacheConf } from './host/Apache'
import { autoFillNginxRewrite, makeNginxConf, updateNginxConf } from './host/Nginx'
import { setDirRole, updateAutoSSL, updateRootRule } from './host/Host'
import { TaskAddPhpMyAdminSite, TaskAddRandaSite } from './host/Task'
import { publicDecrypt } from 'crypto'
import { fetchHostList, saveHostList } from './host/HostFile'
import { machineId } from 'node-machine-id'

export class Host extends Base {
  constructor() {
    super()
  }

  hostList() {
    return new ForkPromise(async (resolve) => {
      let host: AppHost[] = []
      try {
        host = await fetchHostList()
      } catch (e) {}
      resolve({
        host
      })
    })
  }

  handleHost(host: AppHost, flag: string, old?: AppHost, park?: boolean) {
    return new ForkPromise(async (resolve, reject) => {
      let hostList: Array<AppHost> = []
      try {
        hostList = await fetchHostList()
      } catch (e) {
        reject(e)
        return
      }

      const writeHostFile = async () => {
        await saveHostList(hostList)
        resolve({
          host: hostList
        })
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

      let isLock = false
      if (!global.Server.Licenses) {
        isLock = hostList.length > 2
      } else {
        const getRSAKey = () => {
          const a = '0+u/eiBrB/DAskp9HnoIgq1MDwwbQRv6rNxiBK/qYvvdXJHKBmAtbe0+SW8clzne'
          const b = 'Kq1BrqQFebPxLEMzQ19yrUyei1nByQwzlX8r3DHbFqE6kV9IcwNh9yeW3umUw05F'
          const c = 'zwIDAQAB'
          const d = 'n7Yl8hRd195GT9h48GsW+ekLj2ZyL/O4rmYRlrNDtEAcDNkI0UG0NlG+Bbn2yN1t'
          const e = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAzVJ3axtKGl3lPaUFN82B'
          const f = 'XZW4pCiCvUTSMIU86DkBT/CmDw5n2fCY/FKMQue+WNkQn0mrRphtLH2x0NzIhg+l'
          const g = 'Zkm1wi9pNWLJ8ZvugKZnHq+l9ZmOES/xglWjiv3C7/i0nUtp0sTVNaVYWRapFsTL'
          const arr: string[] = [e, g, b, a, f, d, c]

          const a1 = '-----'
          const a2 = ' PUBLIC KEY'
          const a3 = 'BEGIN'
          const a4 = 'END'

          arr.unshift([a1, a3, a2, a1].join(''))
          arr.push([a1, a4, a2, a1].join(''))

          return arr.join('\n')
        }
        const uuid = await machineId()
        const uid = publicDecrypt(
          getRSAKey(),
          Buffer.from(global.Server.Licenses!, 'base64') as any
        ).toString('utf-8')
        isLock = uid !== uuid
      }
      if (flag === 'add' && isLock) {
        reject(new Error(I18nT('fork.licenseTips')))
        return
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
            await execPromiseRoot([`rm`, `-rf`, f])
          } catch (e) {}
        }
      }
      resolve(true)
    })
  }

  initAllConf(host: AppHost) {
    return new ForkPromise(async (resolve) => {
      const nginxvpath = join(global.Server.BaseDir!, 'vhost/nginx')
      const apachevpath = join(global.Server.BaseDir!, 'vhost/apache')
      const caddyvpath = join(global.Server.BaseDir!, 'vhost/caddy')

      const nginxConfPath = join(nginxvpath, `${host.name}.conf`)
      const apacheConfPath = join(apachevpath, `${host.name}.conf`)
      const caddyConfPath = join(caddyvpath, `${host.name}.conf`)

      if (!existsSync(nginxConfPath)) {
        await makeNginxConf(host)
      }
      if (!existsSync(apacheConfPath)) {
        await makeApacheConf(host)
      }
      if (!existsSync(caddyConfPath)) {
        await makeCaddyConf(host)
      }

      resolve(true)
    })
  }

  /**
   * 增量更新
   * @param host
   * @param old
   * @param addApachePort
   * @param addApachePortSSL
   * @private
   */
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
        if (a && a.trim().length > 0) {
          host.push(`127.0.0.1     ${a}`)
          if (ipv6) {
            host.push(`::1     ${a}`)
          }
        }
      })
      await writeFile(join(global.Server.BaseDir!, 'app.hosts.txt'), host.join('\n'))
      if (!writeToSystem) {
        try {
          await execPromiseRoot(['dscacheutil', '-flushcache'])
          await execPromiseRoot(['killall', '-HUP', 'mDNSResponder'])
        } catch (e) {}
        resolve(true)
        return
      }
      const filePath = '/private/etc/hosts'
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
      try {
        await execPromiseRoot(['dscacheutil', '-flushcache'])
        await execPromiseRoot(['killall', '-HUP', 'mDNSResponder'])
      } catch (e) {}
      resolve(true)
    })
  }

  async _fixHostsRole() {
    let access = false
    try {
      accessSync('/private/etc/hosts', constants.R_OK | constants.W_OK)
      access = true
      console.log('可以读写')
    } catch (err) {
      console.error('无权访问')
    }
    if (!access) {
      try {
        await execPromiseRoot(`chmod 777 /private/etc`.split(' '))
        await execPromiseRoot(`chmod 777 /private/etc/hosts`.split(' '))
      } catch (e) {}
    }
  }

  doFixHostsRole() {
    return new ForkPromise(async (resolve) => {
      await this._fixHostsRole()
      resolve(0)
    })
  }

  writeHosts(write = true, ipv6 = true) {
    return new ForkPromise(async (resolve, reject) => {
      await this._fixHostsRole()
      let appHost: AppHost[] = []
      try {
        appHost = await fetchHostList()
      } catch (e) {
        reject(e)
        return
      }
      console.log('writeHosts: ', write)
      if (write) {
        this._initHost(appHost, true, ipv6).then(resolve)
      } else {
        let hosts = await readFile('/private/etc/hosts', 'utf-8')
        const x = hosts.match(/(#X-HOSTS-BEGIN#)([\s\S]*?)(#X-HOSTS-END#)/g)
        if (x) {
          hosts = hosts.replace(x[0], '')
          await writeFile('/private/etc/hosts', hosts.trim())
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
