import { computed, reactive } from 'vue'
import { AppStore } from '@/store/app'
import type { AllAppModule } from '@/core/type'
import localForage from 'localforage'
import { ModuleCustomer, ModuleCustomerExecItem } from '@/core/ModuleCustomer'

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

export type CustomerModuleCateItem = {
  id: string
  label: string
  moduleType: string
}

export type CustomerModuleExecItem = {
  id: string
  name: string
  comment: string
  command: string
  commandFile: string
  commandType: 'command' | 'file'
  isSudo?: boolean
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

export type CustomerModuleItem = {
  isCustomer: boolean
  id: string
  typeFlag: string
  label: string
  isService?: boolean
  isOnlyRunOne?: boolean
  icon: string
  moduleType: string
  configPath: Array<{
    name: string
    path: string
  }>
  logPath: Array<{
    name: string
    path: string
  }>
  item: ModuleCustomerExecItem[]
}

const APPCustomerModuleCateKey = 'flyenv-customer-module-cate'
const APPCustomerModuleKey = 'flyenv-customer-module'

export const AppCustomerModule: {
  index: number
  moduleCate: CustomerModuleCateItem[]
  module: ModuleCustomer[]
  init: () => void
  saveModuleCate: () => void
  saveModule: () => Promise<any>
  addModuleCate: (item: CustomerModuleCateItem) => void
  delModuleCate: (item: CustomerModuleCateItem) => void
  currentModule?: ModuleCustomer
} = reactive({
  index: 1,
  currentModule: undefined,
  moduleCate: [],
  module: [],
  init() {
    localForage
      .getItem(APPCustomerModuleCateKey)
      .then((res: CustomerModuleCateItem[]) => {
        if (res) {
          AppCustomerModule.moduleCate = reactive(res)
        }
      })
      .catch()
    localForage
      .getItem(APPCustomerModuleKey)
      .then((res: CustomerModuleItem[]) => {
        if (res) {
          const list = reactive(
            res.map((r) => {
              const module = reactive(new ModuleCustomer(r))
              module.onExecStart = module.onExecStart.bind(module)
              module.start = module.start.bind(module)
              module.stop = module.stop.bind(module)
              module.watchShowHide = module.watchShowHide.bind(module)
              module.watchShowHide()
              return module
            })
          )
          AppCustomerModule.module = reactive(list)
        }
      })
      .catch()
  },
  saveModuleCate() {
    localForage
      .setItem(APPCustomerModuleCateKey, JSON.parse(JSON.stringify(AppCustomerModule.moduleCate)))
      .then()
      .catch()
  },
  saveModule() {
    return localForage.setItem(
      APPCustomerModuleKey,
      JSON.parse(JSON.stringify(AppCustomerModule.module))
    )
  },
  addModuleCate(item: CustomerModuleCateItem) {
    AppCustomerModule.moduleCate.unshift(item)
    AppCustomerModule.saveModuleCate()
  },
  delModuleCate(item: CustomerModuleCateItem) {
    const service = AppCustomerModule.module.filter((f) => f.moduleType !== item.moduleType)
    AppCustomerModule.module = reactive(service)
    const findIndex = AppCustomerModule.moduleCate.findIndex((f) => f.id === item.id)
    if (findIndex >= 0) {
      AppCustomerModule.moduleCate.splice(findIndex, 1)
    }
    AppCustomerModule.saveModuleCate()
    AppCustomerModule.saveModule().then().catch()
  }
})
