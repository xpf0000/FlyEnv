import { defineStore } from 'pinia'
import { waitTime } from '@web/fn'

interface State {
  tab: string
  uuid: string
  activeCode: string
  isActive: boolean
  message: string
  fetching: boolean
}

const state: State = {
  tab: 'base',
  uuid: '',
  activeCode: '',
  isActive: false,
  message: '',
  fetching: false
}

export const SetupStore = defineStore('setup', {
  state: (): State => state,
  getters: {},
  actions: {
    init() {},
    refreshState() {
      if (this.fetching) {
        return
      }
      this.fetching = true
      waitTime().then(() => {
        this.fetching = false
      })
    },
    postRequest() {
      if (this.fetching) {
        return
      }
      this.fetching = true
      waitTime().then(() => {
        this.fetching = false
      })
    }
  }
})
