import { createApp } from 'vue'
import router from './router/index'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import SVGIcons from '../src/render/components/YbSvgIcon/index'
import { AppStore } from './store/app'
import { AppI18n } from '@shared/lang'
import { createPinia } from 'pinia'
const baseStore = createPinia()

export function VueExtend(App: any, data?: any) {
  const app = createApp(App, data)
  app.use(router)
  app.use(SVGIcons, 'ybIcon')
  app.use(ElementPlus, { size: 'default' })
  app.use(baseStore)
  const appStore = AppStore()
  app.use(AppI18n(appStore?.config?.setup?.lang))
  return app
}
