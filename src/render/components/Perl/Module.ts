import { defineAsyncComponent } from 'vue'
import type { AppModuleItem } from '@/core/type'

const module: AppModuleItem = {
  moduleType: 'language',
  typeFlag: 'perl',
  label: 'Perl',
  index: defineAsyncComponent(() => import('./Index.vue')),
  aside: defineAsyncComponent(() => import('./aside.vue')),
  asideIndex: 19,
  icon: import('@/svg/perl.svg?raw'),
  isService: true,
  isTray: true,
  isOnlyRunOne: false
}
export default module
