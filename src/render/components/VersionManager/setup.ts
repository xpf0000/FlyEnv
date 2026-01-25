import { computed } from 'vue'
import { AppStore } from '@/store/app'
import { BrewStore } from '@/store/brew'
import type { AllAppModule } from '@/core/type'
import { BrewSetup } from '@/components/VersionManager/brew/setup'
import { MacPortsSetup } from '@/components/VersionManager/port/setup'
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

  const libSrc = computed({
    get(): 'brew' | 'port' | 'static' {
      if (brewStore.LibUse[typeFlag]) {
        return brewStore.LibUse[typeFlag] as any
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
    if (libSrc.value === 'port') {
      return MacPortsSetup.installing
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
    return false
  })

  const reFetch = () => {
    if (libSrc.value === 'brew') {
      console.log('reFetch brew !!!')
      BrewSetup.reFetch()
    }
    if (libSrc.value === 'port') {
      console.log('reFetch port !!!')
      MacPortsSetup.reFetch()
    }
    if (libSrc.value === 'static') {
      console.log('reFetch port !!!')
      StaticSetup.reFetch()
    }
  }

  const openURL = (url: string) => {
    shell.openExternal(url).then().catch()
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
    reFetch,
    openURL
  }
}
