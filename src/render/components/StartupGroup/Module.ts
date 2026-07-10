import { defineAsyncComponent } from 'vue'

import { I18nT } from '@lang/index'
import type { AppModuleItem } from '@/core/type'

const module: AppModuleItem = {
  moduleType: 'console',
  typeFlag: 'startup-group',
  label: () => I18nT('common.startupGroup.title'),
  icon: import('@/svg/switch.svg?raw'),
  index: defineAsyncComponent(() => import('./Index.vue')),
  aside: defineAsyncComponent(() => import('./aside.vue')),
  asideIndex: 1,
  isService: false,
  isTray: false
}

export default module
