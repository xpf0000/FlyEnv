import { defineAsyncComponent, markRaw } from 'vue'
import type { AppToolModuleItem } from '@/core/type'
import { I18nT } from '@lang/index'

const module: AppToolModuleItem = {
  id: 'MarkdownPreview',
  type: 'Code',
  label: () => I18nT('tools.MarkdownPreview'),
  icon: import('@/svg/md.svg?raw'),
  index: 2,
  component: markRaw(defineAsyncComponent(() => import('./index.vue')))
}
export default module
