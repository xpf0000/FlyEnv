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
  Date: window.Date,
  Server: {
    MacPorts: '',
    BrewCellar: ''
  }
}

const app = VueExtend(App)
app.mount('#app')
ThemeInit()
const appStore = AppStore()

// @ts-ignore
window.AppSetTheme = (theme: 'light' | 'dark') => {
  appStore.config.setup.theme = theme
}
// @ts-ignore
window.AppSetLang = (lang: 'zh' | 'en') => {
  appStore.config.setup.lang = lang
  AppI18n(lang)
}
