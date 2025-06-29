import { VueExtend } from './core/VueExtend'
import App from './tray/App.vue'
import './index.scss'
import { createPinia } from 'pinia'
import IPC from './util/IPC'
import { AppStore } from './tray/store/app'
import { AppI18n } from '@lang/index'
import { ThemeInit } from '@/tray/Theme'
import { nativeTheme } from '@/util/NodeFn'

const pinia = createPinia()
const app = VueExtend(App)
app.use(pinia)
app.mount('#app')
ThemeInit()
IPC.on('App-Native-Theme-Update').then(() => {
  nativeTheme.updateFn.forEach((fn: () => void) => {
    fn()
  })
})
IPC.on('APP:Tray-Store-Sync').then((key: string, res: any) => {
  const appStore = AppStore()
  Object.assign(appStore, res)
  AppI18n(appStore.lang)
})
