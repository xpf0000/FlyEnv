import { computed, reactive } from 'vue'
import { BrewStore, SoftInstalled } from '@/store/brew'
import type { AllAppModule } from '@/core/type'
import installedVersions from '@/util/InstalledVersions'
import { ServiceActionStore } from '@/components/ServiceManager/EXT/store'
import { AppStore } from '@/store/app'

const { shell } = require('@electron/remote')

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

  const fetchInstalled = () => {
    const data = brewStore.module(typeFlag)
    data.installedInited = false
    return installedVersions.allInstalledVersions([typeFlag])
  }

  const fetching = computed(() => {
    return LocalSetup.fetching?.[typeFlag] ?? false
  })

  const fetchDataAll = () => {
    if (fetching.value) {
      return
    }
    LocalSetup.fetching[typeFlag] = true
    fetchInstalled().finally(() => {
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

  const openDir = (dir: string) => {
    shell.openPath(dir)
  }

  const isInEnv = (item: SoftInstalled) => {
    return ServiceActionStore.allPath.includes(item.path)
  }

  const isInAppEnv = (item: SoftInstalled) => {
    return ServiceActionStore.appPath.includes(item.path)
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
