import { defineAsyncComponent } from 'vue'
import type { AppModuleItem } from '@/core/type'

const module = {
  moduleType: 'webServer',
  typeFlag: 'samwaf',
  label: 'SamWaf',
  icon: import('./samwaf.svg?raw'),
  index: defineAsyncComponent(() => import('./Index.vue')),
  aside: defineAsyncComponent(() => import('./aside.vue')),
  asideIndex: 71,
  isService: true,
  isTray: true,
  platform: ['Windows', 'macOS', 'Linux']
} as unknown as AppModuleItem

export default module
