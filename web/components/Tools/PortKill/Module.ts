import { defineAsyncComponent, markRaw } from 'vue'
import type { AppToolModuleItem } from '@web/core/type'
import { I18nT } from '@shared/lang'

const module: AppToolModuleItem = {
  id: 'PortKill',
  type: 'Development',
  label: () => I18nT('util.toolPortKill'),
  icon: import('@/svg/portkill.svg?raw'),
  index: 5,
  component: markRaw(defineAsyncComponent(() => import('./Index.vue')))
}
export default module
