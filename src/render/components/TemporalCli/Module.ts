import { defineAsyncComponent } from 'vue'
import type { AppModuleItem } from '@/core/type'

const module: AppModuleItem = {
  moduleType: 'serviceGovernance',
  typeFlag: 'temporal-cli',
  label: 'Temporal CLI',
  icon: import('@/svg/temporal.svg?raw'),
  iconPadding: 5,
  index: defineAsyncComponent(() => import('./Index.vue')),
  aside: defineAsyncComponent(() => import('./aside.vue')),
  asideIndex: 51,
  isService: true,
  isTray: true
}
export default module
