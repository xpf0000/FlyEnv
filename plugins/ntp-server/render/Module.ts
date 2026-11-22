import { defineAsyncComponent } from 'vue'
import type { AllAppModule, AppModuleItem } from '@/core/type'
import { ntpModuleId } from '../config'

export const typeFlag = ntpModuleId as AllAppModule
export const title = 'NTP Server'
export const icon = () => import('./clock.svg?raw')

// Drop the fixed catalog cached by plugin 0.1.0 when this version is loaded.
localStorage.removeItem(`fetchVerion-${typeFlag}`)

export default {
  moduleType: 'other',
  typeFlag,
  label: title,
  icon: icon(),
  index: defineAsyncComponent(() => import('./Index.vue')),
  aside: defineAsyncComponent(() => import('./aside.vue')),
  asideIndex: 72,
  isService: true,
  isTray: true,
  platform: ['Windows', 'macOS', 'Linux']
} as AppModuleItem
