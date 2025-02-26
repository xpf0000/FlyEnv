import { computed, ComputedRef, reactive } from 'vue'
import { OllamaLocalModelsSetup } from '@/components/Ollama/models/local/setup'
import { BrewStore, SoftInstalled } from '@/store/brew'
import { AppStore } from '@/store/app'

export const AISetup = reactive<{
  collapse: string[]
  chatList: Record<string, any>
}>({
  collapse: [],
  chatList: {}
})

export const Setup = () => {
  const collapseList = computed(() => {
    return OllamaLocalModelsSetup.list
  })

  const appStore = AppStore()
  const brewStore = BrewStore()

  const version = computed(() => {
    const flag = 'ollama'
    const server: any = appStore.config.server
    return server?.[flag]?.current
  })

  const currentVersion: ComputedRef<SoftInstalled | undefined> = computed(() => {
    return brewStore
      .module('ollama')
      ?.installed?.find(
        (i) => i.path === version?.value?.path && i.version === version?.value?.version
      )
  })

  const runningService = computed(() => {
    return brewStore.module('ollama').installed.find((o) => o.run)
  })

  return {
    collapseList,
    currentVersion,
    runningService
  }
}
