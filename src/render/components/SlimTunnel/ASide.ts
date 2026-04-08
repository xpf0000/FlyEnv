import { computed } from 'vue'
import Router from '@/router/index'
import { MessageError, MessageSuccess } from '@/util/Element'
import { AppStore } from '@/store/app'
import SlimTunnelStore from '@/core/SlimTunnel/SlimTunnelStore'
import { I18nT } from '@lang/index'
import { AppServiceModule } from '@/core/ASide'

export const AsideSetup = () => {
  SlimTunnelStore.init()
  const appStore = AppStore()

  const flag = 'slim-tunnel'

  const currentPage = computed(() => appStore.currentPage)

  const nav = () => {
    return new Promise((resolve, reject) => {
      const path = `/${flag}`
      if (appStore.currentPage === path) {
        reject(new Error('Path Not Change'))
        return
      }
      Router.push({ path }).then().catch()
      appStore.currentPage = path
      resolve(true)
    })
  }

  const showItem = computed(() => appStore.config.setup.common.showItem?.[flag] !== false)

  const serviceDisabled = computed(() => {
    const installed = SlimTunnelStore.items
    return installed.length === 0 || installed.some((v) => v.running) || !appStore.versionInitiated
  })

  const serviceRunning = computed({
    get(): boolean {
      return SlimTunnelStore.items.length > 0 && SlimTunnelStore.items.some((v) => v.run)
    },
    set(v: boolean) {
      const all: Array<Promise<any>> = []
      if (v) {
        SlimTunnelStore.items.forEach((item) => {
          if (!item.run) all.push(item.start())
        })
      } else {
        SlimTunnelStore.items.forEach((item) => {
          if (item.run) all.push(item.stop())
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

  const serviceFetching = computed(() => SlimTunnelStore.items.some((v) => v.running))

  const switchChange = () => {
    serviceRunning.value = !serviceRunning.value
  }

  const stopNav = () => {}

  const groupDo = (isRunning: boolean): Array<Promise<string | boolean>> => {
    const all: Array<Promise<string | boolean>> = []
    if (!showItem?.value) return all
    if (isRunning) {
      SlimTunnelStore.items.forEach((v) => {
        if (v.run) all.push(v.stop())
      })
    } else {
      SlimTunnelStore.items.forEach((v) => {
        if (!v.run) all.push(v.start())
      })
    }
    return all
  }

  AppServiceModule['slim-tunnel'] = {
    groupDo,
    switchChange,
    serviceRunning,
    serviceFetching,
    serviceDisabled,
    showItem
  } as any

  return {
    showItem,
    serviceDisabled,
    serviceFetching,
    serviceRunning,
    currentPage,
    groupDo,
    switchChange,
    nav,
    stopNav
  }
}
