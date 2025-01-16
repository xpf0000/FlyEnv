import { VueExtend } from './core/VueExtend'
import { AppI18n } from '@shared/lang'
import App from './App.vue'
import '@/components/Theme/Index.scss'
import IPC from '@/util/IPC'
import { AppStore } from '@/store/app'
import { SiteSuckerStore } from '@/components/Tools/SiteSucker/store'
import './style/index.scss'
import './style/dark.scss'
import './style/light.scss'
import { ThemeInit } from '@/util/Theme'
import { AppToolStore } from '@/components/Tools/store'
import { SetupStore } from '@/components/Setup/store'

const { getGlobal } = require('@electron/remote')
global.Server = getGlobal('Server')

const app = VueExtend(App)

let inited = false
IPC.on('APP-Ready-To-Show').then((key: string, res: any) => {
  console.log('APP-Ready-To-Show !!!!!!', key, res)
  Object.assign(global.Server, res)
  if (!inited) {
    inited = true
    const store = AppStore()
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
    store.chechAutoHide()
  } else {
    console.log('has inited !!!!')
  }
})
IPC.on('APP-Update-Global-Server').then((key: string, res: any) => {
  console.log('APP-Update-Global-Server: ', key, res)
  Object.assign(global.Server, res)
  const store = AppStore()
  store.envIndex += 1
})
IPC.on('APP-License-Need-Update').then(() => {
  SetupStore().init()
})
