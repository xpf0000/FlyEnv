import { computed, ref } from 'vue'
import { BrewStore, SoftInstalled } from '@web/store/brew'
import { I18nT } from '@shared/lang'
import type { AllAppModule } from '@web/core/type'
import { VersionManagerStore } from '@web/components/VersionManager/store'
import { ServiceActionStore } from '@web/components/ServiceManager/EXT/store'
import { dirname, staticVersionDel, waitTime } from '@web/fn'

export const SetupAll = (typeFlag: AllAppModule) => {
  const brewStore = BrewStore()

  const showNextBtn = ref(false)
  const logs = ref()

  const cardHeadTitle = computed(() => {
    return brewStore.cardHeadTitle
  })
  const brewRunning = computed(() => {
    return brewStore.brewRunning
  })
  const showInstallLog = computed(() => {
    return brewStore.showInstallLog
  })
  const showLog = computed(() => {
    return showInstallLog?.value || showNextBtn?.value
  })
  const currentModule = computed(() => {
    return brewStore.module(typeFlag)
  })

  const toNext = () => {
    showNextBtn.value = false
    BrewStore().cardHeadTitle = I18nT('base.currentVersionLib')
  }

  const checkBrew = () => {
    return true
  }
  const checkPort = () => {
    return true
  }

  const handleOnlineVersion = (row: any) => {
    if (!row.installed) {
      if (row.downing) {
        return
      }
      row.downing = true
      row.type = typeFlag

      let p = 0
      const run = () => {
        p += 1
        row.progress = p
        if (p === 100) {
          row.downState = 'success'
          row.installed = true
          row.downing = false
          return
        }
        requestAnimationFrame(run)
      }
      requestAnimationFrame(run)
    } else {
      staticVersionDel(row.appDir)
    }
  }

  const handleBrewPortVersion = (row: any) => {
    if (brewRunning?.value) {
      return
    }
    brewStore.log.splice(0)
    brewStore.showInstallLog = true
    brewStore.brewRunning = true
    if (row.installed) {
      brewStore.cardHeadTitle = `${I18nT('base.uninstall')} ${row.name}`
    } else {
      brewStore.cardHeadTitle = `${I18nT('base.install')} ${row.name}`
    }

    waitTime().then(() => {
      brewStore.brewRunning = false
      showNextBtn.value = true
      brewStore.showInstallLog = false
      fetchInstalled().then()
      if (row.flag === 'brew') {
        fetchBrew().then()
      } else {
        fetchPort().then()
      }
    })
  }

  const tableData = computed(() => {
    const localList = brewStore.module(typeFlag).installed
    const onLineList = Object.values(currentModule?.value?.list?.static ?? {}).map((item) => {
      const obj: any = {
        ...item
      }
      obj.source = I18nT('base.staticBinarie')
      return obj
    })
    const brewList = Object.values(currentModule?.value?.list?.brew ?? {}).map((item) => {
      const obj: any = {
        ...item
      }
      obj.source = 'Homebrew'
      return obj
    })
    const portList = Object.values(currentModule?.value?.list?.port ?? {}).map((item) => {
      const obj: any = {
        ...item
      }
      obj.source = 'MacPorts'
      return obj
    })
    return [...localList, ...onLineList, ...brewList, ...portList]
  })

  const fetchInstalled = () => {
    const data = brewStore.module(typeFlag)
    data.installedInited = false
    return waitTime()
  }

  const fetchOnline = () => {
    return new Promise((resolve) => {
      waitTime().then(resolve)
    })
  }

  const fetchBrew = () => {
    return new Promise((resolve) => {
      if (!checkBrew()) {
        resolve(true)
        return
      }
      waitTime().then(resolve)
    })
  }

  const fetchPort = () => {
    return new Promise((resolve) => {
      if (!checkPort()) {
        resolve(true)
        return
      }
      waitTime().then(resolve)
    })
  }

  const fetching = computed(() => {
    return VersionManagerStore?.fetching?.[typeFlag] ?? false
  })

  const fetchDataAll = () => {
    if (VersionManagerStore?.fetching?.[typeFlag]) {
      return
    }
    VersionManagerStore.fetching[typeFlag] = true
    const all: any = [fetchInstalled(), fetchOnline(), fetchBrew(), fetchPort()]
    Promise.all(all).then(() => {
      VersionManagerStore.fetching[typeFlag] = false
    })
  }

  const getData = () => {
    const list = tableData?.value ?? []
    if (Object.keys(list).length === 0) {
      fetchDataAll()
    }
  }

  const reGetData = () => {
    if (fetching?.value) {
      return
    }
    const dict: any = currentModule.value.list
    for (const key in dict) {
      const list = dict[key]
      for (const k in list) {
        delete list[k]
      }
    }
    brewStore.module(typeFlag).installed.splice(0)
    getData()
  }

  const openURL = (url: string) => {}

  const checkEnvPath = (item: SoftInstalled) => {
    if (!item.bin) {
      return false
    }
    return ServiceActionStore.allPath.includes(dirname(item.bin))
  }

  const openDir = (dir: string) => {}

  const handleEdit = (row: any) => {
    if (['Homebrew', 'MacPorts'].includes(row.source)) {
      handleBrewPortVersion(row)
    } else {
      handleOnlineVersion(row)
    }
  }

  getData()
  if (!brewRunning?.value) {
    brewStore.cardHeadTitle = I18nT('base.currentVersionLib')
  }

  return {
    showNextBtn,
    cardHeadTitle,
    toNext,
    handleOnlineVersion,
    handleBrewPortVersion,
    tableData,
    brewRunning,
    checkBrew,
    checkPort,
    currentModule,
    reGetData,
    showLog,
    openURL,
    fetching,
    checkEnvPath,
    openDir,
    handleEdit,
    logs
  }
}
