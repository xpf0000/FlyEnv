import { defineAsyncComponent } from 'vue'
import type { AppModuleItem } from '@/core/type'

const module: AppModuleItem = {
  moduleType: 'searchEngine',
  typeFlag: 'typesense',
  label: 'Typesense',
  icon: import('@/svg/typesense.svg?raw'),
  index: defineAsyncComponent(() => import('./Index.vue')),
  aside: defineAsyncComponent(() => import('./aside.vue')),
  asideIndex: 3,
  isService: true,
  isTray: true,
  platform: ['macOS', 'Linux']
}
export default module
