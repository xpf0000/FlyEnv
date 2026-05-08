import { defineAsyncComponent } from 'vue'
import type { AppModuleItem } from '@/core/type'

const module: AppModuleItem = {
  moduleType: 'other',
  typeFlag: 'git',
  label: 'Git',
  index: defineAsyncComponent(() => import('./Index.vue')),
  aside: defineAsyncComponent(() => import('./aside.vue')),
  asideIndex: 21,
  icon: import('@/svg/github.svg?raw'),
  isService: false,
  isTray: false,
  isOnlyRunOne: false
}

export default module
