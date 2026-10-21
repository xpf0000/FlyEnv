import { defineAsyncComponent } from 'vue'
import type { AppModuleItem } from '@/core/type'
import { registerMysqlClusterStartup } from './startup/register'
const module = {
  moduleType: 'dataBaseServer',
  typeFlag: 'mysql-cluster',
  label: 'MySQL Cluster',
  icon: import('@/svg/mysql.svg?raw'),
  asideIndex: 27,
  isService: true,
  isTray: false,
  isOnlyRunOne: false,
  platform: ['macOS', 'Windows', 'Linux'],
  index: defineAsyncComponent(() => import('./Index.vue')),
  aside: defineAsyncComponent(() => import('./aside.vue'))
} as AppModuleItem

registerMysqlClusterStartup(module)
export default module
