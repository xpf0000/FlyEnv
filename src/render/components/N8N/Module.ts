import { defineAsyncComponent } from 'vue'
import type { AppModuleItem } from '@/core/type'

const module: AppModuleItem = {
  moduleType: 'ai',
  typeFlag: 'n8n',
  label: 'n8n',
  icon: import('@/svg/n8n.svg?raw'),
  index: defineAsyncComponent(() => import('./Index.vue')),
  aside: defineAsyncComponent(() => import('./aside.vue')),
  asideIndex: 100,
  isService: true,
  isTray: true
}
export default module
