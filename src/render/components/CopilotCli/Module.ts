import { defineAsyncComponent } from 'vue'
import type { AppModuleItem } from '@/core/type'

const module: AppModuleItem = {
  moduleType: 'aiCoding',
  typeFlag: 'copilotCli',
  label: 'GitHub Copilot CLI',
  icon: import('@/svg/github.svg?raw'),
  iconPadding: 4,
  index: defineAsyncComponent(() => import('./Index.vue')),
  aside: defineAsyncComponent(() => import('./aside.vue')),
  asideIndex: 107,
  isService: false,
  isTray: false
}
export default module
