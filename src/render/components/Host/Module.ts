import { defineAsyncComponent } from 'vue'
import type { AppModuleItem } from '@/core/type'
import { I18nT } from '@lang/index'

const module: AppModuleItem = {
  moduleType: 'site',
  typeFlag: 'hosts',
  label: () => I18nT('base.leftHosts'),
  index: defineAsyncComponent(() => import('./Index.vue')),
  aside: defineAsyncComponent(() => import('./aside.vue')),
  asideIndex: 0
}
export default module
