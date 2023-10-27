import { defineStore } from 'pinia'
import IPC from '@/util/IPC'
import { reactive } from 'vue'

export type LinkState = 'wait' | 'running' | 'success' | 'fail' | 'replace'

export type LinkItem = {
  url: string
  state: LinkState
}

interface State {
  links: Array<LinkItem>
}

const state: State = {
  links: []
}

export const SiteSuckerStore = defineStore('siteSucker', {
  state: (): State => state,
  getters: {},
  actions: {
    init() {
      IPC.on('App-SiteSucker-Link').then((key: string, link: LinkItem) => {
        const find = this.links.find((l) => l.url === link.url)
        if (!find) {
          this.links.push(
            reactive({
              url: link.url,
              state: link.state
            })
          )
        } else {
          find.state = link.state
        }
      })
    }
  }
})
