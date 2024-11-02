import { defineAsyncComponent, markRaw } from 'vue'
import type { AppToolModuleItem } from '@/core/type'
import { I18nT } from '@shared/lang'

const module: AppToolModuleItem = {
  id: 'BomClean',
  type: 'Development',
  label: () => I18nT('util.toolUTF8BomClean'),
  icon: import('@/svg/BOM.svg?raw'),
  index: 8,
  component: markRaw(defineAsyncComponent(() => import('./Index.vue')))
}
export default module
