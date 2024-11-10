import { defineStore } from 'pinia'

export type LinkState = 'wait' | 'running' | 'success' | 'fail' | 'replace'

export type LinkItem = {
  url: string
  state: LinkState
}

export type SiteSuckerSetup = {
  dir: string
  proxy: string
  excludeLink: string
  pageLimit: string
}

export type SiteSuckerTask = {
  url: string
  state: 'running' | 'stop' | 'pause'
}

interface State {
  links: Array<LinkItem>
  commonSetup: SiteSuckerSetup
  task: SiteSuckerTask
}

const state: State = {
  links: [],
  task: {
    url: '',
    state: 'stop'
  },
  commonSetup: {
    dir: '',
    proxy: '',
    excludeLink: '',
    pageLimit: ''
  }
}

export const SiteSuckerStore = defineStore('siteSucker', {
  state: (): State => state,
  getters: {},
  actions: {
    initSetup() {
      return new Promise((resolve) => {
        resolve(true)
      })
    },
    save() {},
    init() {
      this.task.state = 'stop'
    }
  }
})
