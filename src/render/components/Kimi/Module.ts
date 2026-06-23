import { defineAsyncComponent } from 'vue'
import type { AppModuleItem } from '@/core/type'

const module: AppModuleItem = {
  moduleType: 'ai',
  typeFlag: 'kimi',
  label: 'Kimi',
  icon: import('@/svg/kimi.svg?raw'),
  index: defineAsyncComponent(() => import('./Index.vue')),
  aside: defineAsyncComponent(() => import('./aside.vue')),
  asideIndex: 102,
  isService: false,
  isTray: false
}
export default module
