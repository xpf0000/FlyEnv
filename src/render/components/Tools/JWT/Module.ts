import { defineAsyncComponent, markRaw } from 'vue'
import type { AppToolModuleItem } from '@/core/type'
import { I18nT } from '@lang/index'

const module: AppToolModuleItem = {
  id: 'jwt-encoder-decoder',
  type: 'Crypto',
  label: () => I18nT('tools.jwt-title'),
  icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18"></path><path d="M5 7l14 10"></path><path d="M19 7L5 17"></path><circle cx="12" cy="12" r="9"></circle></g></svg>',
  index: 4,
  component: markRaw(defineAsyncComponent(() => import('./Index.vue')))
}
export default module
