import { defineAsyncComponent } from 'vue'
import type { AppModuleItem } from '@/core/type'

const module: AppModuleItem = {
  typeFlag: 'tomcat',
  label: 'Tomcat',
  icon: import('@/svg/Tomcat.svg?raw'),
  index: defineAsyncComponent(() => import('./Index.vue')),
  aside: defineAsyncComponent(() => import('./aside.vue')),
  asideIndex: 4,
  isService: true,
  isTray: true
}
export default module
