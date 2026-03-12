import { computed } from 'vue'
import Router from '@/router/index'
import { AppStore } from '@/store/app'
import { OpenClawSetup } from '@/components/OpenClaw/setup'

export const AsideSetup = () => {
  OpenClawSetup.init()
  const appStore = AppStore()

  const currentPage = computed(() => {
    return appStore.currentPage
  })

  const flag = 'openclaw'

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

  const serviceDisabled = computed(() => {
    const a = !OpenClawSetup.installed
    const b = !OpenClawSetup.gatewayInstalled
    const c = OpenClawSetup.loading
    const d = !appStore.versionInitiated
    return a || b || c || d
  })

  const serviceRunning = computed({
    get(): boolean {
      return OpenClawSetup.gatewayRunning
    },
    set(v: boolean) {
      if (v) {
        OpenClawSetup.startGateway()
      } else {
        OpenClawSetup.stopGateway()
      }
    }
  })

  const serviceFetching = computed(() => {
    return OpenClawSetup.loading
  })

  const showItem = computed(() => {
    return appStore.config.setup.common.showItem?.[flag] !== false
  })

  const groupDo = (isRunning: boolean): Array<Promise<string | boolean>> => {
    const all: Array<Promise<string | boolean>> = []
    if (isRunning) {
      if (showItem?.value) {
        if (OpenClawSetup.gatewayRunning) {
          all.push(OpenClawSetup.stopGateway())
        }
      }
    } else {
      if (showItem?.value) {
        if (!OpenClawSetup.gatewayRunning) {
          all.push(OpenClawSetup.startGateway())
        }
      }
    }
    return all
  }

  const switchChange = () => {
    serviceRunning.value = !serviceRunning.value
  }

  const stopNav = () => {}

  return {
    nav,
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
