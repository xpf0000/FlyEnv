import { defineAsyncComponent } from 'vue'
import type { AppModuleItem } from '@web/core/type'

const module: AppModuleItem = {
  typeFlag: 'python',
  label: 'Python',
  index: defineAsyncComponent(() => import('./Index.vue')),
  aside: defineAsyncComponent(() => import('./aside.vue')),
  asideIndex: 17
}
export default module
