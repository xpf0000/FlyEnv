import { defineAsyncComponent } from 'vue'
import type { AppModuleItem } from '@/core/type'

const module: AppModuleItem = {
  moduleType: 'ai',
  typeFlag: 'openclaw',
  label: 'OpenClaw',
  icon: import('@/svg/openclaw.svg?raw'),
  iconPadding: 5,
  index: defineAsyncComponent(() => import('./Index.vue')),
  aside: defineAsyncComponent(() => import('./aside.vue')),
  asideIndex: 2,
  isService: true,
  isTray: true
}
export default module
