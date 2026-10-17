import { defineAsyncComponent } from 'vue'
import type { AppModuleItem } from '@/core/type'

export default {
  moduleType: 'dataBaseServer',
  typeFlag: 'dameng',
  label: 'Dameng DM8',
  icon: import('./dameng.svg?raw'),
  index: defineAsyncComponent(() => import('./Index.vue')),
  aside: defineAsyncComponent(() => import('./aside.vue')),
  asideIndex: 26,
  isService: true,
  isTray: false,
  platform: ['Windows', 'Linux']
} as unknown as AppModuleItem
