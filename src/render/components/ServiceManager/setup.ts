import { computed, ComputedRef, reactive } from 'vue'
import { AppStore } from '@/store/app'
import { BrewStore, SoftInstalled } from '@/store/brew'
import { ServiceActionStore } from '@/components/ServiceManager/EXT/store'
import { MessageError } from '@/util/Element'
import { MysqlStore } from '@/components/Mysql/mysql'
import { AsyncComponentShow } from '@/util/AsyncComponent'
import type { AllAppModule } from '@/core/type'
import { shell } from '@/util/NodeFn'
import { ModuleInstalledItem } from '@/core/Module/ModuleInstalledItem'

export const Setup = (typeFlag: AllAppModule) => {
  const appStore = AppStore()
  const brewStore = BrewStore()

  const versions = computed(() => {
    return brewStore.module(typeFlag).installed
  })

  const version = computed(() => {
    const flag = typeFlag
    const server: any = appStore.config.server
    return server?.[flag]?.current
  })

  const currentVersion: ComputedRef<SoftInstalled | undefined> = computed(() => {
    return brewStore
      .module(typeFlag)
      ?.installed?.find(
        (i) => i.path === version?.value?.path && i.version === version?.value?.version
      )
  })

  const versionRunning = computed(() => {
    return brewStore.module(typeFlag)?.installed?.some((f) => f.running)
  })

  const isInEnv = (item: SoftInstalled) => {
    return ServiceActionStore.isInEnv(item)
  }

  const isInAppEnv = (item: SoftInstalled) => {
    return ServiceActionStore.isInAppEnv(item)
  }

  const groupTrunOn = (item: SoftInstalled) => {
    const dict = JSON.parse(JSON.stringify(appStore.phpGroupStart))
    const key = item.bin
    if (dict?.[key] === false) {
      dict[key] = true
      delete dict?.[key]
    } else {
      dict[key] = false
    }
    appStore.config.setup.phpGroupStart = reactive(dict)
    appStore.saveConfig().then().catch()
  }

  const resetData = () => {
    const data = brewStore.module(typeFlag)
    data.installedFetched = false
    data.fetchInstalled().catch()
  }

  const openDir = (dir: string) => {
    shell.openPath(dir)
  }

  const serviceDo = (flag: 'stop' | 'start' | 'restart' | 'reload', item: ModuleInstalledItem) => {
    if (!item?.version || !item?.path) {
      return
    }
    let action: any
    switch (flag) {
      case 'stop':
        action = item.stop()
        break
      case 'start':
        action = item.start()
        break
      case 'restart':
        action = item.restart()
        break
    }
    action.then((res: any) => {
      if (typeof res === 'string') {
        MessageError(res)
      } else {
        if (typeFlag === 'mysql') {
          const mysqlStore = MysqlStore()
          if (flag === 'stop') {
            mysqlStore.groupStop().then()
          } else {
            mysqlStore.groupStart().then()
          }
        }
        if (typeFlag !== 'php' && currentVersion.value) {
          currentVersion.value.run = false
          currentVersion.value.running = false
        }
        if (flag === 'stop') {
          item.run = false
          item.running = false
        } else {
          item.run = true
          item.running = false
          if (
            item.version !== currentVersion.value?.version ||
            item.path !== currentVersion.value?.path
          ) {
            appStore.UPDATE_SERVER_CURRENT({
              flag: typeFlag,
              data: JSON.parse(JSON.stringify(item))
            })
            appStore.saveConfig()
          }
        }
      }
    })
  }

  let CustomPathVM: any
  import('./customPath.vue').then((res) => {
    CustomPathVM = res.default
  })
  const showCustomDir = () => {
    AsyncComponentShow(CustomPathVM, {
      flag: typeFlag
    }).then((res) => {
      if (res) {
        console.log('showCustomDir chagned !!!')
        resetData()
      }
    })
  }

  let PhpMyAdminVM: any
  import('./phpMyAdmin.vue').then((res) => {
    PhpMyAdminVM = res.default
  })
  const toPhpMyAdmin = () => {
    const toOpenHost = () => {
      const item = appStore.hosts.find((h) => h.isAppPHPMyAdmin === true)
      if (!item) {
        return false
      }
      const host = item.name
      const brewStore = BrewStore()
      const nginxRunning = brewStore.module('nginx').installed.find((i) => i.run)
      const apacheRunning = brewStore.module('apache').installed.find((i) => i.run)
      const caddyRunning = brewStore.module('caddy').installed.find((i) => i.run)
      let http = 'http://'
      let port = 80
      if (item.useSSL) {
        http = 'https://'
        port = 443
        if (nginxRunning) {
          port = item.port.nginx_ssl
        } else if (apacheRunning) {
          port = item.port.apache_ssl
        } else if (caddyRunning) {
          port = item.port.caddy_ssl
        }
      } else {
        if (nginxRunning) {
          port = item.port.nginx
        } else if (apacheRunning) {
          port = item.port.apache
        } else if (caddyRunning) {
          port = item.port.caddy
        }
      }

      const portStr = port === 80 || port === 443 ? '' : `:${port}`
      const url = `${http}${host}${portStr}`
      shell.openExternal(url).catch()
      return true
    }
    if (toOpenHost()) {
      return
    }
    AsyncComponentShow(PhpMyAdminVM).then(async (res) => {
      if (res) {
        toOpenHost()
      }
    })
  }

  const fetchData = () => {
    const data = brewStore.module(typeFlag)
    data.fetchInstalled().catch()
  }

  const fetching = computed(() => {
    const module = brewStore.module(typeFlag)
    return module.fetchInstalleding
  })

  ServiceActionStore.fetchPath()

  return {
    appStore,
    versions,
    versionRunning,
    isInEnv,
    isInAppEnv,
    groupTrunOn,
    openDir,
    serviceDo,
    showCustomDir,
    toPhpMyAdmin,
    currentVersion,
    resetData,
    fetchData,
    fetching
  }
}
