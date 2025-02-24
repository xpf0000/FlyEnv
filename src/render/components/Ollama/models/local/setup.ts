import { computed, reactive } from 'vue'
import IPC from '@/util/IPC'
import type { OllamaModelItem } from '@/components/Ollama/models/all/setup'
import { BrewStore } from '@/store/brew'
import { MessageError } from '@/util/Element'
import { I18nT } from '@shared/lang'

export const OllamaLocalModelsSetup = reactive<{
  fetching: boolean
  reFetch: () => void
  list: OllamaModelItem[]
}>({
  fetching: false,
  reFetch: () => 0,
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
      MessageError(I18nT('ollama.needServiceRun'))
      return
    }
    if (fetching.value || Object.keys(OllamaLocalModelsSetup.list).length > 0) {
      return
    }
    OllamaLocalModelsSetup.fetching = true

    IPC.send('app-fork:ollama', 'allModel').then((key: string, res: any) => {
      IPC.off(key)
      const list = res?.data ?? []
      OllamaLocalModelsSetup.list = reactive(list)
      OllamaLocalModelsSetup.fetching = false
    })
  }

  const reGetData = () => {
    OllamaLocalModelsSetup.list.splice(0)
    fetchData()
  }

  OllamaLocalModelsSetup.reFetch = reGetData

  const tableData = computed(() => {
    return OllamaLocalModelsSetup.list
  })

  return {
    reGetData,
    fetching,
    tableData,
    runningService
  }
}
