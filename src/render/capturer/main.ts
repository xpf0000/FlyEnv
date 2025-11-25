import { VueExtend } from '@/core/VueExtend'
import App from './App.vue'
import '../index.scss'
import { createPinia } from 'pinia'
import IPC from '../util/IPC'
import { CapturerStore } from './store/app'

const pinia = createPinia()
const app = VueExtend(App)
app.use(pinia)
app.mount('#app')
IPC.on('APP:Capturer-Window-Rect-Update').then((key: string, res: any) => {
  const store = CapturerStore()
  store.currentRect = res
})
IPC.on('APP:Capturer-Window-Screen-Image-Update').then((key: string, res: any) => {
  const store = CapturerStore()
  store.screenImage = res
})
