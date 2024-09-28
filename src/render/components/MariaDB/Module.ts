import { defineAsyncComponent } from 'vue'
import type { AppModuleItem } from '@/core/type'

const module: AppModuleItem = {
    typeFlag: 'mariadb',
    label: 'MariaDB',
    icon: import('@/svg/mariaDB.svg?raw'),
    index: defineAsyncComponent(() => import('./Index.vue')),
    aside: defineAsyncComponent(() => import('./aside.vue')),
    asideIndex: 7,
    isService: true,
    isTray: true
}
export default module