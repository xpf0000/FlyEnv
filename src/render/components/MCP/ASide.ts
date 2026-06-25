import { computed } from 'vue'
import Router from '@/router/index'
import { AppStore } from '@/store/app'
import { MCPSetup } from '@/components/MCP/setup'
import { AppServiceModule } from '@/core/ASide'

export const AsideSetup = () => {
  MCPSetup.init()
  const appStore = AppStore()

  const currentPage = computed(() => {
    return appStore.currentPage
  })

  const flag = 'mcp'

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
    return MCPSetup.starting
  })

  const serviceRunning = computed({
    get(): boolean {
      return MCPSetup.running
    },
    set() {}
  })

  const serviceFetching = computed(() => {
    return MCPSetup.starting
  })

  const showItem = computed(() => {
    return appStore.config.setup.common.showItem?.[flag] !== false
  })

  const groupDo = (): Array<Promise<string | boolean>> => {
    return []
  }

  const switchChange = () => {
    if (MCPSetup.running) {
      MCPSetup.stop()
    } else {
      MCPSetup.start()
    }
  }

  const stopNav = () => {}

  AppServiceModule[flag] = {
    groupDo,
    switchChange,
    serviceRunning,
    serviceFetching,
    serviceDisabled,
    showItem
  } as any

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
