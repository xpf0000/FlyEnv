import { reactive } from 'vue'
import IPC from '@/util/IPC'
import type { SoftInstalled } from '@/store/brew'
import { I18nT } from '@shared/lang'
import { MessageError, MessageSuccess } from '@/util/Element'
import type { AppServiceAliasItem } from '@shared/app'
import { AsyncComponentShow } from '@/util/AsyncComponent'
import { AppStore } from '@/store/app'
import { isEqual } from 'lodash'

let time = 0
export const ServiceActionStore: {
  versionDeling: Record<string, boolean>
  pathSeting: Record<string, boolean>
  allPath: string[]
  appPath: string[]
  fetchPathing: boolean
  fetchPath: () => void
  cleanAlias: () => void
  showAlias: (item: SoftInstalled) => void
  setAlias: (
    service: SoftInstalled,
    item?: AppServiceAliasItem,
    old?: AppServiceAliasItem
  ) => Promise<boolean>
  updatePath: (item: SoftInstalled, typeFlag: string) => void
} = reactive({
  versionDeling: {},
  pathSeting: {},
  allPath: [],
  appPath: [],
  fetchPathing: false,
  showAlias(item: SoftInstalled) {
    import('./alias.vue').then((res) => {
      AsyncComponentShow(res.default, {
        item
      }).then()
    })
  },
  setAlias(service: SoftInstalled, item?: AppServiceAliasItem, old?: AppServiceAliasItem) {
    return new Promise((resolve, reject) => {
      const store = AppStore()
      IPC.send(
        'app-fork:tools',
        'setAlias',
        JSON.parse(JSON.stringify(service)),
        item ? JSON.parse(JSON.stringify(item)) : undefined,
        old ? JSON.parse(JSON.stringify(old)) : undefined,
        JSON.parse(JSON.stringify(store.config.setup?.alias ?? {}))
      ).then((key: string, res: any) => {
        IPC.off(key)
        if (res?.code === 0) {
          const setup = JSON.parse(JSON.stringify(store.config.setup))
          setup.alias = res.data
          store.config.setup = reactive(setup)
          store.saveConfig().then().catch()
          resolve(true)
        } else {
          MessageError(res?.msg ?? I18nT('base.fail'))
          reject(new Error('fail'))
        }
      })
    })
  },
  cleanAlias() {
    console.trace('cleanAlias !!!')
    if (time > 5) {
      return
    }
    time += 1
    const store = AppStore()
    IPC.send(
      'app-fork:tools',
      'cleanAlias',
      JSON.parse(JSON.stringify(store.config.setup?.alias ?? {}))
    ).then((key: string, res: any) => {
      IPC.off(key)
      if (res?.code === 0) {
        if (!isEqual(res.data, store.config.setup?.alias)) {
          const setup = JSON.parse(JSON.stringify(store.config.setup))
          setup.alias = res.data
          store.config.setup = reactive(setup)
          store.saveConfig().then().catch()
        }
      }
    })
  },
  fetchPath() {
    if (ServiceActionStore.fetchPathing) {
      return
    }
    ServiceActionStore.fetchPathing = true
    IPC.send('app-fork:tools', 'fetchPATH').then((key: string, res: any) => {
      IPC.off(key)
      if (res?.code === 0 && res?.data?.allPath) {
        const all = res?.data?.allPath ?? []
        const app = res?.data?.appPath ?? []
        ServiceActionStore.allPath = reactive([...all])
        ServiceActionStore.appPath = reactive([...app])
        setTimeout(() => {
          ServiceActionStore.fetchPathing = false
        }, 60000)
      }
    })
  },
  updatePath(item: SoftInstalled, typeFlag: string) {
    if (ServiceActionStore.pathSeting?.[item.bin]) {
      return
    }
    ServiceActionStore.pathSeting[item.bin] = true
    IPC.send('app-fork:tools', 'updatePATH', JSON.parse(JSON.stringify(item)), typeFlag).then(
      (key: string, res: any) => {
        IPC.off(key)
        if (res?.code === 0) {
          const all = res?.data?.allPath ?? []
          const app = res?.data?.appPath ?? []
          ServiceActionStore.allPath = reactive([...all])
          ServiceActionStore.appPath = reactive([...app])
          MessageSuccess(I18nT('base.success'))
        } else {
          MessageError(res?.msg ?? I18nT('base.fail'))
        }
        delete ServiceActionStore.pathSeting?.[item.bin]
      }
    )
  }
})
