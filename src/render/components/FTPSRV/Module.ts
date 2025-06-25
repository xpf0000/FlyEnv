import { defineAsyncComponent } from 'vue'
import type { AppModuleItem } from '@/core/type'

const module: AppModuleItem = {
  moduleType: 'ftpServer',
  typeFlag: 'ftp-srv',
  label: 'ftp-srv',
  icon: import('@/svg/ftp.svg?raw'),
  index: defineAsyncComponent(() => import('./Index.vue')),
  aside: defineAsyncComponent(() => import('./aside.vue')),
  asideIndex: 15,
  isService: true,
  isTray: true
}
export default module
