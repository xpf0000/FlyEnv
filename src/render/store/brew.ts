import { defineStore } from 'pinia'
import type { AllAppModule } from '@/core/type'
import { AppStore } from '@/store/app'
import type { Module } from '@/core/Module/Module'
import { ModuleInstalledItem } from '@/core/Module/ModuleInstalledItem'

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

type State = {
  cardHeadTitle: string
  brewRunning: boolean
  showInstallLog: boolean
  brewSrc: string
  log: Array<string>
  LibUse: { [k: string]: 'brew' | 'port' | 'static' | 'local' }
  modules: Record<AllAppModule, Module>
}

const state: State = {
  cardHeadTitle: '',
  brewRunning: false,
  showInstallLog: false,
  brewSrc: '',
  log: [],
  LibUse: {},
  modules: {} as Record<AllAppModule, Module>
}

export const BrewStore = defineStore('brew', {
  state: (): State => state,
  getters: {},
  actions: {
    module(flag: AllAppModule): Module {
      return this.modules[flag] as any
    },
    currentVersion(flag: AllAppModule): ModuleInstalledItem | undefined {
      const appStore = AppStore()
      const current = appStore.config.server?.[flag]?.current
      const installed = this.module(flag).installed
      if (!current) {
        if (!installed.length) {
          return undefined
        }
        const find = installed[0]
        appStore.UPDATE_SERVER_CURRENT({
          flag,
          data: JSON.parse(JSON.stringify(find))
        })
        appStore.saveConfig().catch()
        return find
      }
      return installed?.find((i) => i.path === current?.path && i.version === current?.version)
    }
  }
})
