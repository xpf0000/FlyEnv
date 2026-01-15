import { defineStore } from 'pinia'
import IPC from '@/util/IPC'
import { ElMessage } from 'element-plus'
import { I18nT } from '@lang/index'
import { AppStore } from '@/store/app'
import { MessageError } from '@/util/Element'
import { reactive } from 'vue'

type GitHubUser = {
  uuid: string
  avatar_url: string
  login: string
}

type GitHubLicenseItem = {
  uuid: string
  license: string
}

interface State {
  tab: string
  uuid: string
  activeCode: string
  isActive: boolean
  message: string
  fetching: boolean
  githubAuthing: boolean

  githubUser?: GitHubUser
  githubLicense?: GitHubLicenseItem[]
}

const state: State = {
  tab: 'base',
  uuid: '',
  activeCode: '',
  isActive: false,
  message: '',
  fetching: false,
  githubAuthing: false
}

export const SetupStore = defineStore('setup', {
  state: (): State => state,
  getters: {},
  actions: {
    init() {
      return new Promise<void>((resolve) => {
        this.message = localStorage.getItem('flyenv-licenses-post-message') ?? ''
        IPC.send('app-fork:app', 'licensesInit').then((key: string, res?: any) => {
          if (res?.code !== 200) {
            IPC.off(key)
          }
          console.log('licensesInit: ', res)
          Object.assign(this, res?.data)
          const store = AppStore()
          store.config.setup.license = this.activeCode
          store.saveConfig().then().catch()
          resolve()
        })
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
        const store = AppStore()
        store.config.setup.license = this.activeCode
        store.saveConfig().then().catch()
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
    },
    githubAuthStart() {
      if (this.githubAuthing) {
        return
      }
      this.githubAuthing = true
      IPC.send('GitHub-OAuth-Start').then((key, res?: any) => {
        IPC.off(key)
        this.githubAuthing = false
        if (res?.code === 1) {
          MessageError(res?.msg ?? I18nT('base.fail'))
          return
        }
        const user = reactive(res?.data?.user ?? {})
        const license = reactive(res?.data?.license ?? [])
        this.githubUser = user
        this.githubLicense = license
      })
    },
    githubAuthCancel() {
      IPC.send('GitHub-OAuth-Cancel').then((key) => {
        IPC.off(key)
        this.githubAuthing = false
      })
    }
  }
})
