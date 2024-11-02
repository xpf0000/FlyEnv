import { defineAsyncComponent, markRaw } from 'vue'
import type { AppToolModuleItem } from '@/core/type'
import { I18nT } from '@shared/lang'

const module: AppToolModuleItem = {
  id: 'chmod-calculator',
  type: 'Development',
  label: () => I18nT('chmod-calculator.title'),
  icon: '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3v4a1 1 0 0 0 1 1h4"></path><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z"></path><path d="M9 7h1"></path><path d="M9 13h6"></path><path d="M13 17h2"></path></g></svg>',
  index: 9,
  component: markRaw(defineAsyncComponent(() => import('./index.vue')))
}
export default module
