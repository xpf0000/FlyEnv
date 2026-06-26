import { setupMcpIpc } from '@/util/MCP'
import IPC from '@/util/IPC'
import { MessageError, MessageSuccess, MessageWarning } from '@/util/Element'
import { FlyEnvHelperSetup } from '@/components/FlyEnvHelper/setup'
import HelperStore from '@/store/helper'
import { nativeTheme } from '@/util/NodeFn'
import { isEqual } from 'lodash-es'
import { AppStore } from '@/store/app'
import { SetupStore } from '@/components/Setup/store'

class GlobalIPCOn {
  public inited = false

  init() {
    IPC.on('App-Native-Theme-Update').then(() => {
      nativeTheme.updateFn.forEach((fn: () => void) => {
        fn()
      })
    })
    IPC.on('APP-Update-Global-Server').then((key: string, res: any) => {
      console.log('APP-Update-Global-Server: ', key, res)
      const server: any = window.Server
      if (isEqual(server, res)) {
        return
      }
      for (const key in server) {
        delete server?.[key]
      }
      Object.assign(window.Server, res)
      const store = AppStore()
      store.envIndex += 1
    })
    IPC.on('APP-User-UUID-Need-Update').then((key: string, res: any) => {
      if (res?.code === 0) {
        const store = SetupStore()
        store.githubUser = res?.data?.user
        store.githubLicense = res?.data?.license
        store.githubInfoSave()
      }
    })
    IPC.on('APP-License-Need-Update').then(() => {
      SetupStore().init()
    })

    IPC.on('APP-FlyEnv-Helper-Notice').then((key: string, res: any) => {
      if (res?.code === 0) {
        MessageSuccess(res?.msg)
      } else if (res.code === 1) {
        MessageError(res?.msg)
        if (res?.status === 'installFaild' && this.inited && !FlyEnvHelperSetup.show) {
          HelperStore.showInstallFailDialog()
        } else if (!res?.status) {
          HelperStore.showNeedInstallDialog()
        }
      } else if (res.code === 2) {
        MessageWarning(res?.msg)
      }
    })

    setupMcpIpc()
  }
}

export default new GlobalIPCOn()
