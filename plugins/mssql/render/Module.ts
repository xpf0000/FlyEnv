import { defineAsyncComponent } from 'vue'
import type { AppModuleItem } from '@/core/type'

const module = {
  moduleType: 'dataBaseServer',
  typeFlag: 'mssql',
  label: 'SQL Server',
  icon: import('./mssql.svg?raw'),
  index: defineAsyncComponent(() => import('./Index.vue')),
  aside: defineAsyncComponent(() => import('./aside.vue')),
  asideIndex: 25,
  isService: true,
  isTray: false,
  platform: ['Windows', 'Linux']
} as unknown as AppModuleItem

export default module
