import { defineAsyncComponent } from 'vue'
import type { AppModuleItem } from '@/core/type'

const module: AppModuleItem = {
  moduleType: 'dataQueue',
  typeFlag: 'etcd',
  label: 'etcd',
  icon: import('@/svg/etcd.svg?raw'),
  index: defineAsyncComponent(() => import('./Index.vue')),
  aside: defineAsyncComponent(() => import('./aside.vue')),
  asideIndex: 3,
  isService: true,
  isTray: true
}
export default module
