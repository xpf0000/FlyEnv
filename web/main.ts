import { VueExtend } from './VueExtend'
import App from './App.vue'
import '@/components/Theme/Index.scss'
import '@/style/index.scss'
import '@/style/dark.scss'
import '@/style/light.scss'
import { ThemeInit } from '@web/Theme'
import { AppStore } from '@web/store/app'
import { AppI18n } from '@shared/lang'

// @ts-ignore
window.global = {
  Server: {
    MacPorts: '',
    BrewCellar: ''
  }
}

const app = VueExtend(App)
app.mount('#app')
ThemeInit()
const appStore = AppStore()
window.AppSetTheme = (theme: 'light' | 'dark') => {
  appStore.config.setup.theme = theme
}
window.AppSetLang = (lang: 'zh' | 'en') => {
  appStore.config.setup.lang = lang
  AppI18n(lang)
}
