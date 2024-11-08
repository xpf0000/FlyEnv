import { defineAsyncComponent, markRaw } from 'vue'
import type { AppToolModuleItem } from '@web/core/type'
import { I18nT } from '@shared/lang'

const module: AppToolModuleItem = {
  id: 'SSLMake',
  type: 'Development',
  label: () => I18nT('util.toolSSL'),
  icon: import('@/svg/sslmake.svg?raw'),
  index: 2,
  component: markRaw(defineAsyncComponent(() => import('./Index.vue')))
}
export default module
