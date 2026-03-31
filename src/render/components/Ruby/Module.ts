import { defineAsyncComponent } from 'vue'
import type { AppModuleItem } from '@/core/type'

const module: AppModuleItem = {
  moduleType: 'language',
  typeFlag: 'ruby',
  label: 'Ruby',
  index: defineAsyncComponent(() => import('./Index.vue')),
  aside: defineAsyncComponent(() => import('./aside.vue')),
  asideIndex: 19,
  icon: import('@/svg/Ruby.svg?raw'),
  isService: true,
  isTray: true,
  isOnlyRunOne: false
}
export default module
