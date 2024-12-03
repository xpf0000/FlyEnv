import { defineStore } from 'pinia'
import IPC from '@/util/IPC'
import { ElMessage } from 'element-plus'
import { I18nT } from '@shared/lang'

interface State {
  tab: string
  uuid: string
  activeCode: string
  isActive: boolean
  message: string
  fetching: boolean
}

const state: State = {
  tab: '',
  uuid: '',
  activeCode: '',
  isActive: false,
  message: '',
  fetching: false
}

export const SetupStore = defineStore('setup', {
  state: (): State => state,
  getters: {},
  actions: {
    init() {
      this.message = localStorage.getItem('flyenv-licenses-post-message') ?? ''
      IPC.send('app-fork:app', 'licensesInit').then((key: string, res?: any) => {
        if (res?.code !== 200) {
          IPC.off(key)
        }
        console.log('licensesInit: ', res)
        Object.assign(this, res?.data)
      })
    },
    refreshState() {
      if (this.fetching) {
        return
      }
      this.fetching = true
      IPC.send('app-fork:app', 'licensesState').then((key: string, res?: any) => {
        if (res?.code !== 200) {
          IPC.off(key)
        }
        console.log('refreshState: ', res)
        Object.assign(this, res?.data)
        this.fetching = false
      })
    },
    postRequest() {
      if (this.fetching) {
        return
      }
      this.fetching = true
      const msg = this.message.trim()
      localStorage.setItem('flyenv-licenses-post-message', msg)
      IPC.send('app-fork:app', 'licensesRequest', msg).then((key: string, res?: any) => {
        IPC.off(key)
        console.log('postRequest: ', res)
        this.fetching = false
        ElMessage.success(I18nT('setup.requestedTips'))
      })
    }
  }
})
