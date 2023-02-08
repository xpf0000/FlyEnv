import { VueExtend } from './core/VueExtend'
import App from './App.vue'
import '@/components/Theme/Index.scss'
import IPC from '@/util/IPC'
import { AppI18n } from '@shared/lang'
import { createPinia } from 'pinia'
import { AppStore } from '@/store/app'
const { getGlobal } = require('@electron/remote')
global.Server = getGlobal('Server')

const pinia = createPinia()
const app = VueExtend(App)
app.use(pinia)

let inited = false
IPC.on('APP-Ready-To-Show').then(() => {
  console.log('APP-Ready-To-Show !!!!!!')
  if (!inited) {
    inited = true
    const store = AppStore()
    Promise.all([store.initConfig(), store.initHost()]).then(() => {
      const config = store.config.setup
      const i18n = AppI18n(config?.lang)
      app.use(i18n).mount('#app')
    })
  } else {
    console.log('has inited !!!!')
  }
})
