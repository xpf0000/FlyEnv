import { defineStore } from 'pinia'

interface State {
  tab: string
  uuid: string
  activeCode: string
  isActive: boolean
}

const state: State = {
  tab: '',
  uuid: '',
  activeCode: '',
  isActive: false
}

export const SetupStore = defineStore('setup', {
  state: (): State => state,
  getters: {},
  actions: {}
})
