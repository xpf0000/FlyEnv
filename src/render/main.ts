import { reactive } from 'vue'
import { VueExtend } from './core/VueExtend'
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
import CapturerSetup from '@/components/Tools/Capturer/setup'
import GlobalIPCOn from '@/util/GlobalIPCOn'
import { RendererLanguage } from '@/core/LanguageService'
import { MessageError } from '@/util/Element'

window.Server = reactive({}) as any

const appRoot = VueExtend(App)

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
        const bootstrap = await RendererLanguage.initialize()
        store.config.setup.lang = bootstrap.locale
        ThemeInit()
        appRoot.mount('#app')
        if (bootstrap.warning) {
          MessageError(bootstrap.warning)
        }
      })
      .catch((error) => {
        console.error('Renderer initialization failed:', error)
      })
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
