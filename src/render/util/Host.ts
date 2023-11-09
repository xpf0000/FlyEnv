import IPC from '@/util/IPC'
import { reloadService } from '@/util/Service'
import Base from '@/core/Base'
import type { AppHost } from '@/store/app'
import { AppStore } from '@/store/app'
import { BrewStore } from '@/store/brew'
import { I18nT } from '@shared/lang'
const { shell } = require('@electron/remote')
const handleHostEnd = (arr: Array<AppHost>) => {
  const appStore = AppStore()
  const brewStore = BrewStore()

  const apacheRunning = brewStore.apache.installed.find((a) => a.run)
  const apacheTaskRunning = brewStore.apache.installed.some((a) => a.running)
  if (apacheRunning && !apacheTaskRunning) {
    reloadService('apache', apacheRunning).then()
  }

  const nginxRunning = brewStore.nginx.installed.find((a) => a.run)
  const nginxTaskRunning = brewStore.nginx.installed.some((a) => a.running)
  if (nginxRunning && !nginxTaskRunning) {
    reloadService('nginx', nginxRunning).then()
  }
  const hosts = appStore.hosts
  hosts.splice(0)
  hosts.push(...arr)

  const writeHosts = appStore.config.setup.hosts.write
  IPC.send('app-fork:host', 'writeHosts', writeHosts).then((key: string) => {
    IPC.off(key)
  })

  Base.MessageSuccess(I18nT('base.success')).then()
}

export const handleHost = (host: AppHost, flag: string, old?: AppHost, park?: boolean) => {
  return new Promise((resolve) => {
    host = JSON.parse(JSON.stringify(host))
    old = JSON.parse(JSON.stringify(old ?? {}))
    IPC.send('app-fork:host', 'handleHost', host, flag, old, park).then((key: string, res: any) => {
      IPC.off(key)
      if (res?.code === 0) {
        handleHostEnd(res.hosts)
        resolve(true)
      } else if (res?.code === 1) {
        Base.MessageError(res.msg).then()
        resolve(false)
      } else if (res?.code === 2) {
        Base.MessageError(I18nT('base.hostParseErr')).then()
        if (res?.hostBackFile) {
          shell.showItemInFolder(res.hostBackFile)
        }
        resolve(false)
      }
    })
  })
}
