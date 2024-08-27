import IPC from '@/util/IPC.js'
import { BrewStore, SoftInstalled } from '@/store/brew'
import type { AppSofts } from '@/store/app'
import { AppStore } from '@/store/app'
import { reactive } from 'vue'
import { isEqual } from 'lodash'

type AllAppSofts = keyof typeof AppSofts | 'pure-ftpd' | 'composer'

class InstalledVersions {
  _cb: Array<Function>
  taskRunning: boolean
  runningFlags: Array<Array<AllAppSofts>>
  constructor() {
    this._cb = []
    this.runningFlags = []
    this.taskRunning = false
  }
  allInstalledVersions(flags: Array<AllAppSofts>) {
    if (this.taskRunning && this.runningFlags.find((f) => isEqual(f, flags))) {
      return this
    }
    this.runningFlags.push(flags)
    this.taskRunning = true

    const callBack = () => {
      this._cb.forEach((cb) => {
        if (typeof cb === 'function') {
          cb(true)
        }
      })
      this._cb.splice(0)
      this.runningFlags.splice(0)
      this.taskRunning = false
    }
    const brewStore = BrewStore()
    const appStore = AppStore()
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
        const versions: { [key in AppSofts]: Array<SoftInstalled> } = res?.data ?? {}
        let needSaveConfig = false
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
          console.log('allInstalledVersions installed: ', installed)
          data.installed.splice(0)
          data.installed.push(...installed)
          data.installedInited = true
          old.splice(0)
          const server = appStore.config.server[flag]
          if (flag !== 'php' && data.installed.length > 0) {
            const currentVersion = server?.current?.version
            const currentPath = server?.current?.path
            const findCurrent =
              currentVersion &&
              currentPath &&
              data.installed.find(
                (d) =>
                  d.version && d.enable && d.version === currentVersion && d.path === currentPath
              )
            if (!findCurrent) {
              const find = data.installed.find((d) => d.version && d.enable)
              if (find) {
                appStore.UPDATE_SERVER_CURRENT({
                  flag: flag,
                  data: JSON.parse(JSON.stringify(find))
                })
                needSaveConfig = true
              }
            }
          }
        }
        if (needSaveConfig) {
          appStore.saveConfig()
        }
        callBack()
      }
    )
    return this
  }
  then(cb: Function) {
    this._cb.push(cb)
  }
}

export default new InstalledVersions()
