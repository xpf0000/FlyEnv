import { defineAsyncComponent } from 'vue'
import type { AppModuleItem } from '@/core/type'

const module: AppModuleItem = {
    typeFlag: 'node',
    label: 'NodeJS',
    index: defineAsyncComponent(() => import('./Index.vue')),
    aside: defineAsyncComponent(() => import('./aside.vue')),
    asideIndex: 14
}
export default module