import { defineAsyncComponent, markRaw } from 'vue'
import type { AppToolModuleItem } from '@/core/type'
import { I18nT } from '@lang/index'

const module: AppToolModuleItem = {
  id: 'CodeLibrary',
  type: 'Code',
  label: () => I18nT('tools.CodeLibrary'),
  icon: import('@/svg/code-library.svg?raw'),
  index: 1,
  component: markRaw(defineAsyncComponent(() => import('./index.vue')))
}
export default module
