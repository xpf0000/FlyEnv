import { defineAsyncComponent } from 'vue'
import type { AppModuleItem } from '@/core/type'
import { ShortcutsT } from './lang'

export default {
  moduleType: 'console',
  typeFlag: 'command-shortcuts',
  label: () => ShortcutsT('title'),
  icon: import('@/svg/terminal.svg?raw'),
  index: defineAsyncComponent(() => import('./Index.vue')),
  aside: defineAsyncComponent(() => import('./aside.vue')),
  asideIndex: 5,
  isService: false,
  isTray: false,
  platform: ['Windows', 'macOS', 'Linux']
} as unknown as AppModuleItem
