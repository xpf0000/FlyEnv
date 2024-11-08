import { defineAsyncComponent, markRaw } from 'vue'
import type { AppToolModuleItem } from '@web/core/type'
import { I18nT } from '@shared/lang'

const module: AppToolModuleItem = {
  id: 'regex-tester',
  type: 'Development',
  label: () => I18nT('regex-tester.title'),
  icon: '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 4l-2 14.5l-6 2l-6-2L4 4z"></path><path d="M7.5 8h3v8l-2-1"></path><path d="M16.5 8H14a.5.5 0 0 0-.5.5v3a.5.5 0 0 0 .5.5h1.423a.5.5 0 0 1 .495.57L15.5 15.5l-2 .5"></path></g></svg>',
  index: 2,
  component: markRaw(defineAsyncComponent(() => import('./index.vue')))
}
export default module
