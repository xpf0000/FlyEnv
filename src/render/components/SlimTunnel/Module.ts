import { defineAsyncComponent } from 'vue'
import type { AppModuleItem } from '@/core/type'

const module: AppModuleItem = {
  moduleType: 'networkTunnel',
  typeFlag: 'slim-tunnel',
  label: 'Slim Tunnel',
  icon: import('@/svg/link.svg?raw'),
  index: defineAsyncComponent(() => import('./Index.vue')),
  aside: defineAsyncComponent(() => import('./aside.vue')),
  asideIndex: 22,
  isService: true,
  isTray: false
}
export default module
