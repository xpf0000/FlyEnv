// @ts-ignore
import { VueExtend } from './core/VueExtend.js'
import App from './tray/App.vue'
import '@/components/Theme/Index.scss'
import { createPinia } from 'pinia'
// @ts-ignore
import IPC from './util/IPC.js'
import { AppStore } from './tray/store/app'

const pinia = createPinia()
const app = VueExtend(App)
app.use(pinia)
app.mount('#app')
IPC.on('APP:Tray-Store-Sync').then((key: string, res: any) => {
  Object.assign(AppStore(), res)
})
