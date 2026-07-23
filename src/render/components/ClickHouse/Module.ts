import { defineAsyncComponent } from 'vue'
import type { AppModuleItem } from '@/core/type'

const module: AppModuleItem = {
  moduleType: 'dataBaseServer',
  typeFlag: 'clickhouse',
  label: 'ClickHouse',
  icon: import('@/svg/clickhouse.svg?raw'),
  index: defineAsyncComponent(() => import('./Index.vue')),
  aside: defineAsyncComponent(() => import('./aside.vue')),
  asideIndex: 24,
  isService: true,
  isTray: true,
  platform: ['macOS', 'Linux']
}
export default module
