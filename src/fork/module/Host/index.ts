import { join } from 'path'
import { existsSync } from 'fs'
import { Base } from '../Base'
import { I18nT } from '@lang/index'
import type { AppHost, SoftInstalled } from '@shared/app'
import {
  hostAlias,
  uuid,
  writeFile,
  machineId,
  readdir,
  remove,
  removeByRoot,
  readFileByRoot,
  writeFileByRoot,
  execPromiseWithEnv
} from '../../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { makeCaddyConf, updateCaddyConf, delVhost as delCaddyVhost } from '../Caddy/Host'
import {
  makeFrankenPHPConf,
  updateFrankenPHPConf,
  delVhost as delFrankenPHPVhost
} from '../FrankenPHP/Host'
import { makeApacheConf, updateApacheConf, delVhost as delApacheVhost } from '../Apache/Host'
import {
  autoFillNginxRewrite,
  makeNginxConf,
  updateNginxConf,
  delVhost as delNginxVhost
} from '../Nginx/Host'
import { setDirRole, updateAutoSSL, updateRootRule } from './Host'
import { TaskAddPhpMyAdminSite, TaskAddRandomSite } from './Task'
import { publicDecrypt } from 'crypto'
import { fetchHostList, saveHostList } from './HostFile'
import Helper from '../../Helper'
import { appDebugLog, isLinux, isMacOS, isWindows } from '@shared/utils'
import { HostsFileLinux, HostsFileMacOS, HostsFileWindows } from '@shared/PlatFormConst'
import { AppHelperCheck } from '@shared/AppHelperCheck'

export class Host extends Base {
  hostsFile = ''

  constructor() {
    super()
    if (isWindows()) {
      this.hostsFile = HostsFileWindows
    } else if (isMacOS()) {
      this.hostsFile = HostsFileMacOS
    } else if (isLinux()) {
      this.hostsFile = HostsFileLinux
    }
  }

