import { defineAsyncComponent } from 'vue'
import type { AppModuleItem } from '@/core/type'

const module: AppModuleItem = {
  moduleType: 'searchEngine',
  typeFlag: 'zincsearch',
  label: 'ZincSearch',
  icon: import('@/svg/zincsearch.svg?raw'),
  iconPadding: 4,
  index: defineAsyncComponent(() => import('./Index.vue')),
  aside: defineAsyncComponent(() => import('./aside.vue')),
  asideIndex: 4,
  isService: true,
  isTray: true
}
export default module
