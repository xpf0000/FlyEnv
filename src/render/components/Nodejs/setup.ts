import { computed } from 'vue'
import { AppStore } from '@/store/app'
import { FNMSetup } from '@/components/Nodejs/fnm/setup'
import { NodejsStore } from '@/components/Nodejs/node'
import { NVMSetup } from '@/components/Nodejs/nvm/setup'

export const Setup = () => {
  const appStore = AppStore()
  const store = NodejsStore()

  const currentTool = computed({
    get() {
      return appStore.config.setup.currentNodeTool
    },
    set(v) {
      if (v !== appStore.config.setup.currentNodeTool) {
        appStore.config.setup.currentNodeTool = v
        appStore.saveConfig()
      }
    }
  })

  const showFooter = computed(() => {
    if (currentTool.value === 'fnm') {
      return FNMSetup.installing
    }
    if (currentTool.value === 'nvm') {
      return NVMSetup.installing
    }
    return false
  })

  const taskEnd = computed(() => {
    if (currentTool.value === 'fnm') {
      return FNMSetup.installEnd
    }
    if (currentTool.value === 'nvm') {
      return NVMSetup.installEnd
    }
    return false
  })

  const taskConfirm = () => {
    if (currentTool.value === 'fnm') {
      FNMSetup.installing = false
      FNMSetup.installEnd = false
      FNMSetup.xterm?.destory()
      delete FNMSetup.xterm
      return
    }
    if (currentTool.value === 'nvm') {
      NVMSetup.installing = false
      NVMSetup.installEnd = false
      NVMSetup.xterm?.destory()
      delete NVMSetup.xterm
      return
    }
  }

  const taskCancel = () => {
    store.chekTool()?.then()?.catch()
    if (currentTool.value === 'fnm') {
      FNMSetup.installing = false
      FNMSetup.installEnd = false
      FNMSetup.xterm?.stop()?.then(() => {
        FNMSetup.xterm?.destory()
        delete FNMSetup.xterm
      })
      return
    }
    if (currentTool.value === 'nvm') {
      NVMSetup.installing = false
      NVMSetup.installEnd = false
      NVMSetup.xterm?.stop()?.then(() => {
        NVMSetup.xterm?.destory()
        delete NVMSetup.xterm
      })
      return
    }
  }

  const loading = computed(() => {
    if (currentTool.value === 'fnm') {
      return FNMSetup.fetching || FNMSetup.installing
    }
    if (currentTool.value === 'nvm') {
      return NVMSetup.fetching || NVMSetup.installing
    }
    return false
  })

  const reFetch = () => {
    if (currentTool.value === 'fnm') {
      FNMSetup.reFetch()
    }
    if (currentTool.value === 'nvm') {
      NVMSetup.reFetch()
    }
  }

  return {
    currentTool,
    showFooter,
    taskEnd,
    taskConfirm,
    taskCancel,
    loading,
    reFetch
  }
}
