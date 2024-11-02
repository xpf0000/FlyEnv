import { defineAsyncComponent, markRaw } from 'vue'
import type { AppToolModuleItem } from '@/core/type'
import { I18nT } from '@shared/lang'

const module: AppToolModuleItem = {
  id: 'EncryptDecryptText',
  type: 'Crypto',
  label: () => I18nT('encryption.title'),
  icon: '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"></rect><circle cx="12" cy="16" r="1"></circle><path d="M8 11V7a4 4 0 0 1 8 0v4"></path></g></svg>',
  index: 2,
  component: markRaw(defineAsyncComponent(() => import('./index.vue')))
}
export default module
