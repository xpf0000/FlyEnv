import { defineAsyncComponent } from 'vue'
import type { AppModuleItem } from '@/core/type'

const module: AppModuleItem = {
  typeFlag: 'dns',
  label: 'DNS Server',
  icon: import('@/svg/dns2.svg?raw'),
  index: defineAsyncComponent(() => import('./Index.vue')),
  aside: defineAsyncComponent(() => import('./aside.vue')),
  asideIndex: 12,
  setup: defineAsyncComponent(() => import('./setup.vue')),
  isTray: true
}
export default module
