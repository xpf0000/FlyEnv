import { defineAsyncComponent } from 'vue'
import type { AppModuleItem } from '@/core/type'

const module: AppModuleItem = {
  moduleType: 'site',
  typeFlag: 'mkcert',
  label: 'MkCert',
  icon: import('@/svg/sslmake.svg?raw'),
  index: defineAsyncComponent(() => import('./Index.vue')),
  aside: defineAsyncComponent(() => import('./aside.vue')),
  asideIndex: 23,
  isService: false,
  isTray: false
}
export default module
