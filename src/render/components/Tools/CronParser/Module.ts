import { defineAsyncComponent, markRaw } from 'vue'
import type { AppToolModuleItem } from '@/core/type'
import { I18nT } from '@lang/index'

const module: AppToolModuleItem = {
  id: 'cron-parser',
  type: 'Development',
  label: () => I18nT('tools.cron-parser-title'),
  icon: import('@/svg/time.svg?raw'),
  index: 10,
  component: markRaw(defineAsyncComponent(() => import('./Index.vue')))
}
export default module
