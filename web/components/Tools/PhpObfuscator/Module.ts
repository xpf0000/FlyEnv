import { defineAsyncComponent, markRaw } from 'vue'
import type { AppToolModuleItem } from '@web/core/type'
import { I18nT } from '@shared/lang'

const module: AppToolModuleItem = {
  id: 'PhpObfuscator',
  type: 'Development',
  label: () => I18nT('util.toolPhpObfuscator'),
  icon: import('@/svg/jiami.svg?raw'),
  index: 7,
  component: markRaw(defineAsyncComponent(() => import('./Index.vue')))
}
export default module
