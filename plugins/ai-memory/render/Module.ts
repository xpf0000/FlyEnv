import { defineAsyncComponent } from 'vue'
import { MemoryT } from './lang'
import type { AppModuleItem } from '@/core/type'
export default {
  moduleType: 'ai',
  typeFlag: 'ai-memory',
  label: () => MemoryT('title'),
  icon: import('../assets/ai-memory.svg?raw'),
  index: defineAsyncComponent(() => import('./Index.vue')),
  aside: defineAsyncComponent(() => import('./aside.vue')),
  asideIndex: 6,
  isService: false,
  isTray: false,
  platform: ['macOS', 'Windows']
} as unknown as AppModuleItem
