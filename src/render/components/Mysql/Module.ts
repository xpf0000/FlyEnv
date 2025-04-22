import { defineAsyncComponent } from 'vue'
import type { AppModuleItem } from '@/core/type'

const module: AppModuleItem = {
  moduleType: 'dataBaseServer',
  typeFlag: 'mysql',
  label: 'MySQL',
  icon: import('@/svg/mysql.svg?raw'),
  index: defineAsyncComponent(() => import('./Index.vue')),
  aside: defineAsyncComponent(() => import('./aside.vue')),
  asideIndex: 6,
  isService: true,
  isTray: true
}
export default module
