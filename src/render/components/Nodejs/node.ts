import { defineStore } from 'pinia'
import IPC from '@/util/IPC'

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
      let saved: any = localStorage.getItem(`fetchVerion-nodejs-all`)
      if (saved) {
        saved = JSON.parse(saved)
        const time = Math.round(new Date().getTime() / 1000)
        if (time < saved.expire) {
          const list: string[] = saved.data
          this.all.splice(0)
          this.all.push(...list)
          return
        }
      }
      IPC.send('app-fork:node', 'allVersion').then((key: string, res: any) => {
        IPC.off(key)
        const list = res?.data?.all ?? []
        if (list.length > 0) {
          localStorage.setItem(
            `fetchVerion-nodejs-all`,
            JSON.stringify({
              expire: Math.round(new Date().getTime() / 1000) + 60 * 60,
              data: list
            })
          )
        }
        this.all.splice(0)
        this.all.push(...list)
      })
    },
    chekTool() {
      if (this.checking) {
        return
      }
      this.checking = true
      return new Promise((resolve) => {
        IPC.send('app-fork:node', 'nvmDir').then((key: string, res: any) => {
          IPC.off(key)
          this.tool = res?.data ?? ''
          this.checking = false
          resolve(this.tool)
        })
      })
    }
  }
})
