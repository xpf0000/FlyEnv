import { defineAsyncComponent } from 'vue'
import type { AppModuleItem } from '@/core/type'

const module: AppModuleItem = {
  moduleType: 'searchEngine',
  typeFlag: 'meilisearch',
  label: 'Meilisearch',
  icon: import('@/svg/meilisearch.svg?raw'),
  index: defineAsyncComponent(() => import('./Index.vue')),
  aside: defineAsyncComponent(() => import('./aside.vue')),
  asideIndex: 13,
  isService: true,
  isTray: true
}
export default module
