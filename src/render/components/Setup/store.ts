import { defineStore } from 'pinia'
import IPC from '@/util/IPC'
import { ElMessage, ElMessageBox } from 'element-plus'
import { I18nT } from '@lang/index'
import { AppStore } from '@/store/app'
import { MessageError } from '@/util/Element'
import { reactive } from 'vue'
import localForage from 'localforage'

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
        localForage.getItem('flyenv-user-github').then((res: any) => {
          if (res) {
            this.githubUser = reactive(res.githubUser)
            this.githubLicense = reactive(res.githubLicense)
          }
        })
        IPC.send('app-fork:app', 'licensesInit').then((key: string, res?: any) => {
          if (res?.code !== 200) {
            IPC.off(key)
          }
          console.log('licensesInit: ', res)
          if (res?.code === 0) {
            const data: any = res?.data
            if (data.requestSuccess) {
              Object.assign(this, res?.data)
              const store = AppStore()
              store.config.setup.license = this.activeCode
              store.saveConfig().then().catch()
            } else {
              this.uuid = data.uuid
              this.isActive = data.isActive
              this.activeCode = data.activeCode
            }
          }
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
        if (res?.code === 1) {
          this.fetching = false
          MessageError(res?.msg ?? I18nT('base.fail'))
          return
        }
        console.log('refreshState: ', res)
        Object.assign(this, res?.data)
        const store = AppStore()
        store.config.setup.license = this.activeCode
        store.saveConfig().then().catch()
        this.fetching = false
        this.githubLicenseFetch()
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
        if (res?.code === 1) {
          MessageError(res?.msg ?? I18nT('base.fail'))
          return
        }
        ElMessage.success(I18nT('setup.requestedTips'))
      })
    },
    githubInfoSave() {
      localForage
        .setItem(
          'flyenv-user-github',
          JSON.parse(
            JSON.stringify({ githubUser: this.githubUser, githubLicense: this.githubLicense })
          )
        )
        .catch()
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
        const store = AppStore()
        store.config.setup.user_uuid = user?.uuid
        store.saveConfig().then().catch()
        this.githubInfoSave()
      })
    },
    githubAuthCancel() {
      IPC.send('GitHub-OAuth-Cancel').then((key) => {
        IPC.off(key)
        this.githubAuthing = false
      })
    },
    githubAuthLogout() {
      ElMessageBox.confirm(I18nT('licenses.logoutTips'), {
        confirmButtonText: I18nT('base.confirm'),
        cancelButtonText: I18nT('base.cancel'),
        type: 'warning'
      }).then(() => {
        this.githubUser = undefined
        this.githubLicense = undefined
        const store = AppStore()
        store.config.setup.user_uuid = ''
        store.saveConfig().then().catch()
        localForage.removeItem('flyenv-user-github').catch()
      })
    },
    githubLicenseFetch() {
      if (this.githubAuthing || !this.githubUser?.uuid) {
        return
      }
      this.githubAuthing = true
      IPC.send('GitHub-OAuth-License-Fetch').then((key, res: any) => {
        IPC.off(key)
        this.githubAuthing = false
        if (res?.code === 0) {
          this.githubLicense = reactive(res?.data ?? [])
          this.githubInfoSave()
        } else if (res?.code === 1) {
          MessageError(res?.msg ?? I18nT('base.fail'))
        }
      })
    },
    githubAuthDelBind(uuid: string, license: string) {
      ElMessageBox.confirm(I18nT('licenses.delBindTips'), {
        confirmButtonText: I18nT('base.confirm'),
        cancelButtonText: I18nT('base.cancel'),
        type: 'warning'
      }).then(() => {
        this.githubAuthing = true
        IPC.send('GitHub-OAuth-License-Del-Bind', uuid, license).then((key: string, res: any) => {
          IPC.off(key)
          this.githubAuthing = false
          if (res?.code === 0) {
            this.githubLicense = reactive(res?.data ?? [])
            this.githubInfoSave()
            if (uuid === this.uuid) {
              const store = AppStore()
              store.config.setup.license = ''
              store.saveConfig().then().catch()
              this.isActive = false
              window.Server.UserUUID = ''
            }
          } else if (res?.code === 1) {
            MessageError(res?.msg ?? I18nT('base.fail'))
          }
        })
      })
    },
    githubAuthAddBind(uuid: string, license: string) {
      ElMessageBox.confirm(I18nT('licenses.addBindTips'), {
        confirmButtonText: I18nT('base.confirm'),
        cancelButtonText: I18nT('base.cancel'),
        type: 'warning'
      }).then(() => {
        this.githubAuthing = true
        IPC.send('GitHub-OAuth-License-Add-Bind', uuid, license).then((key: string, res: any) => {
          IPC.off(key)
          this.githubAuthing = false
          if (res?.code === 0) {
            this.githubLicense = reactive(res?.data ?? [])
            this.githubInfoSave()
            this.refreshState()
          } else if (res?.code === 1) {
            MessageError(res?.msg ?? I18nT('base.fail'))
          }
        })
      })
    }
  }
})
