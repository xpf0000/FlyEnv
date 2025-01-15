import { computed } from 'vue'
import { AppStore } from '@/store/app'
import { FNMSetup } from '@/components/Nodejs/fnm/setup'
import { NodejsStore } from '@/components/Nodejs/node'

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
    return false
  })

  const taskEnd = computed(() => {
    if (currentTool.value === 'fnm') {
      return FNMSetup.installEnd
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
  }

  const taskCancel = () => {
    store.chekTool().then().catch()
    if (currentTool.value === 'fnm') {
      FNMSetup.installing = false
      FNMSetup.installEnd = false
      FNMSetup.xterm?.stop()?.then(() => {
        FNMSetup.xterm?.destory()
        delete FNMSetup.xterm
      })
      return
    }
  }

  const loading = computed(() => {
    if (currentTool.value === 'fnm') {
      return FNMSetup.fetching || FNMSetup.installing
    }
    return false
  })

  const reFetch = () => {
    if (currentTool.value === 'fnm') {
      FNMSetup.reFetch()
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
