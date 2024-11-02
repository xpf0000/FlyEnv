import { defineAsyncComponent, markRaw } from 'vue'
import type { AppToolModuleItem } from '@/core/type'
import { I18nT } from '@shared/lang'

const module: AppToolModuleItem = {
  id: 'git-cheatsheet',
  type: 'Development',
  label: () => I18nT('git-cheatsheet.title'),
  icon: '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="16" cy="12" r="1"></circle><circle cx="12" cy="8" r="1"></circle><circle cx="12" cy="16" r="1"></circle><path d="M12 15V9"></path><path d="M15 11l-2-2"></path><path d="M11 7L9.1 5.1"></path><path d="M10.5 20.4l-6.9-6.9c-.781-.781-.781-2.219 0-3l6.9-6.9c.781-.781 2.219-.781 3 0l6.9 6.9c.781.781.781 2.219 0 3l-6.9 6.9c-.781.781-2.219.781-3 0z"></path></g></svg>',
  index: 2,
  component: markRaw(defineAsyncComponent(() => import('./index.vue')))
}
export default module
