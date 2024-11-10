import { computed, ref, watch } from 'vue'
import { BrewStore } from '@web/store/brew'
import { I18nT } from '@shared/lang'
import type { AllAppModule } from '@web/core/type'
import { VersionManagerStore } from '@web/components/VersionManager/store'
import { staticVersionDel, waitTime } from '@web/fn'

export const Setup = (typeFlag: AllAppModule, hasStatic?: boolean) => {
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

  const fetching = computed(() => {
    if (!libSrc.value) {
      return false
    }
    return VersionManagerStore.sourceFetching(typeFlag)[libSrc.value]
  })

  const libSrc = computed({
    get(): 'brew' | 'port' | 'static' {
      return (
        brewStore.LibUse[typeFlag] ??
        (checkBrew() ? 'brew' : checkPort() ? 'port' : hasStatic === true ? 'static' : undefined)
      )
    },
    set(v: 'brew' | 'port' | 'static') {
      brewStore.LibUse[typeFlag] = v
    }
  })
  const fetchData = (src: 'brew' | 'port' | 'static') => {
    if (VersionManagerStore.sourceFetching(typeFlag)?.[src]) {
      return
    }
    VersionManagerStore.sourceFetching(typeFlag)[src] = true

    waitTime()
      .then(() => {
        VersionManagerStore.sourceFetching(typeFlag)[src] = false
      })
      .catch(() => {
        VersionManagerStore.sourceFetching(typeFlag)[src] = false
      })
  }
  const getData = () => {
    const currentItem = brewStore.module(typeFlag)
    const src = libSrc.value
    if (!src || VersionManagerStore.sourceFetching(typeFlag)[src]) {
      return
    }
    const list = currentItem.list?.[src]
    if (list && Object.keys(list).length === 0) {
      fetchData(src)
    }
  }

  const reGetData = () => {
    if (!libSrc?.value) {
      return
    }
    const list = brewStore.module(typeFlag).list?.[libSrc.value]
    for (const k in list) {
      delete list[k]
    }
    getData()
  }

  const regetInstalled = () => {
    reGetData()
    brewStore.showInstallLog = false
    brewStore.brewRunning = false
    brewStore.module(typeFlag).installedInited = false
    waitTime().then(() => {
      brewStore.module(typeFlag).installedInited = true
    })
  }

  const handleOnlineVersion = (row: any, installed: boolean) => {
    console.log('row: ', row, installed)
    if (!installed) {
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
  const handleBrewPortVersion = (index: number, row: any) => {
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
      regetInstalled()
    })
  }

  const tableData = computed(() => {
    if (!libSrc?.value) {
      return []
    }
    const arr = []
    const list = brewStore.module(typeFlag).list?.[libSrc.value]
    for (const name in list) {
      const value = list[name]
      const nums = value.version.split('.').map((n: string, i: number) => {
        if (i > 0) {
          const num = parseInt(n)
          if (isNaN(num)) {
            return '00'
          }
          if (num < 10) {
            return `0${num}`
          }
          return num
        }
        return n
      })
      const num = parseInt(nums.join(''))
      Object.assign(value, {
        name,
        version: value.version,
        installed: value.installed,
        num,
        flag: value.flag
      })
      arr.push(value)
    }
    arr.sort((a, b) => {
      return b.num - a.num
    })
    return arr
  })

  watch(libSrc, (v) => {
    if (v) {
      if (VersionManagerStore.sourceFetching(typeFlag)[v]) {
        return
      }
      const list = brewStore.module(typeFlag).list?.[v] ?? {}
      if (list && Object.keys(list).length === 0) {
        reGetData()
      }
    }
  })
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
    libSrc,
    checkBrew,
    checkPort,
    currentModule,
    reGetData,
    showLog,
    fetching,
    logs
  }
}
