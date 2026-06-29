import { defineAsyncComponent } from 'vue'
import type { AppModuleItem } from '@/core/type'

const module: AppModuleItem = {
  moduleType: 'aiCoding',
  typeFlag: 'antigravity',
  label: 'Antigravity CLI',
  icon: import('@/svg/antigravity.svg?raw'),
  iconPadding: 4,
  index: defineAsyncComponent(() => import('./Index.vue')),
  aside: defineAsyncComponent(() => import('./aside.vue')),
  asideIndex: 106,
  isService: false,
  isTray: false
}
export default module
