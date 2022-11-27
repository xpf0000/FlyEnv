import { createApp, toRaw, markRaw } from 'vue'
import store from '../store/index.js'
import router from '../router/index.js'
import Base from './Base.js'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import SVGIcons from '../components/YbSvgIcon/index.js'
import PoperFix from './directive/PoperFix/index.ts'
import Tour from './directive/Tour/index.ts'

export function VueExtend(App, data = null) {
  const app = createApp(App, data)
  app.use(store)
  app.use(router)
  app.use(PoperFix)
  app.use(SVGIcons, 'ybIcon')
  app.use(ElementPlus, { size: 'default' })
  app.use(Tour)
  app.mixin({
    beforeCreate() {
      this.$children = new Set()
      if (this?.$parent?.$children) {
        this.$parent.$children.add(this)
      }
    },
    created() {
      this._uid = this.$.uid
    },
    beforeUnmount() {
      if (this?.$parent?.$children && this.$parent.$children.has(this)) {
        this.$parent.$children.delete(this)
      }
      if (this?.$children && this?.$children?.clear) {
        this?.$children?.clear()
        this.$children = null
      }
    },
    unmounted() {},
    methods: {
      markRaw,
      toRaw
    }
  })
  Base.init(app)
  return app
}
