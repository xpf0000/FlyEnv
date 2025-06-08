import { computed, ComputedRef } from 'vue'
import { AppStore } from '@/store/app'
import { FNMSetup } from '@/components/Nodejs/fnm/setup'
import { NVMSetup } from '@/components/Nodejs/nvm/setup'
import { NodeDefaultSetup } from '@/components/Nodejs/default/setup'

export const Setup = () => {
  const appStore = AppStore()

  const currentTool: ComputedRef<'fnm' | 'nvm' | 'default'> = computed({
    get() {
      return appStore.config.setup.currentNodeTool || 'default'
    },
    set(v) {
      if (v !== appStore.config.setup.currentNodeTool) {
        appStore.config.setup.currentNodeTool = v
        appStore.saveConfig()
      }
    }
  })

  const loading = computed(() => {
    if (currentTool.value === 'fnm') {
      return FNMSetup.fetching
    }
    if (currentTool.value === 'nvm') {
      return NVMSetup.fetching
    }
    if (currentTool.value === 'default') {
      return NodeDefaultSetup.fetching
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
    if (currentTool.value === 'default') {
      NodeDefaultSetup.reFetch()
    }
  }

  return {
    currentTool,
    loading,
    reFetch
  }
}
