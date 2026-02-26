import { defineAsyncComponent } from 'vue'
import type { AppModuleItem } from '@/core/type'

const module: AppModuleItem = {
  moduleType: 'networkTunnel',
  typeFlag: 'cloudflare-tunnel',
  label: 'Cloudflare Tunnel',
  icon: import('@/svg/cloudflare.svg?raw'),
  index: defineAsyncComponent(() => import('./Index.vue')),
  aside: defineAsyncComponent(() => import('./aside.vue')),
  asideIndex: 11,
  isService: true,
  isTray: true
}
export default module
