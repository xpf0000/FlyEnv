import { defineAsyncComponent } from 'vue'
import type { AppModuleItem } from '@/core/type'

const module: AppModuleItem = {
  moduleType: 'language',
  typeFlag: 'node',
  label: 'NodeJS',
  index: defineAsyncComponent(() => import('./Index.vue')),
  aside: defineAsyncComponent(() => import('./aside.vue')),
  asideIndex: 17,
  icon: import('@/svg/nodejs.svg?raw'),
  isService: true,
  isTray: true,
  isOnlyRunOne: false
}
export default module
