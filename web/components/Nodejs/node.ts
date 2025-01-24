import { defineStore } from 'pinia'
import { waitTime } from '@web/fn'

export interface NodeJSItem {
  all: Array<string>
  local: Array<string>
  current: string
}

interface State {
  tool: 'fnm' | 'nvm' | 'all' | ''
  fetching: boolean
  fnm: NodeJSItem
  nvm: NodeJSItem
  showInstall: boolean
  switching: boolean
  toolInstalling: boolean
  toolInstallEnd: boolean
  logs: string[]
  all: string[]
  checking: boolean
}

const state: State = {
  checking: false,
  tool: '',
  fetching: false,
  all: [],
  fnm: {
    all: [],
    local: [],
    current: ''
  },
  nvm: {
    all: [],
    local: [],
    current: ''
  },
  showInstall: false,
  switching: false,
  toolInstalling: false,
  toolInstallEnd: false,
  logs: []
}

export const NodejsStore = defineStore('nodejs', {
  state: (): State => state,
  getters: {},
  actions: {
    fetchAll() {
      if (this.all.length > 0) {
        return
      }
      waitTime().then(() => {
        import('@web/config/node').then((res) => {
          this.all.splice(0)
          this.all = JSON.parse(JSON.stringify(res.NodeJSAll))
        })
      })
    },
    chekTool() {
      waitTime().then(() => {
        this.tool = 'all'
        this.showInstall = !this.tool
      })
    }
  }
})
