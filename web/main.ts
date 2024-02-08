import { VueExtend } from './VueExtend'
import App from './App.vue'
import '@/components/Theme/Index.scss'
import '@/style/index.scss'
import '@/style/dark.scss'
import '@/style/light.scss'
import { ThemeInit } from '@web/Theme'

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
