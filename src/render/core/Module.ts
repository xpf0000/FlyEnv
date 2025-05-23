import { computed, reactive } from 'vue'
import { AppStore } from '@/store/app'
import type { AllAppModule } from '@/core/type'
import localForage from 'localforage'

export const AppModuleTab: Record<AllAppModule, number> = reactive({}) as any

export const AppModuleSetup = (flag: AllAppModule) => {
  const appStore = AppStore()

  const currentVersion = computed(() => {
    return appStore.config.server?.[flag]?.current?.version
  })
  if (!AppModuleTab[flag]) {
    AppModuleTab[flag] = 0
  }
  const tab = computed({
    get() {
      console.log('tab get: ', AppModuleTab, AppModuleTab[flag])
      return AppModuleTab[flag] ?? 0
    },
    set(v) {
      AppModuleTab[flag] = v
      console.log('tab set: ', v, AppModuleTab)
    }
  })

  const checkVersion = () => {
    if (!currentVersion.value) {
      AppModuleTab[flag] = 1
    }
  }

  return {
    tab,
    checkVersion
  }
}

export type CustomerModuleItem = {
  id: string
  label: string
  moduleType: string
}

export type CustomerModuleServiceExecItem = {
  id: string
  name: string
  comment: string
  command: string
  pidPath?: string
  configPath?: Array<{
    name: string
    path: string
  }>
  logPath?: Array<{
    name: string
    path: string
  }>
}

export type CustomerModuleServiceItem = {
  id: string
  label: string
  isService?: boolean
  isOnlyRunOne?: boolean
  icon?: string
  moduleType: string
  item: CustomerModuleServiceExecItem[]
}

const APPCustomerModuleKey = 'flyenv-customer-module'
const APPCustomerModuleServiceKey = 'flyenv-customer-module-service'

export const AppCustomerModule: {
  module: CustomerModuleItem[]
  service: CustomerModuleServiceItem[]
  init: () => void
  saveModule: () => void
  saveService: () => void
  addModule: (item: CustomerModuleItem) => void
  delModule: (item: CustomerModuleItem) => void
} = reactive({
  module: [],
  service: [],
  init() {
    localForage
      .getItem(APPCustomerModuleKey)
      .then((res: CustomerModuleItem[]) => {
        if (res) {
          AppCustomerModule.module = reactive(res)
        }
      })
      .catch()
    localForage
      .getItem(APPCustomerModuleServiceKey)
      .then((res: CustomerModuleServiceItem[]) => {
        if (res) {
          AppCustomerModule.service = reactive(res)
        }
      })
      .catch()
  },
  saveModule() {
    localForage
      .setItem(APPCustomerModuleKey, JSON.parse(JSON.stringify(AppCustomerModule.module)))
      .then()
      .catch()
  },
  saveService() {
    localForage
      .setItem(APPCustomerModuleServiceKey, JSON.parse(JSON.stringify(AppCustomerModule.service)))
      .then()
      .catch()
  },
  addModule(item: CustomerModuleItem) {
    AppCustomerModule.module.unshift(item)
    AppCustomerModule.saveModule()
  },
  delModule(item: CustomerModuleItem) {
    const service = AppCustomerModule.service.filter((f) => f.moduleType !== item.moduleType)
    AppCustomerModule.service = reactive(service)
    const findIndex = AppCustomerModule.module.findIndex((f) => f.id === item.id)
    if (findIndex >= 0) {
      AppCustomerModule.module.splice(findIndex, 1)
    }
    AppCustomerModule.saveModule()
    AppCustomerModule.saveService
  }
})
