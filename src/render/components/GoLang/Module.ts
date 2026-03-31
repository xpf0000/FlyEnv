import { defineAsyncComponent } from 'vue'
import type { AppModuleItem } from '@/core/type'

const module: AppModuleItem = {
  moduleType: 'language',
  typeFlag: 'golang',
  label: 'Go',
  index: defineAsyncComponent(() => import('./Index.vue')),
  aside: defineAsyncComponent(() => import('./aside.vue')),
  asideIndex: 19,
  icon: import('@/svg/Golang.svg?raw'),
  isService: true,
  isTray: true,
  isOnlyRunOne: false
}
export default module
