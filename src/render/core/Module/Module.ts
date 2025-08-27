import { computed, reactive, watch } from 'vue'
import type { AllAppModule, AppModuleEnum } from '@/core/type'
import type { CallbackFn, SoftInstalled } from '@shared/app'
import { AppStore } from '@/store/app'
import IPC from '@/util/IPC'
import { ModuleInstalledItem } from '@/core/Module/ModuleInstalledItem'
import { ModuleHomebrewItem } from '@/core/Module/ModuleHomebrewItem'
import { ModuleMacportsItem } from '@/core/Module/ModuleMacportsItem'
import { ModuleStaticItem } from '@/core/Module/ModuleStaticItem'
import { brewInfo, fetchVerion, portInfo } from '@/util/Brew'

type ExtParamFn = (item: ModuleInstalledItem) => Promise<any>

export class Module {
  typeFlag: AllAppModule = 'dns'
  isService: boolean = true
  isOnlyRunOne: boolean = true

  installedFetched: boolean = false

  fetchInstalleding: boolean = false
  fetchEnving: boolean = false

  startExtParam?: ExtParamFn
  stopExtParam?: ExtParamFn

  installed: ModuleInstalledItem[] = []

  brew: ModuleHomebrewItem[] = []
  port: ModuleMacportsItem[] = []
  static: ModuleStaticItem[] = []

  staticDowing: ModuleStaticItem[] = []

  brewFetching: boolean = false
  portFetching: boolean = false
  staticFetching: boolean = false

  onItemStart(item: ModuleInstalledItem): Promise<Module> {
    return new Promise((resolve) => {
      if (!this.isOnlyRunOne) {
        console.log('onItemStart exit: ', this.typeFlag)
        resolve(this)
        return
      }
      const appStore = AppStore()
      const current = appStore.serverCurrent(this.typeFlag)
      if (
        current?.current?.version !== item.version ||
        current?.current?.path !== item.path ||
        current?.current?.bin !== item.bin
      ) {
        appStore.UPDATE_SERVER_CURRENT({
          flag: this.typeFlag,
          data: JSON.parse(JSON.stringify(item))
        })
        appStore.saveConfig().catch()
      }
      Promise.all(this.installed.map((a) => a.stop()))
        .then(() => {
          resolve(this)
        })
        .catch(() => {
          resolve(this)
        })
    })
  }

  private _fetchInstalledResolves: CallbackFn[] = []

