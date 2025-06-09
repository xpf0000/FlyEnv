import { computed, ComputedRef, reactive, watch } from 'vue'
import type { AllAppModule, AppModuleEnum } from '@/core/type'
import type { SoftInstalled } from '@shared/app'
import { AppStore } from '@/store/app'
import IPC from '@/util/IPC'
import { ServiceActionStore } from '@/components/ServiceManager/EXT/store'

export class ModuleSystemInstalledItem implements SoftInstalled {
  typeFlag: AllAppModule = 'dns'
  bin: string = ''
  enable: boolean = true
  error?: string
  source: 'Static' | 'Homebrew' | 'Macports' = 'Static'
  num: number = 0
  path: string = ''
  phpBin?: string
  phpConfig?: string
  phpize?: string
  pid?: string
  run: boolean = false
  running: boolean = false
  version: string = ''

  get isInEnv() {
    return computed(() => ServiceActionStore.isInEnv(this))
  }

  get isInAppEnv() {
    return computed(() => ServiceActionStore.isInAppEnv(this))
  }

  _onStart!: (item: ModuleSystemInstalledItem) => Promise<ModuleSystem>

  constructor(json: SoftInstalled) {
    Object.assign(this, json)
  }

  // 使用箭头函数绑定 this
  start = async (): Promise<string | boolean> => {
    return true
  }

  stop = async (): Promise<string | boolean> => {
    return true
  }

  setEnv = async (): Promise<string | boolean> => {
    return true
  }
}

export class ModuleSystem {
  typeFlag: AllAppModule = 'dns'
  isService: boolean = true
  isOnlyRunOne: boolean = true

  installedFetched: boolean = false

  fetchInstalleding: boolean = false
  fetchEnving: boolean = false

  installedItem: ModuleSystemInstalledItem[] = []

  onItemStart(item: ModuleSystemInstalledItem): Promise<ModuleSystem> {
    return new Promise((resolve) => {
      if (!this.isOnlyRunOne) {
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
      Promise.all(this.installedItem.map((a) => a.stop()))
        .then(() => {
          resolve(this)
        })
        .catch(() => {
          resolve(this)
        })
    })
  }

  fetchInited = () => {
    if (this.installedFetched || this.fetchInstalleding) {
      return
    }
    this.fetchInstalleding = true
    const appStore = AppStore()
    const setup = JSON.parse(JSON.stringify(appStore.config.setup))
    IPC.send('app-fork:version', 'allInstalledVersions', [this.typeFlag], setup).then(
      (key: string, res: any) => {
        IPC.off(key)
        const versions: { [key in AppModuleEnum]: Array<SoftInstalled> } = res?.data ?? {}
        let needSaveConfig = false
        for (const f in versions) {
          const flag: AllAppModule = f as AllAppModule
          const installed = versions[flag]
          const installItems: ModuleSystemInstalledItem[] = installed.map((item) => {
            const find = this.installedItem.find(
              (o) => o.path === item.path && o.version === item.version
            )
            if (find) {
              Object.assign(item, find)
              return find
            } else {
              const installItem = reactive(new ModuleSystemInstalledItem(item))
              installItem._onStart = this.onItemStart
              return installItem as any
            }
          })
          this.installedItem.splice(0)
          this.installedItem.push(...installItems)
          const server = appStore.serverCurrent(flag)
          if (this.typeFlag !== 'php' && this.installedItem.length > 0) {
            const currentVersion = server?.current?.version
            const currentPath = server?.current?.path
            const findCurrent =
              currentVersion &&
              currentPath &&
              this.installedItem.find(
                (d) =>
                  d.version && d.enable && d.version === currentVersion && d.path === currentPath
              )
            if (!findCurrent) {
              const find = this.installedItem.find((d) => d.version && d.enable)
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
      }
    )
  }

  start() {}

  stop() {}

  watchShowHide = () => {
    const appStore = AppStore()
    const show = computed(() => {
      return appStore.config.setup.common.showItem?.[this.typeFlag] !== false
    })

    watch(
      show,
      (v) => {
        if (v) {
          this.fetchInited()
        } else {
          this.stop()
        }
      },
      {
        immediate: true
      }
    )
  }
}
