import { defineAsyncComponent } from 'vue'
import type { AppModuleItem } from '@/core/type'

const module: AppModuleItem = {
  moduleType: 'ftpServer',
  typeFlag: 'pure-ftpd',
  label: 'Pure-FTPd',
  icon: import('@/svg/ftp.svg?raw'),
  index: defineAsyncComponent(() => import('./Index.vue')),
  aside: defineAsyncComponent(() => import('./aside.vue')),
  asideIndex: 14,
  isService: true,
  isTray: true,
  platform: ['macOS', 'Linux']
}
export default module
