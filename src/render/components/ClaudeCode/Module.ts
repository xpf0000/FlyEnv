import { defineAsyncComponent } from 'vue'
import type { AppModuleItem } from '@/core/type'

const module: AppModuleItem = {
  moduleType: 'aiCoding',
  typeFlag: 'claudeCode',
  label: 'Claude Code',
  icon: import('@/svg/claude-code.svg?raw'),
  iconPadding: 4,
  index: defineAsyncComponent(() => import('./Index.vue')),
  aside: defineAsyncComponent(() => import('./aside.vue')),
  asideIndex: 103,
  isService: false,
  isTray: false
}
export default module
