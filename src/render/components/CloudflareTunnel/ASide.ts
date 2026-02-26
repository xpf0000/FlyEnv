import { computed } from 'vue'
import Router from '@/router/index'
import { MessageError, MessageSuccess } from '@/util/Element'
import { AppStore } from '@/store/app'
import CloudflareTunnelStore from '@/core/CloudflareTunnel/CloudflareTunnelStore'
import { I18nT } from '@lang/index'

export const AsideSetup = () => {
  CloudflareTunnelStore.init()
  const appStore = AppStore()

  const currentPage = computed(() => {
    return appStore.currentPage
  })

  const flag = 'cloudflare-tunnel'

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
    const installed = CloudflareTunnelStore.items
    const b = installed.length === 0
    const c = installed.some((v) => v.running)
    const d = !appStore.versionInitiated
    return b || c || d
  })

  const serviceRunning = computed({
    get(): boolean {
      return (
        CloudflareTunnelStore.items.length > 0 && CloudflareTunnelStore.items.some((v) => v.run)
      )
    },
    set(v: boolean) {
      const all: Array<Promise<any>> = []
      if (v) {
        CloudflareTunnelStore.items.forEach((v) => {
          if (appStore.phpGroupStart?.[v.id] !== false && !v?.run) {
            all.push(v.start())
          }
        })
      } else {
        CloudflareTunnelStore.items.forEach((v) => {
          if (v?.run) {
            all.push(v.stop())
          }
        })
      }
      Promise.all(all).then((res) => {
        const find = res.find((s) => typeof s === 'string')
        if (find) {
          MessageError(find)
        } else {
          MessageSuccess(I18nT('base.success'))
        }
      })
    }
  })

  const serviceFetching = computed(() => {
    return CloudflareTunnelStore.items.some((v) => v.running)
  })

  const showItem = computed(() => {
    return appStore.config.setup.common.showItem?.[flag] !== false
  })

  const groupDo = (isRunning: boolean): Array<Promise<string | boolean>> => {
    const all: Array<Promise<string | boolean>> = []
    if (isRunning) {
      if (showItem?.value) {
        CloudflareTunnelStore.items.forEach((v) => {
          if (v?.run) {
            all.push(v.stop())
          }
        })
      }
    } else {
      if (showItem?.value) {
        CloudflareTunnelStore.items.forEach((v) => {
          if (appStore.phpGroupStart?.[v.id] !== false && !v?.run) {
            all.push(v.start())
          }
        })
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
