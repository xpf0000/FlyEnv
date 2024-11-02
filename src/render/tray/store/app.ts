import { defineStore } from 'pinia'
import type { AllAppModule } from '@/core/type'

type ModuleItemState = {
  show: boolean
  run: boolean
  running: boolean
  disabled: boolean
}

type StateBase = Partial<Record<AllAppModule, ModuleItemState>>

export interface TrayState extends StateBase {
  lang: string
  theme: string
  groupIsRunning: boolean
  groupDisabled: boolean
}

const state: TrayState = {
  lang: '',
  theme: '',
  groupIsRunning: false,
  groupDisabled: true
}

export const AppStore = defineStore('trayApp', {
  state: (): TrayState => state,
  getters: {},
  actions: {}
})
