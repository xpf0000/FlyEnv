import { defineStore } from 'pinia'
import type { AllAppModule } from '@/core/type'
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
  pid?: string
  typeFlag: AllAppModule
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
  list: {
    brew: { [key: string]: any }
    port: { [key: string]: any }
    static?: { [key: string]: OnlineVersionItem }
  }
}

type StateBase = Partial<Record<AllAppModule, AppSoftInstalledItem | undefined>>

interface State extends StateBase {
  cardHeadTitle: string
  brewRunning: boolean
  showInstallLog: boolean
  brewSrc: string
  log: Array<string>
  LibUse: { [k: string]: 'brew' | 'port' | 'static' | 'local' }
}

const state: State = {
  cardHeadTitle: '',
  brewRunning: false,
  showInstallLog: false,
  brewSrc: '',
  log: [],
  LibUse: {},
  node: undefined
}

export const BrewStore = defineStore('brew', {
  state: (): State => state,
  getters: {},
  actions: {
    module(flag: AllAppModule): AppSoftInstalledItem {
      if (!this?.[flag]) {
        this[flag] = reactive({
          getListing: false,
          installedInited: false,
          installed: [],
          list: {
            brew: {},
            port: {},
            static: {}
          }
        })
      }
      return this[flag]
    }
  }
})
