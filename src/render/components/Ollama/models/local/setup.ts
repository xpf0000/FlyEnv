import { computed, reactive } from 'vue'
import IPC from '@/util/IPC'
import type { OllamaModelItem } from '@/components/Ollama/models/all/setup'
import { BrewStore } from '@/store/brew'
import { AppStore } from '@/store/app'

export const OllamaLocalModelsSetup = reactive<{
  fetching: boolean
  reFetch: () => Promise<boolean>
  list: OllamaModelItem[]
}>({
  fetching: false,
  async reFetch() {
    const brewStore = BrewStore()
    await brewStore.module('ollama').fetchInstalled()
    const appStore = AppStore()
    const current = appStore.config.server?.ollama?.current
    const service = brewStore
      .module('ollama')
      .installed.find((o) => o.path === current?.path && o.version === current?.version)
    if (!service) {
      return false
    }
    this.list.splice(0)
    this.fetching = true
    IPC.send('app-fork:ollama', 'allModel', JSON.parse(JSON.stringify(service))).then(
      (key: string, res: any) => {
        IPC.off(key)
        const list = res?.data ?? []
        this.list = reactive(list)
        this.fetching = false
      }
    )
    return true
  },
  list: []
})

export const Setup = () => {
  const fetching = computed(() => {
    return OllamaLocalModelsSetup.fetching ?? false
  })

  const brewStore = BrewStore()
  const appStore = AppStore()

  const currentService = computed(() => {
    const current = appStore.config.server?.ollama?.current
    return brewStore
      .module('ollama')
      .installed.find((o) => o.path === current?.path && o.version === current?.version)
  })

  const fetchData = () => {
    if (!currentService.value) {
      return
    }
    if (fetching.value || Object.keys(OllamaLocalModelsSetup.list).length > 0) {
      return
    }
    OllamaLocalModelsSetup.fetching = true

    IPC.send('app-fork:ollama', 'allModel', JSON.parse(JSON.stringify(currentService.value))).then(
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
    tableData
  }
}
