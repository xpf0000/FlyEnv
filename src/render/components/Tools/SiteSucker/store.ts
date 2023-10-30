import { defineStore } from 'pinia'
import IPC from '@/util/IPC'
import { reactive } from 'vue'
import { merge } from 'lodash'

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

interface State {
  links: Array<LinkItem>
  commonSetup: SiteSuckerSetup
}

const state: State = {
  links: [],
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
        IPC.send('app-sitesucker-setup').then((key: string, res: any) => {
          IPC.off(key)
          merge(this.commonSetup, res?.commonSetup)
          resolve(true)
        })
      })
    },
    save() {
      IPC.send(
        'app-sitesucker-setup-save',
        JSON.parse(
          JSON.stringify({
            commonSetup: this.commonSetup
          })
        )
      ).then((key: string) => {
        IPC.off(key)
      })
    },
    init() {
      IPC.on('App-SiteSucker-Link').then((key: string, link: LinkItem) => {
        const find = this.links.find((l) => l.url === link.url)
        if (!find) {
          this.links.unshift(
            reactive({
              url: link.url,
              state: link.state
            })
          )
        } else {
          find.state = link.state
          if (link.state === 'replace' || link.state === 'success') {
            const index = this.links.findIndex((f) => f === find)
            if (index > 0) {
              this.links.splice(index, 1)
              this.links.unshift(find)
            }
          }
        }
      })
    }
  }
})
