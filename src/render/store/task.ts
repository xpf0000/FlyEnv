import { reactive } from 'vue'
import { AllAppModule } from '@/core/type'
import { defineStore } from 'pinia'

type StateBase = Partial<
  Record<
    AllAppModule,
    | {
        log?: Array<string>
        extendRunning?: boolean
        currentExtend?: string
        extendAction?: string
        extendRefreshing?: boolean

        isRunning?: boolean
        getVersioning?: boolean
        btnTxt?: string
        versions?: Array<string>
        NVM_DIR?: string
        tool?: 'fnm' | 'nvm' | 'all'
      }
    | undefined
  >
>

interface State extends StateBase {}

const state: State = {
  node: { NVM_DIR: '', btnTxt: '', getVersioning: false, isRunning: false, versions: [] },
  php: {
    currentExtend: '',
    extendAction: '',
    extendRefreshing: false,
    extendRunning: false,
    log: []
  }
}

export const TaskStore = defineStore('task', {
  state: (): State => state,
  getters: {},
  actions: {
    module(flag: AllAppModule) {
      if (!this?.[flag]) {
        this[flag] = reactive({
          log: []
        })
      }
      return this[flag]
    }
  }
})
