import { defineAsyncComponent } from 'vue'
import type { AppModuleItem } from '@/core/type'

const module: AppModuleItem = {
  moduleType: 'ai',
  typeFlag: 'mcp',
  label: 'MCP Server',
  icon: import('@/svg/mcp.svg?raw'),
  iconPadding: 6,
  index: defineAsyncComponent(() => import('./Index.vue')),
  aside: defineAsyncComponent(() => import('./aside.vue')),
  asideIndex: 106,
  isService: true,
  isTray: true
}
export default module
