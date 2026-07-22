import { defineStore } from 'pinia'
import type { TrayServiceItem, TrayState } from '@shared/Tray'

export type CustomerModuleItem = TrayServiceItem
export type { TrayState }

const state: TrayState = {
  lang: '',
  theme: '',
  password: '',
  groupIsRunning: false,
  groupDisabled: true,
  startupGroups: [],
  service: [],
  isMacOS: undefined,
  isLinux: undefined,
  isWindows: undefined
}

export const AppStore = defineStore('trayApp', {
  state: (): TrayState => state,
  getters: {},
  actions: {}
})
