import { defineAsyncComponent, markRaw } from 'vue'
import type { AppToolModuleItem } from '@web/core/type'
import { I18nT } from '@shared/lang'

const module: AppToolModuleItem = {
  id: 'rsa-key-generator',
  type: 'Crypto',
  label: () => I18nT('rsa-key-generator.title'),
  icon: '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="15" cy="15" r="3"></circle><path d="M13 17.5V22l2-1.5l2 1.5v-4.5"></path><path d="M10 19H5a2 2 0 0 1-2-2V7c0-1.1.9-2 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-1 1.73"></path><path d="M6 9h12"></path><path d="M6 12h3"></path><path d="M6 15h2"></path></g></svg>',
  index: 3,
  component: markRaw(defineAsyncComponent(() => import('./index.vue')))
}
export default module
