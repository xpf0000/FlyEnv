import './style.css'
import { defineAsyncComponent } from 'vue'
import type { AppModuleItem } from '@/core/type'
import { registerMariadbClusterStartup } from './startup/register'
const module = {
  moduleType: 'dataBaseServer',
  typeFlag: 'mariadb-cluster',
  label: 'MariaDB Cluster',
  icon: import('@/svg/mariaDB.svg?raw'),
  asideIndex: 28,
  isService: true,
  isTray: false,
  isOnlyRunOne: false,
  platform: ['macOS', 'Windows', 'Linux'],
  index: defineAsyncComponent(() => import('./Index.vue')),
  aside: defineAsyncComponent(() => import('./aside.vue'))
} as AppModuleItem

registerMariadbClusterStartup(module)
export default module
