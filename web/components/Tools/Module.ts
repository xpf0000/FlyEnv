import { defineAsyncComponent } from 'vue'
import type { AppModuleItem } from '@web/core/type'
import { I18nT } from '@shared/lang'

const module: AppModuleItem = {
  typeFlag: 'tools',
  label: () => I18nT('base.leftTools'),
  index: defineAsyncComponent(() => import('./Index.vue')),
  aside: defineAsyncComponent(() => import('./aside.vue')),
  asideIndex: 30
}
export default module
