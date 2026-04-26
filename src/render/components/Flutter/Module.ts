import { defineAsyncComponent } from 'vue'
import type { AppModuleItem } from '@/core/type'

const module: AppModuleItem = {
  moduleType: 'language',
  typeFlag: 'flutter',
  label: 'Flutter',
  index: defineAsyncComponent(() => import('./Index.vue')),
  aside: defineAsyncComponent(() => import('./aside.vue')),
  asideIndex: 20,
  icon: import('@/svg/code-library.svg?raw'),
  isService: true,
  isTray: true,
  isOnlyRunOne: false
}

export default module
