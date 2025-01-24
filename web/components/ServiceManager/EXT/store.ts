import { reactive } from 'vue'
import type { SoftInstalled } from '@web/store/brew'
import { I18nT } from '@shared/lang'
import { MessageSuccess } from '@/util/Element'
import type { AppServiceAliasItem } from '@shared/app'
import { AsyncComponentShow, dirname, waitTime } from '@web/fn'
import { AppStore } from '@web/store/app'
import type { AllAppModule } from '@web/core/type'

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
  pathDict: Partial<Record<AllAppModule, string>>
} = reactive({
  versionDeling: {},
  pathSeting: {},
  allPath: [],
  appPath: [],
  fetchPathing: false,
  pathDict: {},
  showAlias(item: SoftInstalled) {
    import('./alias.vue').then((res) => {
      AsyncComponentShow(res.default, {
        item
      }).then()
    })
  },
  setAlias(service: SoftInstalled, item?: AppServiceAliasItem, old?: AppServiceAliasItem) {
    return new Promise((resolve) => {
      const store = AppStore()
      waitTime().then(() => {
        const setup = JSON.parse(JSON.stringify(store.config.setup))
        if (!setup.alias) {
          setup.alias = {}
        }
        if (!setup.alias[service.bin]) {
          setup.alias[service.bin] = []
        }
        if (old) {
          const index = setup.alias[service.bin].findIndex((f: any) => f.id === old.id)
          if (index >= 0) {
            setup.alias[service.bin].splice(index, 1, item)
          }
        } else {
          setup.alias[service.bin].unshift(item)
        }
        store.config.setup = reactive(setup)
        resolve(true)
      })
    })
  },
  cleanAlias() {},
  fetchPath() {},
  updatePath(item: SoftInstalled, typeFlag: AllAppModule) {
    const old = this.pathDict?.[typeFlag]
    const bin: string = dirname(item.bin)
    if (old === bin) {
      const index = this.appPath.indexOf(bin)
      if (index >= 0) {
        this.appPath.splice(index, 1)
      }
      delete this.pathDict?.[typeFlag]
    } else {
      const index = this.appPath.indexOf(old)
      if (index >= 0) {
        this.appPath.splice(index, 1)
      }
      this.pathDict[typeFlag] = bin
      this.appPath.unshift(bin)
    }
    MessageSuccess(I18nT('base.success'))
  }
} as any)
