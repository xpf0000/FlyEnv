import { AllAppModule } from '@/core/type'
import { defineStore } from 'pinia'
import { reactive } from 'vue'

export interface SoftInstalled {
  version: string | null
  bin: string
  path: string
  num: number | null
  error?: string
  enable: boolean
  run: boolean
  running: boolean
  phpBin?: string
  phpConfig?: string
  phpize?: string
  flag?: string
  isLocal7Z?: boolean
}

export interface OnlineVersionItem {
  appDir: string
  zip: string
  bin: string
  downloaded: boolean
  installed: boolean
  url: string
  version: string
  mVersion: string
  downing?: boolean
}

export interface AppSoftInstalledItem {
  getListing: boolean
  installedInited: boolean
  installed: Array<SoftInstalled>
  list: OnlineVersionItem[]
}

type StateBase = Partial<Record<AllAppModule, AppSoftInstalledItem | undefined>>

interface State extends StateBase {
  cardHeadTitle: string
  brewRunning: boolean
  showInstallLog: boolean
  brewSrc: string
  log: Array<string>
  LibUse: { [k: string]: 'brew' | 'port' }
}

const state: State = {
  cardHeadTitle: '',
  brewRunning: false,
  showInstallLog: false,
  brewSrc: '',
  log: [],
  LibUse: {},
  redis: {
    getListing: false,
    installedInited: false,
    installed: [],
    list: []
  }
}

export const BrewStore = defineStore('brew', {
  state: (): State => state,
  getters: {},
  actions: {
    module(flag: AllAppModule) {
      if (!this?.[flag]) {
        this[flag] = reactive({
          getListing: false,
          installedInited: false,
          installed: [],
          list: []
        })
      }
      return this[flag]
    }
  }
})
