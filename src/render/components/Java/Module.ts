import { defineAsyncComponent } from 'vue'
import type { AppModuleItem } from '@/core/type'

const module: AppModuleItem = {
  moduleType: 'language',
  typeFlag: 'java',
  label: 'Java',
  index: defineAsyncComponent(() => import('./Index.vue')),
  aside: defineAsyncComponent(() => import('./aside.vue')),
  asideIndex: 18,
  icon: import('@/svg/java.svg?raw'),
  isService: true,
  isTray: true,
  isOnlyRunOne: false
}
export default module
