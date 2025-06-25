import { defineAsyncComponent, markRaw } from 'vue'
import type { AppToolModuleItem } from '@/core/type'
import { I18nT } from '@lang/index'

const module: AppToolModuleItem = {
  id: 'SystemEnv',
  type: 'Development',
  label: () => I18nT('util.toolSystemEnv'),
  icon: import('@/svg/env.svg?raw'),
  index: 1,
  component: markRaw(defineAsyncComponent(() => import('./main.vue')))
}
export default module
