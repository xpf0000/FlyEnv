import { computed } from 'vue'
import { AppStore } from '@/store/app'
import { BrewStore } from '@/store/brew'
import type { AllAppModule } from '@/core/type'
import { BrewSetup } from '@/components/VersionManager/brew/setup'
import { MacPortsSetup } from '@/components/VersionManager/port/setup'
import { SdkmanSetup } from '@/components/VersionManager/sdkman/setup'
import { StaticSetup } from '@/components/VersionManager/static/setup'
import { shell } from '@/util/NodeFn'

export const Setup = (typeFlag: AllAppModule, hasStatic?: boolean) => {
  const appStore = AppStore()
  const brewStore = BrewStore()

  const checkBrew = computed(() => {
    if (!appStore.envIndex) {
      return false
    }
    return !!window.Server.BrewCellar
  })

  const checkPort = computed(() => {
    if (!appStore.envIndex) {
      return false
    }
    return !!window.Server.MacPorts
  })

  const checkSdkman = computed(() => {
    if (!appStore.envIndex) {
      return false
    }
    return !!window.Server.SdkmanHome
  })

  const libSrc = computed({
    get(): 'brew' | 'port' | 'static' | 'sdkman' {
      if (brewStore.LibUse[typeFlag]) {
        return brewStore.LibUse[typeFlag] as any
      }
      if (hasStatic) {
        return 'static'
      }
      return checkBrew.value ? 'brew' : checkPort.value ? 'port' : 'brew'
    },
    set(v: 'brew' | 'port' | 'static' | 'sdkman') {
      brewStore.LibUse[typeFlag] = v
    }
  })

  const showFooter = computed(() => {
    if (libSrc.value === 'brew') {
      return BrewSetup.installing
    }
    if (libSrc.value === 'port') {
      return MacPortsSetup.installing
    }
    if (libSrc.value === 'sdkman') {
      return SdkmanSetup.installing
    }
    return false
  })

  const taskEnd = computed(() => {
    if (libSrc.value === 'brew') {
      return BrewSetup.installEnd
    }
    if (libSrc.value === 'port') {
      return MacPortsSetup.installEnd
    }
    if (libSrc.value === 'sdkman') {
      return SdkmanSetup.installEnd
    }
    return false
  })

  const taskConfirm = () => {
    console.log('taskConfirm: ', libSrc.value)
    if (libSrc.value === 'brew') {
      BrewSetup.installing = false
      BrewSetup.installEnd = false
      BrewSetup.xterm?.destroy()
      delete BrewSetup.xterm
      BrewSetup.checkBrew()
      BrewSetup.reFetch()
      return
    }

    if (libSrc.value === 'port') {
      MacPortsSetup.installing = false
      MacPortsSetup.installEnd = false
      MacPortsSetup.xterm?.destroy()
      delete MacPortsSetup.xterm
      MacPortsSetup.checkMacPorts()
      MacPortsSetup.reFetch()
      return
    }

    if (libSrc.value === 'sdkman') {
      SdkmanSetup.installing = false
      SdkmanSetup.installEnd = false
      SdkmanSetup.xterm?.destroy()
      delete SdkmanSetup.xterm
      SdkmanSetup.checkSdkman()
      SdkmanSetup.reFetch()
      return
    }
  }

  const taskCancel = () => {
    console.log('taskCancel: ', libSrc.value)
    if (libSrc.value === 'brew') {
      BrewSetup.installing = false
      BrewSetup.installEnd = false
      BrewSetup.xterm?.stop()?.then(() => {
        BrewSetup.xterm?.destroy()
        delete BrewSetup.xterm
      })
      return
    }

    if (libSrc.value === 'port') {
      MacPortsSetup.installing = false
      MacPortsSetup.installEnd = false
      MacPortsSetup.xterm?.stop()?.then(() => {
        MacPortsSetup.xterm?.destroy()
        delete MacPortsSetup.xterm
      })
      return
    }

    if (libSrc.value === 'sdkman') {
      SdkmanSetup.installing = false
      SdkmanSetup.installEnd = false
      SdkmanSetup.xterm?.stop()?.then(() => {
        SdkmanSetup.xterm?.destroy()
        delete SdkmanSetup.xterm
      })
      return
    }
  }

  const loading = computed(() => {
    const module = brewStore.module(typeFlag)
    if (libSrc.value === 'brew') {
      return module.brewFetching || BrewSetup.installing
    }
    if (libSrc.value === 'port') {
      return module.portFetching || MacPortsSetup.installing
    }
    if (libSrc.value === 'static') {
      return module.staticFetching
    }
    if (libSrc.value === 'sdkman') {
      return module.sdkmanFetching || SdkmanSetup.installing
    }
    return false
  })

  const reFetch = () => {
    if (libSrc.value === 'brew') {
      BrewSetup.reFetch()
    }
    if (libSrc.value === 'port') {
      MacPortsSetup.reFetch()
    }
    if (libSrc.value === 'static') {
      StaticSetup.reFetch()
    }
    if (libSrc.value === 'sdkman') {
      SdkmanSetup.reFetch()
    }
  }

  const openURL = (url: string) => {
    shell.openExternal(url).then().catch()
  }

  return {
    libSrc,
    checkBrew,
    checkPort,
    checkSdkman,
    showFooter,
    taskEnd,
    taskConfirm,
    taskCancel,
    loading,
    reFetch,
    openURL
  }
}
