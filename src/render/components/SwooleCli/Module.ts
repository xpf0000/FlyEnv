import { defineAsyncComponent } from 'vue'
import type { AppModuleItem } from '@/core/type'

const module: AppModuleItem = {
  moduleType: 'language',
  typeFlag: 'swoole-cli',
  label: 'Swoole CLI',
  icon: import('@/svg/swoole-cli.svg?raw'),
  iconPadding: 3,
  index: defineAsyncComponent(() => import('./Index.vue')),
  aside: defineAsyncComponent(() => import('./aside.vue')),
  asideIndex: 8,
  isService: true,
  isTray: true
}

export default module
