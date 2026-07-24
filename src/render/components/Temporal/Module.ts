import { defineAsyncComponent } from 'vue'
import type { AppModuleItem } from '@/core/type'

const module: AppModuleItem = {
  moduleType: 'cacheAndQueue',
  typeFlag: 'temporal',
  label: 'Temporal',
  icon: import('@/svg/temporal.svg?raw'),
  index: defineAsyncComponent(() => import('./Index.vue')),
  aside: defineAsyncComponent(() => import('./aside.vue')),
  asideIndex: 50,
  isService: true,
  isTray: true
}
export default module
