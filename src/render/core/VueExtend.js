import { createApp, toRaw, markRaw } from 'vue'
import store from '../store/index.js'
import router from '../router/index.js'
import Base from './Base.js'
import ElementPlus from 'element-plus'
import SVGIcons from '../components/YbSvgIcon/index.js'

export function VueExtend(App, data = null) {
  const app = createApp(App, data)
  app.use(store)
  app.use(router)
  app.use(SVGIcons, 'ybIcon')
  Base.init(app)
  app.use(ElementPlus, { size: 'default' })
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
  return app
}
