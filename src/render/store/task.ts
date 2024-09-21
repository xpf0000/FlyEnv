import { defineStore } from 'pinia'
import type { AllAppSofts } from '@/store/app'

type StateBase = Record<
  AllAppSofts,
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

interface State extends StateBase {}

const state: State = {
  java: undefined,
  composer: undefined,
  tomcat: { log: [] },
  postgresql: { log: [] },
  apache: { log: [] },
  memcached: { log: [] },
  mysql: { log: [] },
  mariadb: { log: [] },
  mongodb: { log: [] },
  caddy: { log: [] },
  nginx: { log: [] },
  node: { NVM_DIR: '', btnTxt: '', getVersioning: false, isRunning: false, versions: [] },
  php: {
    currentExtend: '',
    extendAction: '',
    extendRefreshing: false,
    extendRunning: false,
    log: []
  },
  redis: { log: [] },
  'pure-ftpd': { log: [] }
}

export const TaskStore = defineStore('task', {
  state: (): State => state,
  getters: {},
  actions: {}
})
