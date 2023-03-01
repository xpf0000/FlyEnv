import IPC from '@/util/IPC.js'
import { BrewStore, SoftInstalled } from '@/store/brew'
import type { AppSofts } from '@/store/app'
import { AppStore } from '@/store/app'
import { reactive } from 'vue'

class InstalledVersions {
  _cb: Array<Function>
  taskRunning: boolean
  constructor() {
    this._cb = []
    this.taskRunning = false
  }
  allInstalledVersions(flags: Array<keyof typeof AppSofts>) {
    if (this.taskRunning) {
      return this
    }
    this.taskRunning = true

    const callBack = () => {
      this._cb.forEach((cb) => {
        if (typeof cb === 'function') {
          cb(true)
        }
      })
      this._cb = []
      this.taskRunning = false
    }
    const brewStore = BrewStore()
    const setup = JSON.parse(JSON.stringify(AppStore().config.setup))
    const arrs = flags.filter((f) => !brewStore[f].installedInited)
    if (arrs.length === 0) {
      setTimeout(() => {
        callBack()
      }, 30)
      return this
    }
    IPC.send('app-fork:version', 'allInstalledVersions', arrs, setup).then(
      (key: string, res: any) => {
        IPC.off(key)
        const versions: { [key in AppSofts]: Array<SoftInstalled> } = res?.versions ?? {}
        for (const f in versions) {
          const flag: keyof typeof AppSofts = f as keyof typeof AppSofts
          let installed = versions[flag]
          const data = brewStore[flag]
          const old = [...data.installed]
          installed = installed.map((item) => {
            const find = old.find((o) => o.path === item.path && o.version === item.version)
            Object.assign(item, find)
            return reactive(item)
          })
          data.installed.splice(0)
          data.installed.push(...installed)
          data.installedInited = true
          old.splice(0)
          callBack()
        }
      }
    )
    return this
  }
  then(cb: Function) {
    this._cb.push(cb)
  }
}

export default new InstalledVersions()
