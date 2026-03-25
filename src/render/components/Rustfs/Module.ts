import { defineAsyncComponent } from 'vue'
import type { AppModuleItem } from '@/core/type'

const module: AppModuleItem = {
  moduleType: 'objectStorage',
  typeFlag: 'rustfs',
  label: 'RustFS',
  icon: import('@/svg/rustfs.svg?raw'),
  index: defineAsyncComponent(() => import('./Index.vue')),
  aside: defineAsyncComponent(() => import('./aside.vue')),
  asideIndex: 5,
  isService: true,
  isTray: true
}
export default module
