import { defineStore } from 'pinia'
import { I18nT } from '@shared/lang'
import { MessageSuccess } from '@/util/Element'
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
}

const state: State = {
  tool: '',
  fetching: false,
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
      waitTime().then(() => {
        const version = item.version
        const nodejsItem: NodeJSItem = this?.[tool]
        if (action === 'uninstall') {
          const index = nodejsItem.local.findIndex((f) => f === version)
          if (index >= 0) {
            nodejsItem.local.splice(index, 1)
          }
          if (nodejsItem.current === version) {
            nodejsItem.current = ''
          }
        } else {
          nodejsItem.local.push(version)
        }
        MessageSuccess(I18nT('base.success'))
        item.installing = false
      })
    },
    versionChange(tool: 'fnm' | 'nvm', item: any) {
      this.switching = true
      item.switching = true
      waitTime().then(() => {
        const nodejsItem: NodeJSItem = this?.[tool]
        nodejsItem.current = item.version
        MessageSuccess(I18nT('base.success'))
        item.switching = false
        this.switching = false
      })
    },
    fetchData(tool: 'fnm' | 'nvm', reset = false) {
      if (!tool || this.fetching || (!reset && this?.[tool]?.all.length > 0)) {
        return
      }
      this.fetching = true
      let allFetch = false
      let localFetch = false

      waitTime().then(() => {
        import('@web/config/node').then((res) => {
          const item: NodeJSItem = this?.[tool]
          item.all.splice(0)
          item.all = res.NodeJSAll
          allFetch = true
          if (allFetch && localFetch) {
            this.fetching = false
          }
        })
      })

      waitTime().then(() => {
        import('@web/config/node').then((res) => {
          const item: NodeJSItem = this?.[tool]
          item.local.splice(0)
          item.current = ''
          item.local = res.NodeJSLocal.local
          item.current = res.NodeJSLocal.current
          localFetch = true
          if (allFetch && localFetch) {
            this.fetching = false
          }
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
