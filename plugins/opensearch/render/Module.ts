import { defineAsyncComponent } from 'vue'
import type { AppModuleItem } from '@/core/type'

const module = {
  moduleType: 'searchEngine',
  typeFlag: 'opensearch',
  label: 'OpenSearch',
  icon: import('./opensearch.svg?raw'),
  index: defineAsyncComponent(() => import('./Index.vue')),
  aside: defineAsyncComponent(() => import('./aside.vue')),
  asideIndex: 4,
  isService: true,
  isTray: true,
  platform: ['Windows', 'macOS', 'Linux']
} as unknown as AppModuleItem

export default module
