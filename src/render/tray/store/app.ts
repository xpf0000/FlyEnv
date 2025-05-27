import { defineStore } from 'pinia'
import type { AllAppModule } from '@/core/type'

type ModuleItemState = {
  show: boolean
  run: boolean
  running: boolean
  disabled: boolean
}

type StateBase = Partial<Record<AllAppModule, ModuleItemState>>

export type CustomerModuleItem = {
  id: string
  label: string
  icon: string
} & ModuleItemState

export interface TrayState extends StateBase {
  password: string
  lang: string
  theme: string
  groupIsRunning: boolean
  groupDisabled: boolean
  customerModule: CustomerModuleItem[]
}

const state: TrayState = {
  lang: '',
  theme: '',
  password: '',
  groupIsRunning: false,
  groupDisabled: true,
  customerModule: []
}

export const AppStore = defineStore('trayApp', {
  state: (): TrayState => state,
  getters: {},
  actions: {}
})
