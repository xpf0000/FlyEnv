import { defineAsyncComponent, markRaw } from 'vue'
import type { AppToolModuleItem } from '@/core/type'
import { I18nT } from '@shared/lang'

const module: AppToolModuleItem = {
  id: 'FileInfo',
  type: 'Development',
  label: () => I18nT('util.toolFileInfo'),
  icon: import('@/svg/fileinfo.svg?raw'),
  index: 3,
  component: markRaw(defineAsyncComponent(() => import('./Index.vue')))
}
export default module
