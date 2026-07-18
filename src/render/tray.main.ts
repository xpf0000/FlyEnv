import { VueExtend } from './core/VueExtend'
import App from './tray/App.vue'
import './index.scss'
import { createPinia } from 'pinia'
import IPC from './util/IPC'
import { AppStore } from './tray/store/app'
import { ThemeInit } from '@/tray/Theme'
import { nativeTheme } from '@/util/NodeFn'
import { RendererLanguage } from '@/core/LanguageService'
import type { LanguageRuntimePayload } from '@shared/LanguageProtocol'

const pinia = createPinia()
const app = VueExtend(App)
app.use(pinia)
let mounted = false
let storeReady = false
let languageReady = false

const tryMount = () => {
  if (!mounted && storeReady && languageReady) {
    app.mount('#app')
    mounted = true
    ThemeInit()
  }
}

IPC.on('App-Native-Theme-Update').then(() => {
  nativeTheme.updateFn.forEach((fn: () => void) => {
    fn()
  })
})

IPC.on('APP:Tray-Store-Sync').then((key: string, res: any) => {
  const appStore = AppStore()
  Object.assign(appStore, res)
  storeReady = true
  tryMount()
})

IPC.on('APP-Language-Changed').then(
  async (key: string, payload: LanguageRuntimePayload) => {
    await RendererLanguage.applyBroadcast(payload)
    AppStore().lang = payload.locale
    languageReady = true
    tryMount()
  }
)