  hostList() {
    return new ForkPromise(async (resolve) => {
      let host: AppHost[] = []
      try {
        host = await fetchHostList()
      } catch {}
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
        try {
          await saveHostList(hostList)
        } catch (e) {
          appDebugLog('[handleHost][writeHostFile][error]', `${e}`).catch()
        }
        resolve({
          host: hostList
        })
      }

      const isMakeConf = () => {
        return !['java', 'node', 'go', 'python', 'tomcat'].includes(host?.type ?? '')
      }

      const doPark = () => {
        console.log('doPark !!!')
        return new ForkPromise(async (resolve) => {
          if (!park || !host || !host.root) {
            resolve(0)
            return
          }
          const root = host.root
          const subDir = await readdir(root)
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
        reject(new Error(I18nT('host.licenseTips')))
        return
      }

      // #700: backend symmetric check — reject add/edit when another site shares
      // the same name AND any same-protocol listening port (defends against
      // bypassing the frontend validation).
      if ((flag === 'add' || flag === 'edit') && host?.name) {
        const samePort = (a: AppHost, b: AppHost) => {
          const httpDup =
            a.port?.nginx === b.port?.nginx ||
            a.port?.apache === b.port?.apache ||
            a.port?.caddy === b.port?.caddy
          if (httpDup) {
            return true
          }
          if (a.useSSL && b.useSSL) {
            return (
              a.port?.nginx_ssl === b.port?.nginx_ssl ||
              a.port?.apache_ssl === b.port?.apache_ssl ||
              a.port?.caddy_ssl === b.port?.caddy_ssl
            )
          }
          return false
        }
        const conflict = hostList.find(
          (h) =>
            (!h.type || h.type === 'php') &&
            h.name === host.name &&
            h.id !== host.id &&
            samePort(h, host)
        )
        if (conflict) {
          reject(new Error(I18nT('host.samePortTips')))
          return
        }
      }

      let index: number
      switch (flag) {
        case 'add':
          {
            if (isMakeConf()) {
              await this._addVhost(host)
              await doPark()
            }
            const topList = hostList.filter((h) => !!h?.isTop)
            hostList.splice(topList.length, 0, host)
            await writeHostFile()
          }
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
            // vhost files are named by host.id (rename-stable). id is unchanged
            // on edit, so old/host share the same base. (#700)
            const confBase = `${old?.id}`
            const nginxConfPath = join(global.Server.BaseDir!, 'vhost/nginx/', `${confBase}.conf`)
            const apacheConfPath = join(global.Server.BaseDir!, 'vhost/apache/', `${confBase}.conf`)
            const frankenphpConfPath = join(
              global.Server.BaseDir!,
              'vhost/frankenphp/',
              `${confBase}.conf`
            )
            if (
              !existsSync(nginxConfPath) ||
              !existsSync(apacheConfPath) ||
              !existsSync(frankenphpConfPath) ||
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
      await delNginxVhost(host)
      await delApacheVhost(host)
      await delCaddyVhost(host)
      await delFrankenPHPVhost(host)
      const autoCA = join(global.Server.BaseDir!, `CA/${host.id}`)
      if (existsSync(autoCA)) {
        try {
          await removeByRoot(autoCA)
        } catch {}
      }
      resolve(true)
    })
  }

  initAllConf(host: AppHost) {
    return new ForkPromise(async (resolve) => {
      const nginxvpath = join(global.Server.BaseDir!, 'vhost/nginx')
      const apachevpath = join(global.Server.BaseDir!, 'vhost/apache')
      const caddyvpath = join(global.Server.BaseDir!, 'vhost/caddy')
      const frankenphpvpath = join(global.Server.BaseDir!, 'vhost/frankenphp')

      const confBase = `${host.id}`
      const nginxConfPath = join(nginxvpath, `${confBase}.conf`)
      const apacheConfPath = join(apachevpath, `${confBase}.conf`)
      const caddyConfPath = join(caddyvpath, `${confBase}.conf`)
      const frankenphpConfPath = join(frankenphpvpath, `${confBase}.conf`)

      if (!existsSync(nginxConfPath)) {
        await makeNginxConf(host)
      }
      if (!existsSync(apacheConfPath)) {
        await makeApacheConf(host)
      }
      if (!existsSync(caddyConfPath)) {
        await makeCaddyConf(host)
      }
      if (!existsSync(frankenphpConfPath)) {
        await makeFrankenPHPConf(host)
      }

      resolve(true)
    })
  }

  /**
   * Incremental update
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
      await updateFrankenPHPConf(host, old)
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
        await makeFrankenPHPConf(host)
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

  _initHost(list: Array<AppHost>, writeToSystem = true, ipv6: boolean): ForkPromise<boolean> {
    return new ForkPromise(async (resolve, reject) => {
      const hostfile = join(global.Server.BaseDir!, 'host.json')
      if (!existsSync(hostfile)) {
        resolve(false)
        return
      }

      const allHost: Set<string> = new Set<string>()
      const host: Array<string> = []
      for (const item of list) {
        const alias = hostAlias(item)
        alias.forEach((a) => {
          allHost.add(a)
        })
      }
      // localhost / loopback domains are resolved by the system already.
      // Writing them to the hosts file is redundant and forces an admin prompt.
      // Skip them so that pure localhost+port sites need no hosts write. (#700)
      const isLoopbackName = (a: string) => {
        const n = a.trim().toLowerCase()
        return n === 'localhost' || n.endsWith('.localhost') || n === '127.0.0.1' || n === '::1'
      }
      allHost.forEach((a) => {
        if (a && a.trim().length > 0 && !isLoopbackName(a)) {
          host.push(`127.0.0.1     ${a}`)
          if (ipv6) {
            host.push(`::1     ${a}`)
          }
        }
      })
      await writeFile(join(global.Server.BaseDir!, 'app.hosts.txt'), host.join('\n'))
      if (!writeToSystem) {
        resolve(false)
        return
      }
      if (!existsSync(this.hostsFile)) {
        reject(new Error(I18nT('fork.hostsFileNotFound')))
        return
      }
      let content: string = ''
      content = (await readFileByRoot(this.hostsFile)) as string
      let x: any = content.match(/(#X-HOSTS-BEGIN#)([\s\S]*?)(#X-HOSTS-END#)/g)
      if (x && x[0]) {
        x = x[0]
        content = content.replace(x, '')
      }
      if (host.length) {
        x = `#X-HOSTS-BEGIN#\n${host.join('\n')}\n#X-HOSTS-END#`
      } else {
        x = ''
      }
      content = content.trim()
      content += `\n${x}`
      await writeFileByRoot(this.hostsFile, content.trim())
      resolve(x.length > 0)
    })
  }

  /**
   * One-time migration for #700: vhost / rewrite / log files used to be named
   * by `host.name`, which collides for same-name sites (multiple localhost).
   * They are now named by `host.id`. This regenerates id-based confs and
   * removes legacy name-based orphan files so the web servers don't load
   * duplicate `server` blocks. Guarded by a marker file; safe to no-op.
   */
  async migrateVhostToId(list: AppHost[]): Promise<void> {
    const marker = join(global.Server.BaseDir!, 'vhost/.id-migrated')
    if (existsSync(marker)) {
      return
    }
    const phpHosts = list.filter(
      (h) => !['java', 'node', 'go', 'python', 'tomcat'].includes(h?.type ?? '')
    )
    const ids = new Set(phpHosts.map((h) => `${h.id}`))

    // 1) Regenerate id-based confs for every site (idempotent).
    for (const h of phpHosts) {
      try {
        await this.initAllConf(h)
      } catch {}
    }

    // 2) Remove legacy name-based orphan files (any .conf whose base is not a known id).
    const dirs = [
      { dir: join(global.Server.BaseDir!, 'vhost/nginx'), exts: ['.conf'] },
      { dir: join(global.Server.BaseDir!, 'vhost/apache'), exts: ['.conf'] },
      { dir: join(global.Server.BaseDir!, 'vhost/caddy'), exts: ['.conf'] },
      { dir: join(global.Server.BaseDir!, 'vhost/frankenphp'), exts: ['.conf'] },
      { dir: join(global.Server.BaseDir!, 'vhost/rewrite'), exts: ['.conf'] }
    ]
    for (const { dir } of dirs) {
      if (!existsSync(dir)) {
        continue
      }
      let files: string[] = []
      try {
        files = await readdir(dir)
      } catch {
        continue
      }
      for (const f of files) {
        if (!f.endsWith('.conf')) {
          continue
        }
        const base = f.slice(0, -'.conf'.length)
        if (!ids.has(base)) {
          try {
            await remove(join(dir, f))
          } catch {}
        }
      }
    }

    // 3) Remove legacy name-based log files (keep id-based ones).
    const logDir = join(global.Server.BaseDir!, 'vhost/logs')
    if (existsSync(logDir)) {
      let logs: string[] = []
      try {
        logs = await readdir(logDir)
      } catch {}
      const idLogOk = (name: string) => {
        // id-based patterns: <id>.log, <id>.error.log, <id>.caddy.log,
        // <id>.frankenphp.log, <id>-access_log, <id>-error_log
        for (const id of ids) {
          if (
            name === `${id}.log` ||
            name === `${id}.error.log` ||
            name === `${id}.caddy.log` ||
            name === `${id}.frankenphp.log` ||
            name === `${id}-access_log` ||
            name === `${id}-error_log`
          ) {
            return true
          }
        }
        return false
      }
      for (const f of logs) {
        if (!idLogOk(f)) {
          try {
            await remove(join(logDir, f))
          } catch {}
        }
      }
    }

    try {
      await writeFile(marker, `${Date.now()}`)
    } catch {}
  }

  writeHosts(write = true, ipv6 = true) {
    return new ForkPromise(async (resolve, reject) => {
      const hostfile = join(global.Server.BaseDir!, 'host.json')
      if (!existsSync(hostfile)) {
        resolve(true)
        return
      }

      let hasChanged = false
      let appHost: AppHost[] = []
      try {
        appHost = await fetchHostList()
      } catch (e) {
        reject(e)
        return
      }
      // One-time #700 migration: move vhost files from name-based to id-based.
      try {
        await this.migrateVhostToId(appHost)
      } catch {}
      console.log('writeHosts: ', write)
      if (write) {
        let changed = false
        try {
          changed = await this._initHost(appHost, true, ipv6)
        } catch {
          changed = false
        }
        hasChanged = hasChanged || changed
      } else {
        let hosts: any = await readFileByRoot(this.hostsFile)
        const x = hosts.match(/(#X-HOSTS-BEGIN#)([\s\S]*?)(#X-HOSTS-END#)/g)
        if (x) {
          const urls = (x?.[2] ?? '').trim()
          hasChanged = urls !== ''
          hosts = hosts.replace(x[0], '')
          await writeFileByRoot(this.hostsFile, hosts.trim())
        }
        let changed = false
        try {
          changed = await this._initHost(appHost, false, ipv6)
        } catch {
          changed = false
        }
        hasChanged = hasChanged || changed
      }
      if (hasChanged && existsSync(hostfile)) {
        try {
          if (isWindows()) {
            await execPromiseWithEnv('ipconfig /flushdns')
          } else {
            if (Helper.enable) {
              await Helper.send('host', 'dnsRefresh')
            } else if (await AppHelperCheck()) {
              await Helper.send('host', 'dnsRefresh')
            }
          }
        } catch {}
      }
      resolve(true)
    })
  }

  addRandomSite(version?: SoftInstalled, write = true, ipv6 = true) {
    return TaskAddRandomSite.call(this, version, write, ipv6)
  }

  addPhpMyAdminSite(phpVersion?: number, write = true, ipv6 = true) {
    return TaskAddPhpMyAdminSite.call(this, phpVersion, write, ipv6)
  }
}
export default new Host()
