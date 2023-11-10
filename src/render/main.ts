import { VueExtend } from './core/VueExtend'
import App from './App.vue'
import '@/components/Theme/Index.scss'
import IPC from '@/util/IPC'
import { AppI18n } from '@shared/lang'
import { AppStore } from '@/store/app'
import { SiteSuckerStore } from '@/components/Tools/SiteSucker/store'
import { DnsStore } from '@/store/dns'

const { getGlobal } = require('@electron/remote')
global.Server = getGlobal('Server')

const app = VueExtend(App)

let inited = false
IPC.on('APP-Ready-To-Show').then(() => {
  console.log('APP-Ready-To-Show !!!!!!')
  if (!inited) {
    inited = true
    const store = AppStore()
    store
      .initConfig()
      .then(() => {
        const config = store.config.setup
        AppI18n(config?.lang)
        return store.initHost()
      })
      .then(() => {
        app.mount('#app')
      })
    SiteSuckerStore().init()
    DnsStore().init()
  } else {
    console.log('has inited !!!!')
  }
})
