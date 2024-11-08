import { defineAsyncComponent, markRaw } from 'vue'
import type { AppToolModuleItem } from '@web/core/type'
import { I18nT } from '@shared/lang'

const module: AppToolModuleItem = {
  id: 'SiteSucker',
  type: 'Development',
  label: () => I18nT('util.toolSiteSucker'),
  icon: import('@/svg/sucker.svg?raw'),
  index: 9,
  component: markRaw(defineAsyncComponent(() => import('./Index.vue')))
}
export default module
