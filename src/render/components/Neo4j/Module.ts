import { defineAsyncComponent } from 'vue'
import type { AppModuleItem } from '@/core/type'

const module: AppModuleItem = {
  moduleType: 'dataBaseServer',
  typeFlag: 'neo4j',
  label: 'Neo4j',
  icon: import('@/svg/neo4j.svg?raw'),
  index: defineAsyncComponent(() => import('./Index.vue')),
  aside: defineAsyncComponent(() => import('./aside.vue')),
  asideIndex: 52,
  iconPadding: 5,
  isService: true,
  isTray: true
}

export default module
