import { computed, ComputedRef, reactive } from 'vue'
import { OllamaLocalModelsSetup } from '@/components/Ollama/models/local/setup'
import { BrewStore, SoftInstalled } from '@/store/brew'
import { AppStore } from '@/store/app'
import { startService } from '@/util/Service'
import { uuid } from '@shared/utils'

export type ChatItem = {
  role: 'user' | 'system' | 'assistant'
  content: string
  images: string[]
}

export type ModelChatItem = {
  id: string
  title: string
  chatList: ChatItem[]
}

export const AISetup = reactive<{
  tab: string
  modelChatList: Record<string, ModelChatItem[]>
}>({
  tab: 'flyenv',
  modelChatList: {}
})

export const Setup = () => {
  OllamaLocalModelsSetup.reFetch()

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

  const runService = computed(() => {
    return brewStore.module('ollama').installed.find((o) => o.run)
  })

  const runningService = computed(() => {
    return brewStore.module('ollama').installed.find((o) => o.running)
  })

  const serviceStart = () => {
    if (!currentVersion?.value) {
      return
    }
    startService('ollama', currentVersion.value).then(() => {
      OllamaLocalModelsSetup.reFetch()
    })
  }

  const startNewChat = (model: string) => {
    if (!AISetup.modelChatList[model]) {
      AISetup.modelChatList[model] = reactive([])
    }
    const id = uuid()
    const item: ModelChatItem = {
      id,
      title: '新聊天',
      chatList: []
    }
    AISetup.modelChatList[model].unshift(item)
    AISetup.tab = id
  }

  return {
    collapseList,
    currentVersion,
    runService,
    runningService,
    serviceStart,
    startNewChat
  }
}
