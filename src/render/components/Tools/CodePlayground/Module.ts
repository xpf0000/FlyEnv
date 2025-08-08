import { defineAsyncComponent, markRaw } from 'vue'
import type { AppToolModuleItem } from '@/core/type'
import { I18nT } from '@lang/index'

const module: AppToolModuleItem = {
  id: 'CodePlay',
  type: 'Code',
  label: () => I18nT('tools.CodePlayGround'),
  icon: import('@/svg/codemake.svg?raw'),
  index: 0,
  component: markRaw(defineAsyncComponent(() => import('./index.vue')))
}
export default module
