import { defineAsyncComponent, markRaw } from 'vue'
import type { AppToolModuleItem } from '@/core/type'
import { I18nT } from '@lang/index'

const module: AppToolModuleItem = {
  id: 'websocket-sse',
  type: 'Development',
  label: () => I18nT('tools.websocket-sse-title'),
  icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12a8 8 0 0 1 8-8"></path><path d="M4 12a8 8 0 0 0 8 8"></path><path d="M12 4a8 8 0 0 1 8 8"></path><path d="M12 20a8 8 0 0 0 8-8"></path><path d="M8 12h.01"></path><path d="M12 12h.01"></path><path d="M16 12h.01"></path></g></svg>',
  index: 11,
  component: markRaw(defineAsyncComponent(() => import('./Index.vue')))
}
export default module
