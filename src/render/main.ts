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
import { lang } from '@/util/NodeFn'
import CapturerSetup from '@/components/Tools/Capturer/setup'
import GlobalIPCOn from '@/util/GlobalIPCOn'
import { initStartupGroupStore } from '@/components/StartupGroup/store'

window.Server = reactive({}) as any

const appRoot = VueExtend(App)
lang.loadCustomerLang().then().catch()

IPC.on('APP-Ready-To-Show').then((key: string, res: any) => {
  console.log('APP-Ready-To-Show !!!!!!', key, res)
  Object.assign(window.Server, res)
  if (!GlobalIPCOn.inited) {
    GlobalIPCOn.inited = true
    const store = AppStore()
    store.envIndex += 1
    AppCustomerModule.init()
    store
      .initConfig()
      .then(async () => {
        await initStartupGroupStore()
        ThemeInit()
        const config = store.config.setup
        AppI18n(config?.lang)
        appRoot.mount('#app')
      })
      .catch()
    SiteSuckerStore().init()
    AppToolStore.init()
    SetupStore()
      .init()
      .then(() => {
        CapturerSetup.init()
      })
    AppLogStore.init().then().catch()
  } else {
    console.log('has inited !!!!')
  }
})

GlobalIPCOn.init()
