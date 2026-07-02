import IPC from '@/util/IPC'
import { BrewStore } from '@/store/brew'
import { AppStore } from '@/store/app'
import { syncServiceStatusFromMcp } from '@/util/mcpServiceStatus'
import type { AllAppModule } from '@/core/type'
import { HostStore } from '@/components/Host/store'

function handleServiceStatusChanged(res: any) {
  const flag = res?.flag as AllAppModule | undefined
  if (!flag) {
    return
  }
  try {
    const appStore = AppStore()
    const brewStore = BrewStore()
    const module = brewStore.module(flag)
    if (!module) {
      return
    }
    const current = appStore.config.server?.[flag]?.current
    const nextCurrent = syncServiceStatusFromMcp({
      current,
      installed: module.installed,
      instances: res?.instances ?? [],
      isOnlyRunOne: module.isOnlyRunOne
    })
    if (
      nextCurrent &&
      (current?.version !== nextCurrent.version ||
        current?.path !== nextCurrent.path ||
        current?.bin !== nextCurrent.bin)
    ) {
      appStore.UPDATE_SERVER_CURRENT({
        flag,
        data: JSON.parse(JSON.stringify(nextCurrent))
      })
    }
  } catch (e) {
    console.log('service-status-changed handle error: ', e)
  }
}

function handleServiceInstalledNeedUpdate(res: any) {
  const flag = res?.flag
  const versions = Array.isArray(res?.versions) ? res.versions : []
  if (!flag) {
    return
  }
  try {
    const brewStore = BrewStore()
    const module = brewStore.module(flag)
    if (!module) {
      return
    }
    module.applyInstalledVersions(versions).catch()
  } catch (e) {
    console.log('service-installed-need-update handle error: ', e)
  }
}

function handleHostListChanged(res: any) {
  const hosts = Array.isArray(res?.hosts) ? res.hosts : []
  try {
    const appStore = AppStore()
    appStore.UPDATE_HOSTS(hosts)
    HostStore.updateCurrentList()
  } catch (e) {
    console.log('host-list-changed handle error: ', e)
  }
}

export function setupMcpIpc() {
  IPC.on('APP-MCP-Notify').then((key: string, res: any) => {
    try {
      const type = res?.type
      if (type === 'service-status-changed') {
        handleServiceStatusChanged(res)
      } else if (type === 'service-installed-need-update') {
        handleServiceInstalledNeedUpdate(res)
      } else if (type === 'host-list-changed') {
        handleHostListChanged(res)
      }
    } catch (e) {
      console.log('APP-MCP-Notify handle error: ', e)
    }
  })
}

export { syncServiceStatusFromMcp as applyServiceStatusChangeFromMcp }
