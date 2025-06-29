import { defineAsyncComponent } from 'vue'
import type { AppModuleItem } from '@/core/type'

const module: AppModuleItem = {
  moduleType: 'language',
  typeFlag: 'php',
  label: 'PHP',
  icon: import('@/svg/php.svg?raw'),
  index: defineAsyncComponent(() => import('./Index.vue')),
  aside: defineAsyncComponent(() => import('./aside.vue')),
  asideIndex: 5,
  isService: true,
  isTray: true,
  isOnlyRunOne: false
}
export default module
