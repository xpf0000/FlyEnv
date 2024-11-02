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
  fetching: {
    nvm: boolean
    fnm: boolean
  }
  fnm: NodeJSItem
  nvm: NodeJSItem
  showInstall: boolean
  switching: boolean
  toolInstalling: boolean
  toolInstallEnd: boolean
  logs: string[]
}

const state: State = {
  tool: '',
  fetching: {
    nvm: false,
    fnm: false
  },
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
    doInstallTool(form: { tool: 'fnm' | 'nvm'; installBy: 'shell' | 'brew' | 'port' }) {
      if (this.toolInstalling) {
        return undefined
      }
      this.toolInstalling = true
      this.logs.splice(0)
      const flag = form.tool
      return new Promise((resolve, reject) => {
        IPC.send('app-fork:node', 'installNvm', flag).then((key: string, res: any) => {
          if (res?.code === 0) {
            IPC.off(key)
            MessageSuccess(I18nT('base.success'))
            this.fetchData(form.tool, true)
            this.toolInstallEnd = true
            resolve(true)
          } else if (res?.code === 1) {
            IPC.off(key)
            this.toolInstalling = false
            MessageError(I18nT('base.fail'))
            reject(new Error('fail'))
          } else if (res?.code === 200) {
            this.logs.push(res?.msg ?? '')
          }
        })
      })
    },
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
    fetchData(tool: 'fnm' | 'nvm', reset = false) {
      if (!tool || this.fetching[tool] || (!reset && this?.[tool]?.all.length > 0)) {
        return
      }
      this.fetching[tool] = true
      let allFetch = false
      let localFetch = false

      IPC.send('app-fork:node', 'allVersion', tool).then((key: string, res: any) => {
        IPC.off(key)
        const item: NodeJSItem = this?.[tool]
        item.all.splice(0)
        item.all = res?.data?.all ?? []
        allFetch = true
        if (allFetch && localFetch) {
          this.fetching[tool] = false
        }
      })

      IPC.send('app-fork:node', 'localVersion', tool).then((key: string, res: any) => {
        IPC.off(key)
        const item: NodeJSItem = this?.[tool]
        item.local.splice(0)
        item.current = ''
        item.local = res?.data?.versions ?? []
        item.current = res?.data?.current ?? ''
        localFetch = true
        if (allFetch && localFetch) {
          this.fetching[tool] = false
        }
      })
    },
    chekTool() {
      IPC.send('app-fork:node', 'nvmDir').then((key: string, res: any) => {
        IPC.off(key)
        this.tool = res?.data ?? ''
        this.showInstall = !this.tool
      })
    }
  }
})
