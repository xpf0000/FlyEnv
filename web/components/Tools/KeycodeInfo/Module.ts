import { defineAsyncComponent, markRaw } from 'vue'
import type { AppToolModuleItem } from '@web/core/type'
import { I18nT } from '@shared/lang'

const module: AppToolModuleItem = {
  id: 'keycode-info',
  type: 'Web',
  label: () => I18nT('keycode-info.title'),
  icon: '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"></rect><path d="M6 10h0"></path><path d="M10 10h0"></path><path d="M14 10h0"></path><path d="M18 10h0"></path><path d="M6 14v.01"></path><path d="M18 14v.01"></path><path d="M10 14h4"></path></g></svg>',
  index: 2,
  component: markRaw(defineAsyncComponent(() => import('./index.vue')))
}
export default module
