import { defineAsyncComponent } from 'vue'
import type { AppModuleItem } from '@/core/type'
export default {
  moduleType: 'tools',
  typeFlag: 'ai-memory',
  label: 'AI Memory',
  icon: import('@/svg/tool.svg?raw'),
  index: defineAsyncComponent(() => import('./Index.vue')),
  aside: defineAsyncComponent(() => import('./aside.vue')),
  asideIndex: 6,
  isService: false,
  isTray: false,
  platform: ['macOS']
} as unknown as AppModuleItem
