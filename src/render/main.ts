import { reactive } from 'vue'
import { VueExtend } from './core/VueExtend'
import { AppI18n } from '@lang/index'
import App from './App.vue'
import './index.scss'
import IPC from '@/util/IPC'
import { AppStore } from '@/store/app'
import { SiteSuckerStore } from '@/components/Tools/SiteSucker/store'
import './style/index.scss'
import './style/dark.scss'
import './style/light.scss'
import { ThemeInit } from '@/util/Theme'
import { AppToolStore } from '@/components/Tools/store'
import { SetupStore } from '@/components/Setup/store'
import { AppLogStore } from '@/components/AppLog/store'
import { AppCustomerModule } from '@/core/Module'
import { lang, nativeTheme } from '@/util/NodeFn'
import { MessageError, MessageSuccess, MessageWarning } from '@/util/Element'
import { AsyncComponentShow } from '@/util/AsyncComponent'
import { FlyEnvHelperSetup } from '@/components/FlyEnvHelper/setup'
import { isEqual } from 'lodash-es'

window.Server = reactive({}) as any

const app = VueExtend(App)
lang.loadCustomerLang().then().catch()

let inited = false
IPC.on('APP-Ready-To-Show').then((key: string, res: any) => {
  console.log('APP-Ready-To-Show !!!!!!', key, res)
  Object.assign(window.Server, res)
  if (!inited) {
    inited = true
    const store = AppStore()
    store.envIndex += 1
    AppCustomerModule.init()
    store
      .initConfig()
      .then(() => {
        ThemeInit()
        const config = store.config.setup
        AppI18n(config?.lang)
        app.mount('#app')
      })
      .catch()
    SiteSuckerStore().init()
    AppToolStore.init()
    SetupStore().init()
    AppLogStore.init().then().catch()
  } else {
    console.log('has inited !!!!')
  }
})
IPC.on('App-Native-Theme-Update').then(() => {
  nativeTheme.updateFn.forEach((fn: () => void) => {
    fn()
  })
})
IPC.on('APP-Update-Global-Server').then((key: string, res: any) => {
  console.log('APP-Update-Global-Server: ', key, res)
  const server: any = window.Server
  if (isEqual(server, res)) {
    return
  }
  for (const key in server) {
    delete server?.[key]
  }
  Object.assign(window.Server, res)
  const store = AppStore()
  store.envIndex += 1
})
IPC.on('APP-License-Need-Update').then(() => {
  SetupStore().init()
})
IPC.on('APP-FlyEnv-Helper-Notice').then((key: string, res: any) => {
  if (res?.code === 0) {
    MessageSuccess(res?.msg)
  } else if (res.code === 1) {
    MessageError(res?.msg)
    if (res?.status === 'installFaild' && inited && !FlyEnvHelperSetup.show) {
      import('@/components/FlyEnvHelper/index.vue').then((m) => {
        AsyncComponentShow(m.default).then()
      })
    }
  } else if (res.code === 2) {
    MessageWarning(res?.msg)
  }
})
