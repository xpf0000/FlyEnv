import { reactive } from 'vue'
import IPC from '@/util/IPC'
import { SoftInstalled } from '@/store/brew'
import { I18nT } from '@shared/lang'
import { MessageError, MessageSuccess } from '@/util/Element'
import Base from '@/core/Base'
import { reGetInstalled, stopService } from '@/util/Service'
import { AppStore } from '@/store/app'
import { AllAppModule } from '@/core/type'
import { staticVersionDel } from '@/util/Version'

type ServiceActionType = {
  versionDeling: Record<string, boolean>
  pathSeting: Record<string, boolean>
  aliasSeting: Record<string, boolean>
  allPath: string[]
  fetchPathing: boolean
  fetchPath: () => void
  editAliasItem?: SoftInstalled
  onAliasEnd: (e?: MouseEvent) => void
  showAlias: (item: SoftInstalled) => void
  setAlias: (item: SoftInstalled, name: string) => void
  updatePath: (item: SoftInstalled, typeFlag: string) => void
  delVersion: (item: SoftInstalled, typeFlag: string) => void
}

export const ServiceActionStore: ServiceActionType = reactive({
  versionDeling: {},
  pathSeting: {},
  aliasSeting: {},
  allPath: [],
  fetchPathing: false,
  onAliasEnd() {
    delete this.editAliasItem?.aliasEditing
    const store = AppStore()
    const newAlisa = this.editAliasItem?.alias ?? ''
    const oldAlisa = store.config.setup?.alias?.[this.editAliasItem!.bin] ?? ''
    console.log('newAlisa: ', newAlisa, oldAlisa)
    if (newAlisa === oldAlisa) {
      return
    }
    this.setAlias(this.editAliasItem!, newAlisa)
  },
  showAlias(item: SoftInstalled) {
    if (this.aliasSeting[item.bin]) {
      return
    }
    const store = AppStore()
    item.alias = store.config.setup?.alias?.[item.bin] ?? ''
    item.aliasEditing = true
    this.editAliasItem = item
  },
  setAlias(item: SoftInstalled, name: string) {
    console.log('setAlias: ', item, name)
    if (this.aliasSeting[item.bin]) {
      return
    }
    this.aliasSeting[item.bin] = true
    const store = AppStore()
    const oldName = store.config.setup?.alias?.[item.bin] ?? ''
    IPC.send('app-fork:tools', 'setAlias', JSON.parse(JSON.stringify(item)), name, oldName).then(
      (key: string, res: any) => {
        IPC.off(key)
        if (res?.code === 0) {
          const setup = JSON.parse(JSON.stringify(store.config.setup))
          if (name) {
            if (!setup.alias) {
              setup.alias = {}
            }
            setup.alias[item.bin] = name
          } else {
            delete setup?.alias?.[item.bin]
          }
          store.config.setup = reactive(setup)
          item.alias = name
          store.saveConfig().then().catch()
        } else {
          MessageError(res?.msg ?? I18nT('base.fail'))
        }
        delete this.aliasSeting[item.bin]
        delete item?.aliasEditing
        delete this.editAliasItem
      }
    )
  },
  fetchPath() {
    if (ServiceActionStore.fetchPathing) {
      return
    }
    ServiceActionStore.fetchPathing = true
    IPC.send('app-fork:tools', 'fetchPATH').then((key: string, res: any) => {
      IPC.off(key)
      if (res?.code === 0 && res?.data?.length > 0) {
        ServiceActionStore.allPath = reactive([...res.data])
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
        if (res?.code === 0 && res?.data?.length > 0) {
          ServiceActionStore.allPath = reactive([...res.data])
          MessageSuccess(I18nT('base.success'))
        } else {
          MessageError(res?.msg ?? I18nT('base.fail'))
        }
        delete ServiceActionStore.pathSeting?.[item.bin]
      }
    )
  },
  delVersion(item: SoftInstalled, type: AllAppModule) {
    if (ServiceActionStore.versionDeling?.[item.bin]) {
      return
    }
    ServiceActionStore.versionDeling[item.bin] = true
    const store = AppStore()
    if (item.isLocal7Z) {
      Base._Confirm(I18nT('service.bundleinVersionDelTips'), undefined, {
        customClass: 'confirm-del',
        type: 'warning'
      })
        .then(async () => {
          stopService(type, item).then().catch()
          const setup = JSON.parse(JSON.stringify(store.config.setup))
          if (!setup.excludeLocalVersion) {
            setup.excludeLocalVersion = []
          }
          const arr: string[] = Array.from(
            new Set(JSON.parse(JSON.stringify(store.config.setup.excludeLocalVersion)))
          )
          arr.push(`${type}-${item.version}`)
          setup.excludeLocalVersion = arr
          store.config.setup = reactive(setup)
          await store.saveConfig()
          await reGetInstalled(type as any)
        })
        .catch()
        .finally(() => {
          delete ServiceActionStore.versionDeling[item.bin]
        })
    } else if (store.config.setup?.[type]?.dirs?.some((d) => item.bin.includes(d))) {
      Base._Confirm(I18nT('service.customDirVersionDelTips'), undefined, {
        customClass: 'confirm-del',
        type: 'warning'
      })
        .then(async () => {
          stopService(type, item).then().catch()
          const setup = JSON.parse(JSON.stringify(store.config.setup))
          const index = setup?.[type]?.dirs?.findIndex((d: string) => item.bin.includes(d))
          if (index >= 0) {
            setup?.[type]?.dirs?.splice(index, 1)
          }
          store.config.setup = reactive(setup)
          await store.saveConfig()
          await reGetInstalled(type as any)
        })
        .catch()
        .finally(() => {
          delete ServiceActionStore.versionDeling[item.bin]
        })
    } else {
      staticVersionDel(item.path)
    }
  }
} as ServiceActionType)

ServiceActionStore.onAliasEnd = ServiceActionStore.onAliasEnd.bind(ServiceActionStore)
