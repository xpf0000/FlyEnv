import { defineAsyncComponent } from 'vue'
import type { AppModuleItem } from '@/core/type'

const module: AppModuleItem = {
  typeFlag: 'tools',
  index: defineAsyncComponent(() => import('./Index.vue')),
  aside: defineAsyncComponent(() => import('./aside.vue')),
  asideIndex: 17,
  setup: defineAsyncComponent(() => import('./setup.vue'))
}
export default module
