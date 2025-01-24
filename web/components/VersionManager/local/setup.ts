import { computed, reactive } from 'vue'
import { BrewStore, SoftInstalled } from '@web/store/brew'
import type { AllAppModule } from '@web/core/type'
import { ServiceActionStore } from '@web/components/ServiceManager/EXT/store'
import { AppStore } from '@web/store/app'
import { dirname, waitTime } from '@web/fn'

export const LocalSetup = reactive<{
  fetching: Partial<Record<AllAppModule, boolean>>
  reFetch: () => void
}>({
  fetching: {},
  reFetch: () => 0
})

export const SetupAll = (typeFlag: AllAppModule) => {
  const brewStore = BrewStore()
  const appStore = AppStore()

  const currentModule = computed(() => {
    return brewStore.module(typeFlag)
  })

  const tableData = computed(() => {
    const localList = brewStore.module(typeFlag).installed
    return [...localList]
  })

  const fetching = computed(() => {
    return LocalSetup.fetching?.[typeFlag] ?? false
  })

  const fetchDataAll = () => {
    if (fetching.value) {
      return
    }
    LocalSetup.fetching[typeFlag] = true
    waitTime().finally(() => {
      LocalSetup.fetching[typeFlag] = false
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
    brewStore.module(typeFlag).installed.splice(0)
    getData()
  }

  LocalSetup.reFetch = reGetData

  const checkEnvPath = (item: SoftInstalled) => {
    if (!item.bin) {
      return false
    }
    return ServiceActionStore.appPath.includes(dirname(item.bin))
  }

  const openDir = () => {}

  const isInEnv = (item: SoftInstalled) => {
    const bin = dirname(item.bin)
    return ServiceActionStore.allPath.includes(bin)
  }

  const isInAppEnv = (item: SoftInstalled) => {
    const bin = dirname(item.bin)
    return ServiceActionStore.appPath.includes(bin)
  }

  getData()

  return {
    tableData,
    currentModule,
    reGetData,
    fetching,
    checkEnvPath,
    openDir,
    isInEnv,
    isInAppEnv,
    appStore
  }
}
