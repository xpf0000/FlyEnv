import { computed, reactive } from 'vue'
import { OllamaAllModelsSetup } from './all/setup'
import { OllamaLocalModelsSetup } from '@/components/Ollama/models/local/setup'
import { shell } from '@/util/NodeFn'

export const OllamaModelsSetup = reactive<{
  tab: 'local' | 'all'
}>({
  tab: 'local'
})

export const SetupAll = () => {
  const showFooter = computed(() => {
    if (OllamaModelsSetup.tab === 'all') {
      return OllamaAllModelsSetup.installing
    }
    return false
  })

  const taskEnd = computed(() => {
    if (OllamaModelsSetup.tab === 'all') {
      return OllamaAllModelsSetup.installEnd
    }
    return false
  })

  const taskConfirm = () => {
    if (OllamaModelsSetup.tab === 'all') {
      OllamaAllModelsSetup.installing = false
      OllamaAllModelsSetup.installEnd = false
      OllamaAllModelsSetup.xterm?.destory()
      delete OllamaAllModelsSetup.xterm
      OllamaLocalModelsSetup.reFetch()
      return
    }
  }

  const taskCancel = () => {
    if (OllamaModelsSetup.tab === 'all') {
      OllamaAllModelsSetup.installing = false
      OllamaAllModelsSetup.installEnd = false
      OllamaAllModelsSetup.xterm?.stop()?.then(() => {
        OllamaAllModelsSetup.xterm?.destory()
        delete OllamaAllModelsSetup.xterm
      })
      return
    }
  }

  const loading = computed(() => {
    if (OllamaModelsSetup.tab === 'all') {
      return OllamaAllModelsSetup.fetching || OllamaAllModelsSetup.installing
    }
    if (OllamaModelsSetup.tab === 'local') {
      return OllamaLocalModelsSetup.fetching
    }
    return false
  })

  const reFetch = () => {
    if (OllamaModelsSetup.tab === 'all') {
      OllamaAllModelsSetup.reFetch()
    } else if (OllamaModelsSetup.tab === 'local') {
      OllamaLocalModelsSetup.reFetch()
    }
  }

  const openURL = (url: string) => {
    shell.openExternal(url)
  }

  return {
    showFooter,
    taskEnd,
    taskConfirm,
    taskCancel,
    loading,
    reFetch,
    openURL
  }
}
