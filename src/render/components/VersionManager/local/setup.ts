import { computed, reactive } from 'vue'
import { BrewStore, SoftInstalled } from '@/store/brew'
import type { AllAppModule } from '@/core/type'
import { ServiceActionStore } from '@/components/ServiceManager/EXT/store'
import { AppStore } from '@/store/app'
import { dirname } from '@/util/path-browserify'
import { shell } from '@/util/NodeFn'

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
    const module = brewStore.module(typeFlag)
    module.installedFetched = false
    module.fetchInstalled().catch()
  }

  const fetching = computed(() => {
    const module = brewStore.module(typeFlag)
    return module.fetchInstalleding
  })

  const getData = () => {
    if (brewStore.module(typeFlag).installed.length === 0) {
      fetchInstalled()
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
    return ServiceActionStore.allPath.includes(dirname(item.bin))
  }

  const openDir = (dir: string) => {
    shell.openPath(dir)
  }

  const isInEnv = (item: SoftInstalled) => {
    return ServiceActionStore.isInEnv(item)
  }

  const isInAppEnv = (item: SoftInstalled) => {
    return ServiceActionStore.isInAppEnv(item)
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
