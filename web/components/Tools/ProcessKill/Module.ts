import { defineAsyncComponent, markRaw } from 'vue'
import type { AppToolModuleItem } from '@web/core/type'
import { I18nT } from '@shared/lang'

const module: AppToolModuleItem = {
  id: 'ProcessKill',
  type: 'Development',
  label: () => I18nT('util.toolProcessKill'),
  icon: import('@/svg/process.svg?raw'),
  index: 6,
  component: markRaw(defineAsyncComponent(() => import('./Index.vue')))
}
export default module
