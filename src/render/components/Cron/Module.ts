import { defineAsyncComponent } from 'vue'
import type { AppModuleItem } from '@/core/type'
import { I18nT } from '@lang/index'

const module: AppModuleItem = {
  typeFlag: 'cron',
  label: () => I18nT('cron.title'),
  icon: import('@/svg/time.svg?raw'),
  index: defineAsyncComponent(() => import('./Index.vue')),
  aside: defineAsyncComponent(() => import('./aside.vue')),
  asideIndex: 1,
  isService: false,
  isTray: false
}
export default module
