import { reactive } from 'vue'
import IPC from '@/util/IPC'
import { I18nT } from '@lang/index'
import { MessageError, MessageSuccess } from '@/util/Element'
import type { AppServiceAliasItem, SoftInstalled } from '@shared/app'
import { AsyncComponentShow } from '@/util/AsyncComponent'
import { AppStore } from '@/store/app'
import { isEqual } from 'lodash-es'
import { dirname, join, normalize } from '@/util/path-browserify'
import type { AllAppModule } from '@/core/type'
import Base from '@/core/Base'
import { ModuleInstalledItem } from '@/core/Module/ModuleInstalledItem'
import { BrewStore } from '@/store/brew'
import { staticVersionDel } from '@/util/Version'
import localForage from 'localforage'
import { Setup } from '@/components/Tools/SystenEnv/setup'

let time = 0
export const ServiceActionStore: {
  versionDeling: Record<string, boolean>
  pathSeting: Record<string, boolean>
  allPath: string[]
  appPath: string[]
  fetchPathing: boolean
  fetchPath: () => void
  cleanAlias: () => void
  showAlias: (item: SoftInstalled) => void
  setAlias: (
    service: SoftInstalled,
    item?: AppServiceAliasItem,
    old?: AppServiceAliasItem
  ) => Promise<boolean>
  updatePath: (item: SoftInstalled, typeFlag: string) => Promise<boolean>
  isInEnv: (item: SoftInstalled) => boolean
  isInAppEnv: (item: SoftInstalled) => boolean
  delVersion: (item: SoftInstalled, typeFlag: string) => void
} = reactive({
  versionDeling: {},
  pathSeting: {},
  allPath: [],
  appPath: [],
  fetchPathing: false,
  isInEnv(item: SoftInstalled) {
    let bin = dirname(item.bin)
    if (item?.typeFlag === 'php') {
      bin = dirname(item?.phpBin ?? join(item.path, 'bin/php'))
    }
    const all = ServiceActionStore.allPath.map((s) => normalize(s))
    console.log('isInEnv: ', all, bin)
    return all.includes(bin)
  },
  isInAppEnv(item: SoftInstalled) {
    let bin = dirname(item.bin)
    if (item?.typeFlag === 'php') {
      bin = dirname(item?.phpBin ?? join(item.path, 'bin/php'))
    }
    const arr: string[] = [
      bin,
      dirname(join(item.path, 'bin')),
      join(item.path, 'bin'),
      join(item.path, 'sbin')
    ]
    const all = ServiceActionStore.appPath.map((s) => normalize(s))
    console.log('isInAppEnv: ', all, bin)
    return arr.some((s) => all.includes(s))
  },
  showAlias(item: SoftInstalled) {
    import('./alias.vue').then((res) => {
      AsyncComponentShow(res.default, {
        item
      }).then()
    })
  },
  setAlias(service: SoftInstalled, item?: AppServiceAliasItem, old?: AppServiceAliasItem) {
    return new Promise((resolve, reject) => {
      const store = AppStore()
      IPC.send(
        'app-fork:tools',
        'setAlias',
        JSON.parse(JSON.stringify(service)),
        item ? JSON.parse(JSON.stringify(item)) : undefined,
        old ? JSON.parse(JSON.stringify(old)) : undefined,
        JSON.parse(JSON.stringify(store.config.setup?.alias ?? {}))
      ).then((key: string, res: any) => {
        IPC.off(key)
        if (res?.code === 0) {
          const setup = JSON.parse(JSON.stringify(store.config.setup))
          setup.alias = res.data
          store.config.setup = reactive(setup)
          store.saveConfig().then().catch()
          resolve(true)
        } else {
          MessageError(res?.msg ?? I18nT('base.fail'))
          reject(new Error('fail'))
        }
      })
    })
  },
  cleanAlias() {
    console.trace('cleanAlias !!!')
    if (time > 5) {
      return
    }
    time += 1
    const store = AppStore()
    IPC.send(
      'app-fork:tools',
      'cleanAlias',
      JSON.parse(JSON.stringify(store.config.setup?.alias ?? {}))
    ).then((key: string, res: any) => {
      IPC.off(key)
      if (res?.code === 0) {
        if (!isEqual(res.data, store.config.setup?.alias)) {
          const setup = JSON.parse(JSON.stringify(store.config.setup))
          setup.alias = res.data
          store.config.setup = reactive(setup)
          store.saveConfig().then().catch()
        }
      }
    })
  },
  fetchPath() {
    if (ServiceActionStore.fetchPathing) {
      return
    }
    ServiceActionStore.fetchPathing = true
    IPC.send('app-fork:tools', 'fetchPATH').then((key: string, res: any) => {
      IPC.off(key)
      if (res?.code === 0 && res?.data?.allPath) {
        const all = res?.data?.allPath ?? []
        const app = res?.data?.appPath ?? []
        ServiceActionStore.allPath = reactive([...all])
        ServiceActionStore.appPath = reactive([...app])

        if (window.Server.isWindows) {
          localForage
            .getItem(`flyenv-app-env-dir`)
            .then((res: Record<string, string>) => {
              const list = res || {}
              const set = new Set([...Object.values(list), ...app])
              const appList = Array.from(set)
              ServiceActionStore.appPath = reactive([...appList])
            })
            .catch()
        }

        setTimeout(() => {
          ServiceActionStore.fetchPathing = false
        }, 60000)
      }
    })
  },
  updatePath(item: SoftInstalled, typeFlag: string) {
    return new Promise((resolve, reject) => {
      if (ServiceActionStore.pathSeting?.[item.bin]) {
        return resolve(true)
      }
      ServiceActionStore.pathSeting[item.bin] = true
      let action = 'updatePATH'
      if (window.Server.isWindows) {
        action = ServiceActionStore.appPath.includes(item.path) ? 'removePATH' : 'updatePATH'
      }
      IPC.send('app-fork:tools', action, JSON.parse(JSON.stringify(item)), typeFlag).then(
        (key: string, res: any) => {
          IPC.off(key)
          delete ServiceActionStore.pathSeting?.[item.bin]
          if (res?.code === 0) {
            const all = res?.data?.allPath ?? []
            const app = res?.data?.appPath ?? []
            ServiceActionStore.allPath = reactive([...all])
            ServiceActionStore.appPath = reactive([...app])

            if (window.Server.isWindows) {
              localForage
                .getItem(`flyenv-app-env-dir`)
                .then((res: Record<string, string>) => {
                  const list = res || {}
                  if (action === 'removePATH') {
                    delete list?.[typeFlag]
                  } else {
                    list[typeFlag] = item.path
                  }

                  const set = new Set([...Object.values(list), ...app])
                  const appList = Array.from(set)
                  localForage.setItem(`flyenv-app-env-dir`, list).then().catch()
                  ServiceActionStore.appPath = reactive([...appList])
                })
                .catch()
              Setup.fetchList()
            }

            MessageSuccess(I18nT('base.success'))
            resolve(true)
          } else {
            const msg = res?.msg ?? I18nT('base.fail')
            MessageError(msg)
            reject(new Error(msg))
          }
        }
      )
    })
  },
  delVersion(item: ModuleInstalledItem, type: AllAppModule) {
    if (ServiceActionStore.versionDeling?.[item.bin]) {
      return
    }
    ServiceActionStore.versionDeling[item.bin] = true
    const store = AppStore()
    const brewStore = BrewStore()
    const module = brewStore.module(type)
    if (item.isLocal7Z) {
      Base._Confirm(I18nT('service.bundleinVersionDelTips'), undefined, {
        customClass: 'confirm-del',
        type: 'warning'
      })
        .then(async () => {
          if (item.run) {
            item.stop().catch()
          }
          const setup = JSON.parse(JSON.stringify(store.config.setup))
          if (!setup.excludeLocalVersion) {
            setup.excludeLocalVersion = []
          }
          const arr: Set<string> = new Set(setup.excludeLocalVersion)
          arr.add(`${type}-${item.version}`)
          setup.excludeLocalVersion = [...arr]
          store.config.setup = reactive(setup)
          await store.saveConfig()
          module.installedFetched = false
          module.fetchInstalled().catch()
        })
        .catch()
        .finally(() => {
          delete ServiceActionStore.versionDeling[item.bin]
        })
    } else if (store.config.setup?.[type]?.dirs?.some((d) => item.bin.includes(d))) {
      Base._Confirm(I18nT('service.customDirVersionDelTips'), undefined, {
        customClass: 'confirm-del',
        type: 'warning'
      })
        .then(async () => {
          if (item.run) {
            item.stop().catch()
          }
          const setup = JSON.parse(JSON.stringify(store.config.setup))
          const index = setup?.[type]?.dirs?.findIndex((d: string) => item.bin.includes(d))
          if (index >= 0) {
            setup?.[type]?.dirs?.splice(index, 1)
          }
          store.config.setup = reactive(setup)
          await store.saveConfig()
          module.installedFetched = false
          module.fetchInstalled().catch()
        })
        .catch()
        .finally(() => {
          delete ServiceActionStore.versionDeling[item.bin]
        })
    } else {
      staticVersionDel(item.path)
    }
  }
})
