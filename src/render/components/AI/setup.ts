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
  model: string
  id: string
  title: string
  prompt: string
  chatList: ChatItem[]
}

export const AISetup = reactive<{
  tab: string
  model: string
  modelChatList: Record<string, ModelChatItem[]>
  content: string
}>({
  tab: 'flyenv',
  model: '',
  modelChatList: {},
  content: ''
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
    const find = AISetup.modelChatList[model].find((f) => f.chatList.length === 0)
    if (find) {
      AISetup.tab = find.id
      return
    }
    const id = uuid()
    const item: ModelChatItem = {
      id,
      model,
      title: '新聊天',
      chatList: []
    }
    AISetup.modelChatList[model].unshift(item)
    AISetup.tab = id
  }

  const toChat = (item?: ModelChatItem) => {
    if (!item) {
      AISetup.tab = 'flyenv'
      AISetup.model = ''
    } else {
      AISetup.tab = item.id
      AISetup.model = item.model
    }
  }

  return {
    collapseList,
    currentVersion,
    runService,
    runningService,
    serviceStart,
    startNewChat,
    toChat
  }
}
