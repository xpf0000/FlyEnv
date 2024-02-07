import { VueExtend } from './core/VueExtend'
import App from './tray/App.vue'
import '@/components/Theme/Index.scss'
import { createPinia } from 'pinia'
import IPC from './util/IPC'
import { AppStore } from './tray/store/app'
import { AppI18n } from '@shared/lang'
import { ThemeInit } from '@/tray/Theme'

const pinia = createPinia()
const app = VueExtend(App)
app.use(pinia)
app.mount('#app')
ThemeInit()
IPC.on('APP:Tray-Store-Sync').then((key: string, res: any) => {
  const appStore = AppStore()
  Object.assign(appStore, res)
  AppI18n(appStore.lang)
})
