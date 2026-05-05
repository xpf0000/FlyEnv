import { defineAsyncComponent, markRaw } from 'vue'
import type { AppToolModuleItem } from '@/core/type'
import { I18nT } from '@lang/index'

const module: AppToolModuleItem = {
  id: 'diff-compare',
  type: 'Development',
  label: () => I18nT('tools.diff-compare-title'),
  icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 7h10"></path><path d="M7 12h6"></path><path d="M7 17h10"></path><path d="M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path></g></svg>',
  index: 11,
  component: markRaw(defineAsyncComponent(() => import('./Index.vue')))
}
export default module
