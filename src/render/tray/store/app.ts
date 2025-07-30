import { defineStore } from 'pinia'

type ModuleItemState = {
  show: boolean
  run: boolean
  running: boolean
  disabled: boolean
  typeFlag: string
}

export type CustomerModuleItem = {
  id: string
  label: string
  icon: string
} & ModuleItemState

export interface TrayState{
  password: string
  lang: string
  theme: string
  groupIsRunning: boolean
  groupDisabled: boolean
  service: CustomerModuleItem[]
}

const state: TrayState = {
  lang: '',
  theme: '',
  password: '',
  groupIsRunning: false,
  groupDisabled: true,
  service: []
}

export const AppStore = defineStore('trayApp', {
  state: (): TrayState => state,
  getters: {},
  actions: {}
})
