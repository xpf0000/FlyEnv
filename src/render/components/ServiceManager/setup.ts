import { computed, ComputedRef, reactive } from 'vue'
import { Service } from '@/components/ServiceManager/service'
import { AppHost, AppStore } from '@/store/app'
import { BrewStore, SoftInstalled } from '@/store/brew'
import { ServiceActionStore } from '@/components/ServiceManager/EXT/store'
import installedVersions from '@/util/InstalledVersions'
import { reloadService, startService, stopService } from '@/util/Service'
import { MessageError, MessageSuccess } from '@/util/Element'
import { MysqlStore } from '@/components/Mysql/mysql'
import { I18nT } from '@shared/lang'
import { AsyncComponentShow } from '@/util/AsyncComponent'
import { handleWriteHosts } from '@/util/Host'
import type { AllAppModule } from '@/core/type'

const { shell } = require('@electron/remote')
const { dirname, join } = require('path')

export const Setup = (typeFlag: AllAppModule) => {
  if (!Service[typeFlag]) {
    Service[typeFlag] = {
      fetching: false
    }
  }

  const appStore = AppStore()
  const brewStore = BrewStore()

  const service = computed(() => {
    return Service[typeFlag]
  })

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
    let bin = dirname(item.bin)
    if (typeFlag === 'php') {
      bin = dirname(item?.phpBin ?? join(item.path, 'bin/php'))
    }
    return ServiceActionStore.allPath.includes(bin)
  }

  const isInAppEnv = (item: SoftInstalled) => {
    let bin = dirname(item.bin)
    if (typeFlag === 'php') {
      bin = dirname(item?.phpBin ?? join(item.path, 'bin/php'))
    }
    return ServiceActionStore.appPath.includes(bin)
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
    if (service?.value?.fetching) {
      return
    }
    service.value.fetching = true
    const data = brewStore.module(typeFlag)
    data.installedInited = false
    installedVersions.allInstalledVersions([typeFlag]).then(() => {
      service.value.fetching = false
    })
  }

  const openDir = (dir: string) => {
    shell.openPath(dir)
  }

  const serviceDo = (flag: 'stop' | 'start' | 'restart' | 'reload', item: SoftInstalled) => {
    if (!item?.version || !item?.path) {
      return
    }
    let action: any
    switch (flag) {
      case 'stop':
        action = stopService(typeFlag, item)
        break
      case 'start':
      case 'restart':
        action = startService(typeFlag, item)
        break
      case 'reload':
        action = reloadService(typeFlag, item)
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
        if (currentVersion.value) {
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
        MessageSuccess(I18nT('base.success'))
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
    const toOpenHost = (item: AppHost) => {
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
      shell.openExternal(url)
    }
    const find = appStore.hosts.find((h) => h.name === 'phpmyadmin.phpwebstudy.test')
    if (find) {
      toOpenHost(find)
      return
    }

    AsyncComponentShow(PhpMyAdminVM).then(async (res) => {
      if (res) {
        await appStore.initHost()
        handleWriteHosts().then().catch()
        const url = 'http://phpmyadmin.phpwebstudy.test'
        shell.openExternal(url)
      }
    })
  }

  const fetchData = () => {
    const data = brewStore.module(typeFlag)
    if (service?.value?.fetching || data.installedInited) {
      return
    }
    service.value.fetching = true
    installedVersions.allInstalledVersions([typeFlag]).then(() => {
      service.value.fetching = false
    })
  }

  ServiceActionStore.fetchPath()

  return {
    appStore,
    service,
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
    fetchData
  }
}
