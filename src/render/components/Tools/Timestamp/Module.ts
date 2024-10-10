import { defineAsyncComponent, markRaw } from 'vue'
import type { AppToolModuleItem } from '@/core/type'
import { I18nT } from '@shared/lang'

const module: AppToolModuleItem = {
  id: 'Timestamp',
  type: 'Converter',
  label: () => I18nT('util.toolTimestamp'),
  icon: import('@/svg/time.svg?raw'),
  index: 4,
  component: markRaw(defineAsyncComponent(() => import('./Index.vue')))
}
export default module
