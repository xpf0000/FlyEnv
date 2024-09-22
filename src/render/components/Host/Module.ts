import { defineAsyncComponent } from 'vue'
import type { AppModuleItem } from '@/core/type'

const module: AppModuleItem = {
  typeFlag: 'hosts',
  index: defineAsyncComponent(() => import('./Index.vue')),
  aside: defineAsyncComponent(() => import('./aside.vue')),
  asideIndex: 0,
  setup: defineAsyncComponent(() => import('./setup.vue'))
}
export default module
