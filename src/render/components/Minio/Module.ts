import { defineAsyncComponent } from 'vue'
import type { AppModuleItem } from '@/core/type'

const module: AppModuleItem = {
  moduleType: 'objectStorage',
  typeFlag: 'minio',
  label: 'Minio',
  icon: import('@/svg/minio.svg?raw'),
  index: defineAsyncComponent(() => import('./Index.vue')),
  aside: defineAsyncComponent(() => import('./aside.vue')),
  asideIndex: 4,
  isService: true,
  isTray: true
}
export default module
