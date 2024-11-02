import { defineAsyncComponent, markRaw } from 'vue'
import type { AppToolModuleItem } from '@/core/type'
import { I18nT } from '@shared/lang'

const module: AppToolModuleItem = {
  id: 'qr-code-generator',
  type: 'Images',
  label: () => I18nT('qr-code-generator.title'),
  icon: '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="6" height="6" rx="1"></rect><path d="M7 17v.01"></path><rect x="14" y="4" width="6" height="6" rx="1"></rect><path d="M7 7v.01"></path><rect x="4" y="14" width="6" height="6" rx="1"></rect><path d="M17 7v.01"></path><path d="M14 14h3"></path><path d="M20 14v.01"></path><path d="M14 14v3"></path><path d="M14 20h3"></path><path d="M17 17h3"></path><path d="M20 17v3"></path></g></svg>',
  index: 0,
  component: markRaw(defineAsyncComponent(() => import('./index.vue')))
}
export default module
