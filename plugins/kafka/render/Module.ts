import { defineAsyncComponent } from 'vue'
import type { AppModuleItem } from '@/core/type'

const module = {
  moduleType: 'cacheAndQueue',
  typeFlag: 'kafka',
  label: 'Kafka',
  icon: import('./kafka.svg?raw'),
  index: defineAsyncComponent(() => import('./Index.vue')),
  aside: defineAsyncComponent(() => import('./aside.vue')),
  asideIndex: 49,
  isService: true,
  isTray: true,
  platform: ['Windows', 'macOS', 'Linux']
} as unknown as AppModuleItem

export default module
