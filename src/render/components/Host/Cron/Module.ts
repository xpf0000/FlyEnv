import { defineAsyncComponent } from 'vue'
import type { AppModuleItem } from '@/core/type'
import { I18nT } from '@lang/index'

const module: AppModuleItem = {
  moduleType: 'site',
  typeFlag: 'cron',
  label: () => I18nT('cron.title'),
  index: defineAsyncComponent(() => import('./Index.vue')),
  aside: undefined,
  asideIndex: 0
}
export default module
