import { defineAsyncComponent } from 'vue'
import type { AppModuleItem } from '@web/core/type'

const module: AppModuleItem = {
  moduleType: 'dataQueue',
  typeFlag: 'redis',
  label: 'Redis',
  icon: import('@/svg/redis.svg?raw'),
  index: defineAsyncComponent(() => import('./Index.vue')),
  aside: defineAsyncComponent(() => import('./aside.vue')),
  asideIndex: 11,
  isService: true,
  isTray: true
}
export default module
