import { computed } from 'vue'
import Router from '@/router/index'
import { AppStore } from '@/store/app'
import { OpenCodeSetup } from '@/components/OpenCode/setup'

export const AsideSetup = () => {
  OpenCodeSetup.init()
  const appStore = AppStore()

  const currentPage = computed(() => {
    return appStore.currentPage
  })

  const flag = 'openCode'

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
    return true
  })

  const serviceRunning = computed({
    get(): boolean {
      return false
    },
    set() {}
  })

  const serviceFetching = computed(() => {
    return OpenCodeSetup.loading
  })

  const showItem = computed(() => {
    return appStore.config.setup.common.showItem?.[flag] !== false
  })

  const groupDo = (): Array<Promise<string | boolean>> => {
    return []
  }

  const switchChange = () => {}

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
