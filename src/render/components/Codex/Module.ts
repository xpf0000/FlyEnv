import { defineAsyncComponent } from 'vue'
import type { AppModuleItem } from '@/core/type'

const module: AppModuleItem = {
  moduleType: 'aiCoding',
  typeFlag: 'codex',
  label: 'Codex',
  icon: import('@/svg/codex.svg?raw'),
  iconPadding: 4,
  index: defineAsyncComponent(() => import('./Index.vue')),
  aside: defineAsyncComponent(() => import('./aside.vue')),
  asideIndex: 104,
  isService: false,
  isTray: false
}
export default module
