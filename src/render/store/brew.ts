import { defineStore } from 'pinia'
import type { AllAppModule } from '@/core/type'
import { AppStore } from '@/store/app'
import { Module } from '@/core/Module/Module'
import { ModuleInstalledItem } from '@/core/Module/ModuleInstalledItem'
import { reactive } from 'vue'
import { AppModules } from '@/core/App'

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
  note?: string
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
  channel?: 'stable' | 'beta' | 'dev'
  downing?: boolean
}

type State = {
  cardHeadTitle: string
  brewRunning: boolean
  showInstallLog: boolean
  brewSrc: string
  log: Array<string>
  LibUse: { [k: string]: 'brew' | 'port' | 'static' | 'local' | 'sdkman' }
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
      const find = AppModules?.find((f) => f.typeFlag === flag)
      const existing = this?.modules?.[flag]
      if (existing) {
        // Plugin modules are hot-removed/re-added on disable/enable. A record
        // created while the plugin was absent from AppModules has isPlugin=false
        // and fetches through the wrong fork channel (app-fork:version), which
        // never returns data for the plugin. Reconcile the flags in place so
        // live component references stay valid.
        const isPlugin = !!find?.plugin
        if (existing.isPlugin !== isPlugin) {
          existing.isPlugin = isPlugin
          existing.isService = find?.isService ?? false
          existing.isOnlyRunOne = find?.isOnlyRunOne !== false
          existing.installed.splice(0)
          existing.installedFetched = false
        }
        return existing as any
      }
      const module = reactive(new Module())
      module.typeFlag = flag
      module.isService = find?.isService ?? false
      module.isOnlyRunOne = find?.isOnlyRunOne !== false
      module.isPlugin = !!find?.plugin
      module.fetchInstalled = module.fetchInstalled.bind(module)
      module.onItemStart = module.onItemStart.bind(module)
      module.fetchBrew = module.fetchBrew.bind(module)
      module.fetchPort = module.fetchPort.bind(module)
      module.fetchStatic = module.fetchStatic.bind(module)
      module.fetchSdkman = module.fetchSdkman.bind(module)
      module.start = module.start.bind(module)
      module.stop = module.stop.bind(module)
      module.watchShowHide = module.watchShowHide.bind(module)
      this.modules[module.typeFlag] = module
      module.watchShowHide()
      return this.modules[flag] as any
    },
    currentVersion(flag: AllAppModule): ModuleInstalledItem | undefined {
      const exclude = ['dns', 'ftp-srv', 'pure-ftpd']
      if (exclude.includes(flag)) {
        return {
          version: '1.0',
          bin: flag
        } as any
      }
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
