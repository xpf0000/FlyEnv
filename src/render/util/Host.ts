import IPC from '@/util/IPC'
import { reloadService } from '@/util/Service'
import Base from '@/core/Base'
import { EventBus } from '@/global'
import type { AppHost } from '@/store/app'
import { AppStore } from '@/store/app'
import { BrewStore } from '@/store/brew'

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
    reloadService('nginx', nginxRunning)
  }
  const hosts = appStore.hosts
  hosts.splice(0)
  hosts.push(...arr)

  const writeHosts = appStore.config.setup.hosts.write
  IPC.send('app-fork:host', 'writeHosts', writeHosts).then((key: string) => {
    IPC.off(key)
  })

  Base.MessageSuccess('操作成功')
  EventBus.emit('Host-Edit-Close')
}

export const handleHost = (host: AppHost, flag: string, old?: AppHost) => {
  return new Promise((resolve) => {
    host = JSON.parse(JSON.stringify(host))
    old = JSON.parse(JSON.stringify(old))
    IPC.send('app-fork:host', 'handleHost', host, flag, old ?? {}).then((key: string, res: any) => {
      if (res.code === 0) {
        IPC.off(key)
        handleHostEnd(res.hosts)
        resolve(true)
      } else if (res.code === 1) {
        IPC.off(key)
        Base.MessageError(res.msg)
        resolve(false)
      }
    })
  })
}
