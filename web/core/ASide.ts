import { computed } from 'vue'
import { reactive } from 'vue'
import Router from '@web/router/index'
import { BrewStore } from '@web/store/brew'
import { startService, stopService } from '@web/fn'
import { MessageError, MessageSuccess } from '@/util/Element'
import { I18nT } from '@shared/lang'
import type { AllAppModule } from '@web/core/type'
import { AppStore } from '@web/store/app'

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
    const installed = brewStore.module(flag).installed
    return installed?.find((i) => i.path === current?.path && i.version === current?.version)
  })

  const serviceDisabled = computed(() => {
    return (
      !currentVersion?.value?.version ||
      brewStore.module(flag).installed.some((v) => v.running) ||
      !appStore.versionInited
    )
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
        all.push(stopService(flag, currentVersion?.value))
      }
    } else {
      if (appStore.phpGroupStart?.[currentVersion?.value?.bin ?? ''] === false) {
        return all
      }
      if (showItem?.value && currentVersion?.value?.version) {
        all.push(startService(flag, currentVersion?.value))
      }
    }
    return all
  }

  const switchChange = () => {
    let fn = null
    let promise: Promise<any> | null = null
    if (!currentVersion?.value?.version) return
    fn = serviceRunning?.value ? stopService : startService
    promise = fn(flag, currentVersion?.value)
    promise?.then((res) => {
      if (typeof res === 'string') {
        MessageError(res)
      } else {
        MessageSuccess(I18nT('base.success'))
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
