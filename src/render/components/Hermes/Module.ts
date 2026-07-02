import { defineAsyncComponent } from 'vue'
import type { AppModuleItem } from '@/core/type'

const module: AppModuleItem = {
  moduleType: 'ai',
  typeFlag: 'hermes',
  label: 'Hermes',
  icon: import('@/svg/hermes.svg?raw'),
  iconPadding: 4,
  index: defineAsyncComponent(() => import('./Index.vue')),
  aside: defineAsyncComponent(() => import('./aside.vue')),
  asideIndex: 101,
  isService: false,
  isTray: false
  // platform: ['macOS', 'Linux']
}
export default module
