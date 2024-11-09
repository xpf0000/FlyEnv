import { reactive, watch } from 'vue'
import type { AppHost } from '@web/store/app'
import { AppStore } from '@web/store/app'

export const RewriteAll: { [key: string]: any } = {}

export type HostProjectType = 'php' | 'java' | 'node' | 'go' | 'python' | 'html' | 'tomcat'

type HostState = {
  running: boolean
  isRun: boolean
}

type HostStoreType = {
  index: number
  tab: HostProjectType
  _list: Record<HostProjectType, AppHost[]>
  _state: Record<string | number, HostState>
  tabList: (tab: HostProjectType) => AppHost[]
  updateCurrentList: () => void
  save: () => void
  state: (id: string | number) => HostState
}

export const HostStore: HostStoreType = reactive({
  index: 1,
  tab: 'php',
  _list: {},
  _state: {},
  state(id: string | number) {
    if (!this._state[id]) {
      this._state[id] = reactive({
        running: false,
        isRun: false
      })
    }
    return this._state[id]
  },
  updateCurrentList() {
    delete this._list[this.tab]
    this.index += 1
  },
  tabList(tab: HostProjectType) {
    if (!this._list[tab]) {
      const store = AppStore()
      const list = store.hosts.filter((h) => h.type === tab || (!h.type && tab === 'php'))
      this._list[tab] = reactive(list)
    }
    return this._list[tab]
  },
  save() {
    const store = AppStore()
    const list = Object.values(this._list).flat()
    const arr = store.hosts.filter((h) => !list.find((f) => f.id === h.id))
    arr.push(...list)
    store.hosts = reactive(arr)
  }
} as HostStoreType)

const tab: any = localStorage.getItem('PWS-HOST-TAB')
if (tab) {
  HostStore.tab = tab
}

watch(
  () => HostStore.tab,
  (v) => {
    localStorage.setItem('PWS-HOST-TAB', v)
  }
)
