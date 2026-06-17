import { defineAsyncComponent } from 'vue'
import type { AppModuleItem } from '@/core/type'

const module: AppModuleItem = {
  moduleType: 'ai',
  typeFlag: 'claudecode',
  label: 'AI Code',
  icon: import('@/svg/cliproxyapi.svg?raw'),
  index: defineAsyncComponent(() => import('./Index.vue')),
  aside: defineAsyncComponent(() => import('./aside.vue')),
  asideIndex: 0,
  isService: false,
  isTray: false
}

export default module
