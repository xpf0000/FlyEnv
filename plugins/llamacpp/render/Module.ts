import { defineAsyncComponent } from 'vue'
import type { AppModuleItem } from '@/core/type'

const module: AppModuleItem = {
  moduleType: 'ai',
  typeFlag: 'llama-cpp',
  label: 'llama.cpp',
  icon: import('@/svg/ai.svg?raw'),
  index: defineAsyncComponent(() => import('./Index.vue')),
  aside: defineAsyncComponent(() => import('./aside.vue')),
  asideIndex: 70,
  isService: true,
  isTray: false,
  platform: ['Windows', 'macOS', 'Linux']
}
export default module
