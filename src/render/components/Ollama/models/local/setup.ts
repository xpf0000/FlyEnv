import { computed, reactive } from 'vue'
import IPC from '@/util/IPC'
import type { OllamaModelItem } from '@/components/Ollama/models/all/setup'
import { BrewStore } from '@/store/brew'

export const OllamaLocalModelsSetup = reactive<{
  fetching: boolean
  reFetch: () => void
  list: OllamaModelItem[]
}>({
  fetching: false,
  reFetch() {
    const brewStore = BrewStore()
    const runningService = brewStore.module('ollama').installed.find((o) => o.run)
    if (!runningService) {
      return
    }
    this.list.splice(0)
    this.fetching = true
    IPC.send('app-fork:ollama', 'allModel', JSON.parse(JSON.stringify(runningService))).then(
      (key: string, res: any) => {
        IPC.off(key)
        const list = res?.data ?? []
        this.list = reactive(list)
        this.fetching = false
      }
    )
  },
  list: []
})

export const Setup = () => {
  const fetching = computed(() => {
    return OllamaLocalModelsSetup.fetching ?? false
  })

  const brewStore = BrewStore()

  const runningService = computed(() => {
    return brewStore.module('ollama').installed.find((o) => o.run)
  })

  const fetchData = () => {
    if (!runningService.value) {
      return
    }
    if (fetching.value || Object.keys(OllamaLocalModelsSetup.list).length > 0) {
      return
    }
    OllamaLocalModelsSetup.fetching = true

    IPC.send('app-fork:ollama', 'allModel', JSON.parse(JSON.stringify(runningService.value))).then(
      (key: string, res: any) => {
        IPC.off(key)
        const list = res?.data ?? []
        OllamaLocalModelsSetup.list = reactive(list)
        OllamaLocalModelsSetup.fetching = false
      }
    )
  }

  const tableData = computed(() => {
    return OllamaLocalModelsSetup.list
  })

  fetchData()

  return {
    fetching,
    tableData,
    runningService
  }
}
