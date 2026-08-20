import IPC from '@/util/IPC'
import { reloadWebServer } from '@/util/Service'
import type { AppHost } from '@/store/app'
import { AppStore } from '@/store/app'
import { I18nT } from '@lang/index'
import { MessageError, MessageSuccess } from '@/util/Element'
import { HostStore } from '@/components/Host/store'
import { shell } from '@/util/NodeFn'
import { join } from '@/util/path-browserify'
import { ensureDataDirectoryReady } from '@/core/DataDirectoryStartup'

const handleHostEnd = (arr: Array<AppHost>, isAdd?: boolean) => {
  const appStore = AppStore()

  reloadWebServer(isAdd ? arr : undefined)

  arr.forEach((h) => {
    if (!h.type) {
      h.type = 'php'
    }
  })
  const hosts = appStore.hosts
  hosts.splice(0)
  hosts.push(...arr)

  HostStore.updateCurrentList()
  handleWriteHosts().then().catch()
  MessageSuccess(I18nT('base.success'))
}

export const handleWriteHosts = () => {
  return new Promise<boolean>((resolve, reject) => {
    const appStore = AppStore()
    const writeHosts = appStore.config.setup.hosts.write
    const ipv6 = appStore.config.setup?.hosts?.ipv6 ?? true
    IPC.send('app-fork:host', 'writeHosts', writeHosts, ipv6).then((key: string, res: any) => {
      IPC.off(key)
      if (res?.code === 0) {
        resolve(true)
      } else {
        reject(new Error(res?.msg ?? 'Failed to write hosts'))
      }
    })
  })
}

export const handleHost = (
  host: AppHost,
  flag: 'add' | 'edit' | 'del',
  old?: AppHost,
  park?: boolean
) => {
  return ensureDataDirectoryReady().then((ready) => {
    if (!ready) {
      return false
    }
    return new Promise((resolve) => {
      host = JSON.parse(JSON.stringify(host))
      old = JSON.parse(JSON.stringify(old ?? {}))
      IPC.send('app-fork:host', 'handleHost', host, flag, old, park).then(
        (key: string, res: any) => {
          if (res?.code === 0) {
            IPC.off(key)
            if (res?.data?.host) {
              handleHostEnd(res.data.host, flag === 'add')
              resolve(true)
            } else if (res?.data?.hostBackFile) {
              MessageError(I18nT('base.hostParseErr'))
              shell.showItemInFolder(res?.data?.hostBackFile)
              resolve(I18nT('base.hostParseErr'))
            }
          } else if (res?.code === 1) {
            IPC.off(key)
            MessageError(res.msg)
            resolve(res.msg)
          }
        }
      )
    })
  })
}

export const hostAlias = (item: AppHost) => {
  const alias = item.alias
    ? item.alias.split('\n').filter((n) => {
        return n && n.length > 0
      })
    : []
  return Array.from(new Set([item.name, ...alias])).sort()
}

export const hostDefaultSSLCert = (item: AppHost) => {
  return {
    cert: join(window.Server.BaseDir!, 'CA', `${item.id}`, `CA-${item.id}.crt`),
    key: join(window.Server.BaseDir!, 'CA', `${item.id}`, `CA-${item.id}.key`)
  }
}
