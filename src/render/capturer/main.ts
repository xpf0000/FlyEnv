import { VueExtend } from '@/core/VueExtend'
import App from './App.vue'
import '../index.scss'
import { createPinia } from 'pinia'
import IPC from '../util/IPC'
import { CapturerStore, ScreenStore } from './store/app'
import { reactive } from 'vue'
import RectSelect from '@/capturer/RectSelector/RectSelect'
import CapturerTool from '@/capturer/tools/tools'
import RectCanvasStore from '@/capturer/RectCanvas/RectCanvas'

const pinia = createPinia()
const app = VueExtend(App)
app.use(pinia)
app.mount('#app')
IPC.on('APP:Capturer-Window-Rect-Update').then((key: string, res: any) => {
  const store = CapturerStore()
  store.currentRect = res
})
IPC.on('APP:Capturer-Window-Screen-Image-Update').then((key: string, res: any) => {
  if (res && res?.image) {
    const store = CapturerStore()
    store.initTheme()
    let image: string = res.image as any
    if (!image.includes('data:image/png;base64,')) {
      image = `data:image/png;base64,${image}`
    }
    store.screenImage = image
    store.screenRect = res?.screenRect
    store.scaleFactor = res?.scaleFactor ?? 1
  }
})
IPC.on('APP:Capturer-Window-Image-Get').then((key: string, res: any) => {
  const store = CapturerStore()
  if (res && res?.id && res?.image) {
    const id = res.id
    let image: string = res.image as any
    if (!image.includes('data:image/png;base64,')) {
      image = `data:image/png;base64,${image}`
    }
    store.windowImages[id] = image
    store.getCanvas(store.screenImage!, image, store.currentRect?.bounds, id).catch()
  }
})
IPC.on('APP:Capturer-Window-Clean').then(() => {
  const store = CapturerStore()
  store.screenImage = undefined
  store.windowImages = reactive({})
  store.currentRect = undefined
  store.magnifyingInfo = {
    show: true,
    point: {
      x: 0,
      y: 0,
      showX: 0,
      showY: 0
    },
    hex: '',
    rgb: '',
    image: '',
    componentWidth: 0,
    componentHeight: 0
  }
  RectCanvasStore.reinit()
  RectSelect.reinit()
  CapturerTool.reinit()
  ScreenStore.reinit()
})
