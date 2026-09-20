import { defineAsyncComponent } from 'vue'
import type { AppModuleItem } from '@/core/type'

const module = {
  moduleType: 'emailServer',
  typeFlag: 'mailpit-plugin',
  label: 'Mailpit Plugin',
  icon: import('@/svg/mailpit.svg?raw'),
  index: defineAsyncComponent(() => import('./Index.vue')),
  aside: defineAsyncComponent(() => import('./aside.vue')),
  asideIndex: 14,
  isService: true,
  isTray: false,
  platform: ['Windows', 'macOS', 'Linux']
} as unknown as AppModuleItem

export default module
