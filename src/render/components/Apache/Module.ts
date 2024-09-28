import { defineAsyncComponent } from 'vue'
import type { AppModuleItem } from '@/core/type'

const module: AppModuleItem = {
    typeFlag: 'apache',
    label: 'Apache',
    icon: import('@/svg/apache.svg?raw'),
    index: defineAsyncComponent(() => import('./Index.vue')),
    aside: defineAsyncComponent(() => import('./aside.vue')),
    asideIndex: 1,
    isService: true,
    isTray: true
}
export default module