import { computed, ComputedRef, reactive } from 'vue'
import { Service } from './service'
import { AppStore } from '@web/store/app'
import { BrewStore, SoftInstalled } from '@web/store/brew'
import { ServiceActionStore } from './EXT/store'
import { startService, stopService, AsyncComponentShow, dirname, waitTime } from '@web/fn'
import { MessageError } from '@/util/Element'
import { MysqlStore } from '@web/components/Mysql/mysql'
import type { AllAppModule } from '@web/core/type'

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
    const bin = dirname(item.bin)
    return ServiceActionStore.allPath.includes(bin)
  }

  const isInAppEnv = (item: SoftInstalled) => {
    const bin = dirname(item.bin)
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
  }

  const resetData = () => {
    if (service?.value?.fetching) {
      return
    }
    service.value.fetching = true
    waitTime().then(() => {
      service.value.fetching = false
    })
  }

  const openDir = () => {}

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
    AsyncComponentShow(PhpMyAdminVM).then()
  }

  const fetchData = () => {
    const data = brewStore.module(typeFlag)
    if (service?.value?.fetching || data.installedInited) {
      return
    }
    service.value.fetching = true
    waitTime().then(() => {
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
