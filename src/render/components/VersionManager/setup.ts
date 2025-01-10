import { computed } from 'vue'
import { AppStore } from '@/store/app'
import { BrewStore } from '@/store/brew'
import type { AllAppModule } from '@/core/type'
import { BrewSetup } from '@/components/VersionManager/brew/setup'

export const Setup = (typeFlag: AllAppModule, hasStatic?: boolean) => {
  const appStore = AppStore()
  const brewStore = BrewStore()

  const checkBrew = computed(() => {
    return false
    // if (!appStore.envIndex) {
    //   return false
    // }
    // return !!global.Server.BrewCellar
  })

  const checkPort = computed(() => {
    return false
    // if (!appStore.envIndex) {
    //   return false
    // }
    // return !!global.Server.MacPorts
  })

  const libSrc = computed({
    get(): 'brew' | 'port' | 'static' {
      if (brewStore.LibUse[typeFlag]) {
        return brewStore.LibUse[typeFlag]
      }
      if (hasStatic) {
        return 'static'
      }
      return checkBrew.value ? 'brew' : checkPort.value ? 'port' : 'brew'
    },
    set(v: 'brew' | 'port' | 'static') {
      brewStore.LibUse[typeFlag] = v
    }
  })

  const showFooter = computed(() => {
    if (libSrc.value === 'brew') {
      return BrewSetup.installing
    }
    return false
  })

  const taskEnd = computed(() => {
    if (libSrc.value === 'brew') {
      return BrewSetup.installEnd
    }
    return false
  })

  const taskConfirm = () => {
    if (libSrc.value === 'brew') {
      BrewSetup.installing = false
      BrewSetup.installEnd = false
      delete BrewSetup.xterm
      BrewSetup.checkBrew()
    }
  }

  const taskCancel = () => {
    if (libSrc.value === 'brew') {
      BrewSetup.installing = false
      BrewSetup.installEnd = false
      BrewSetup.xterm?.stop()?.then(() => {
        BrewSetup.xterm?.destory()
        BrewSetup.xterm?.cleanLog()
        delete BrewSetup.xterm
      })
    }
  }

  const loading = computed(() => {
    if (libSrc.value === 'brew') {
      return BrewSetup.fetching[typeFlag] || BrewSetup.installing
    }
    return false
  })

  const reFetch = () => {
    if (libSrc.value === 'brew') {
      BrewSetup.reFetch()
    }
  }

  return {
    libSrc,
    checkBrew,
    checkPort,
    showFooter,
    taskEnd,
    taskConfirm,
    taskCancel,
    loading,
    reFetch
  }
}