  fetchInstalled(): Promise<boolean> {
    return new Promise((resolve) => {
      if (this.installedFetched) {
        resolve(true)
        return
      }
      if (this.fetchInstalleding) {
        this._fetchInstalledResolves.push(resolve)
        return
      }
      console.log('fetchInstalled run: ', this.typeFlag)
      this.fetchInstalleding = true
      const appStore = AppStore()
      const setup = JSON.parse(JSON.stringify(appStore.config.setup))
      const excludeLocalVersion = setup?.excludeLocalVersion ?? []
      IPC.send('app-fork:version', 'allInstalledVersions', [this.typeFlag], setup).then(
        (key: string, res: any) => {
          IPC.off(key)
          const versions: { [key in AppModuleEnum]: Array<SoftInstalled> } = res?.data ?? {}
          let needSaveConfig = false
          for (const f in versions) {
            const flag: AllAppModule = f as AllAppModule
            const installed = versions[flag]
            const installItems: ModuleInstalledItem[] = installed
              .filter((v) => {
                return (
                  !v?.isLocal7Z ||
                  (v?.isLocal7Z && !excludeLocalVersion.includes(`${flag}-${v.version}`))
                )
              })
              .map((item) => {
                const find = this.installed.find(
                  (o) => o.path === item.path && o.version === item.version
                )
                if (find) {
                  const copy: any = { ...item }
                  delete copy?.run
                  delete copy?.running
                  Object.assign(find, copy)
                  return find
                } else {
                  const installItem = reactive(new ModuleInstalledItem(item))
                  installItem.typeFlag = this.typeFlag
                  installItem.start = installItem.start.bind(installItem)
                  installItem.stop = installItem.stop.bind(installItem)
                  installItem.setEnv = installItem.setEnv.bind(installItem)
                  installItem._onStart = this.onItemStart
                  return installItem as any
                }
              })
            this.installed.splice(0)
            this.installed.push(...installItems)
            // this.installed = installItems as any
            console.log('this.installed: ', this.installed, this.typeFlag, this)
            const server = appStore.serverCurrent(flag)
            if (this.typeFlag !== 'php' && this.installed.length > 0) {
              const currentVersion = server?.current?.version
              const currentPath = server?.current?.path
              const findCurrent =
                currentVersion &&
                currentPath &&
                this.installed.find(
                  (d) =>
                    d.version && d.enable && d.version === currentVersion && d.path === currentPath
                )
              if (!findCurrent) {
                const find = this.installed.find((d) => d.version && d.enable)
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
            appStore.saveConfig().catch()
          }
          this.installedFetched = true
          this.fetchInstalleding = false
          this._fetchInstalledResolves.forEach((f) => f(true))
          this._fetchInstalledResolves.splice(0)
          resolve(true)
        }
      )
    })
  }

  fetchBrew() {
    if (this.brewFetching) {
      return
    }
    this.brewFetching = true
    brewInfo(this.typeFlag)
      .then((res: any) => {
        for (const item of res) {
          const find = this.brew.find((d) => d.name === item.name && d.version === item.version)
          if (!find) {
            const obj = reactive(new ModuleHomebrewItem(item))
            obj.typeFlag = this.typeFlag
            obj.fetchCommand = obj.fetchCommand.bind(obj)
            obj.copyCommand = obj.copyCommand.bind(obj)
            obj.runCommand = obj.runCommand.bind(obj)
            this.brew.push(obj)
          } else {
            Object.assign(find, item)
          }
        }
        this.brewFetching = false
      })
      .catch(() => {
        this.brewFetching = false
      })
  }

  fetchPort() {
    if (this.portFetching) {
      return
    }
    this.portFetching = true
    portInfo(this.typeFlag)
      .then((res: any) => {
        for (const item of res) {
          const find = this.port.find((d) => d.name === item.name && d.version === item.version)
          if (!find) {
            const obj = reactive(new ModuleMacportsItem(item))
            obj.typeFlag = this.typeFlag
            obj.fetchCommand = obj.fetchCommand.bind(obj)
            obj.copyCommand = obj.copyCommand.bind(obj)
            obj.runCommand = obj.runCommand.bind(obj)
            this.port.push(obj)
          } else {
            Object.assign(find, item)
          }
        }
        this.portFetching = false
      })
      .catch(() => {
        this.portFetching = false
      })
  }

  fetchStatic() {
    if (this.staticFetching) {
      return
    }
    this.staticFetching = true
    fetchVerion(this.typeFlag)
      .then((res: any) => {
        console.log('fetchVerion res: ', res)
        for (const item of res) {
          const find = this.static.find(
            (d) => d.url === item.url && d.version === item.version && d.bin === item.bin
          )
          if (!find) {
            const findDowing = this.staticDowing.find(
              (d) => d.url === item.url && d.version === item.version && d.bin === item.bin
            )
            if (findDowing) {
              this.static.push(findDowing)
            } else {
              const obj = reactive(new ModuleStaticItem(item))
              obj.typeFlag = this.typeFlag
              obj.fetchCommand = obj.fetchCommand.bind(obj)
              obj.copyCommand = obj.copyCommand.bind(obj)
              obj.runCommand = obj.runCommand.bind(obj)
              this.static.push(obj)
            }
          } else {
            console.log('find: ', find, item)
            const downing = find?.downing ?? false
            Object.assign(find, item)
            find.downing = downing
          }
        }
        this.staticFetching = false
      })
      .catch(() => {
        this.staticFetching = false
      })
  }

  start(): Promise<string | boolean> {
    return new Promise((resolve) => {
      if (this.installed.length === 0) {
        resolve(true)
        return
      }
      console.log('start: ', this, this.typeFlag, this.isOnlyRunOne)
      if (!this.isOnlyRunOne) {
        Promise.all(this.installed.map((a) => a.start()))
          .then((arrs) => {
            const err = arrs.filter((a) => typeof a === 'string')
            if (err.length) {
              resolve(err.join('\n'))
            } else {
              resolve(true)
            }
          })
          .catch((e) => {
            resolve(e.toString())
          })
        return
      }
      const appStore = AppStore()
      const server = appStore.serverCurrent(this.typeFlag)
      let find = this.installed.find(
        (f) =>
          f.version === server?.current?.version &&
          f.path === server?.current?.path &&
          f.bin === server?.current?.bin
      )
      if (!find) {
        find = this.installed.find((d) => d.version && d.enable)
        if (find) {
          appStore.UPDATE_SERVER_CURRENT({
            flag: this.typeFlag,
            data: JSON.parse(JSON.stringify(find))
          })
          appStore.saveConfig().catch()
        }
      }
      find!
        .start()
        .then((res) => {
          resolve(res)
        })
        .catch((e) => {
          resolve(e.toString())
        })
    })
  }

  stop(): Promise<string | boolean> {
    return new Promise((resolve) => {
      if (!this.installed.length) {
        resolve(true)
        return
      }
      Promise.all(this.installed.map((a) => a.stop()))
        .then(() => {
          resolve(true)
        })
        .catch(() => {
          resolve(true)
        })
    })
  }

  watchShowHide() {
    const appStore = AppStore()
    const show = computed(() => {
      return appStore.config.setup.common.showItem?.[this.typeFlag] !== false
    })

    watch(
      show,
      (v) => {
        console.log('watchShowHide show: ', v, this.typeFlag)
        if (v) {
          this.fetchInstalled()
        } else {
          if (this.installed.length > 0) {
            this.stop()
          }
        }
      },
      {
        immediate: true
      }
    )
  }
}
