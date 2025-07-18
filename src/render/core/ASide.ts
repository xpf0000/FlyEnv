import { computed } from 'vue'
import { reactive } from 'vue'
import Router from '@/router/index'
import { BrewStore } from '@/store/brew'
import { MessageError } from '@/util/Element'
import type { AllAppModule } from '@/core/type'
import { AppStore } from '@/store/app'

export interface AppServiceModuleItem {
  groupDo: (isRunning: boolean) => Array<Promise<string | boolean>>
  switchChange: () => void
  serviceRunning: boolean
  serviceFetching: boolean
  serviceDisabled: boolean
  showItem: boolean
}
export const AppServiceModule: Record<AllAppModule, AppServiceModuleItem | undefined> = reactive(
  {}
) as any

export const AsideSetup = (flag: AllAppModule) => {
  const appStore = AppStore()
  const brewStore = BrewStore()

  const currentPage = computed(() => {
    return appStore.currentPage
  })

  const nav = () => {
    return new Promise((resolve, reject) => {
      const path = `/${flag}`
      if (appStore.currentPage === path) {
        reject(new Error('Path Not Change'))
        return
      }
      Router.push({
        path
      })
        .then()
        .catch()
      appStore.currentPage = path
      resolve(true)
    })
  }

  const currentVersion = computed(() => {
    const current = appStore.config.server?.[flag]?.current
    if (!current) {
      return undefined
    }
    const module = brewStore.module(flag)
    const installed = module.installed
    return installed?.find((i) => i.path === current?.path && i.version === current?.version)
  })

  const serviceDisabled = computed(() => {
    const a = !currentVersion?.value?.version
    const installed = brewStore.module(flag).installed
    const b = installed.length === 0
    const c = installed.some((v) => v.running)
    const d = !appStore.versionInitiated
    return a || b || c || d
  })

  const serviceRunning = computed(() => {
    return currentVersion?.value?.run === true
  })

  const serviceFetching = computed(() => {
    return currentVersion?.value?.running === true
  })

  const showItem = computed(() => {
    return appStore.config.setup.common.showItem?.[flag] !== false
  })

  const groupDo = (isRunning: boolean): Array<Promise<string | boolean>> => {
    const all: Array<Promise<string | boolean>> = []
    if (isRunning) {
      if (showItem?.value && serviceRunning?.value && currentVersion?.value?.version) {
        const module = brewStore.module(flag)
        all.push(module.stop())
      }
    } else {
      if (appStore.phpGroupStart?.[currentVersion?.value?.bin ?? ''] === false) {
        return all
      }
      if (showItem?.value && currentVersion?.value?.version) {
        const module = brewStore.module(flag)
        all.push(module.start())
      }
    }
    return all
  }

  const switchChange = () => {
    let promise: Promise<any> | null = null
    if (!currentVersion?.value?.version) return
    const module = brewStore.module(flag)
    promise = serviceRunning?.value ? module.stop() : module.start()
    promise?.then((res) => {
      if (typeof res === 'string') {
        MessageError(res)
      }
    })
  }

  const stopNav = () => {}

  return {
    nav,
    currentVersion,
    serviceDisabled,
    serviceRunning,
    serviceFetching,
    groupDo,
    switchChange,
    showItem,
    currentPage,
    stopNav
  }
}
