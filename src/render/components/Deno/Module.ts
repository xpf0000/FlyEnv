import { defineAsyncComponent } from 'vue'
import type { AppModuleItem } from '@/core/type'

const module: AppModuleItem = {
  moduleType: 'language',
  typeFlag: 'deno',
  label: 'Deno',
  index: defineAsyncComponent(() => import('./Index.vue')),
  aside: defineAsyncComponent(() => import('./aside.vue')),
  asideIndex: 19,
  icon: import('@/svg/deno.svg?raw'),
  isService: true,
  isTray: true,
  isOnlyRunOne: false
}
export default module
