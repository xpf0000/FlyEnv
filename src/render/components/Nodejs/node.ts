import { defineStore } from 'pinia'
import IPC from '@/util/IPC'
import { I18nT } from '@shared/lang'
import { MessageError, MessageSuccess } from '@/util/Element'

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
    installOrUninstall(tool: 'fnm' | 'nvm', action: 'install' | 'uninstall', item: any) {
      item.installing = true
      IPC.send('app-fork:node', 'installOrUninstall', tool, action, item.version).then(
        (key: string, res: any) => {
          IPC.off(key)
          if (res?.code === 0) {
            const nodejsItem: NodeJSItem = this?.[tool]
            nodejsItem.current = res?.data?.current ?? ''
            nodejsItem.local = res?.data?.versions ?? []
            MessageSuccess(I18nT('base.success'))
          } else {
            MessageError(I18nT('base.fail'))
          }
          item.installing = false
        }
      )
    },
    versionChange(tool: 'fnm' | 'nvm', item: any) {
      this.switching = true
      item.switching = true
      IPC.send('app-fork:node', 'versionChange', tool, item.version).then(
        (key: string, res: any) => {
          IPC.off(key)
          if (res?.code === 0) {
            const nodejsItem: NodeJSItem = this?.[tool]
            nodejsItem.current = item.version
            MessageSuccess(I18nT('base.success'))
          } else {
            MessageError(I18nT('base.fail'))
          }
          item.switching = false
          this.switching = false
        }
      )
    },
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
