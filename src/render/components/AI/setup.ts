import { computed, ComputedRef, reactive } from 'vue'
import { OllamaLocalModelsSetup } from '@/components/Ollama/models/local/setup'
import { BrewStore, SoftInstalled } from '@/store/brew'
import { AppStore } from '@/store/app'
import { startService } from '@/util/Service'
import { uuid } from '@shared/utils'
import { I18nT } from '@shared/lang'
import type { PromptItem } from '@/components/AI/Prompt/setup'
import { AIOllama } from '@/components/AI/AIOllama'
import type { OllamaModelItem } from '@/components/Ollama/models/all/setup'

export type ChatItem = {
  role: 'user' | 'system' | 'assistant'
  content: string
  images?: string[]
}

export type ModelChatItem = AIOllama

export const AISetup = reactive<{
  tab: string
  model: string
  modelChatList: Record<string, ModelChatItem[]>
  content: string
  updateCurrentChatPrompt: (item: PromptItem) => void
}>({
  tab: 'flyenv',
  model: '',
  modelChatList: {},
  content: '',
  updateCurrentChatPrompt(item: PromptItem) {
    const currentChat = AISetup.modelChatList?.[AISetup.model]?.find((f) => f.id === AISetup.tab)
    if (!currentChat) {
      return
    }
    currentChat.title = item.name
    currentChat.prompt = item.prompt
    currentChat.updatePrompt()
  }
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

  const startNewChat = (oitem: OllamaModelItem) => {
    const model = oitem.name
    if (!AISetup.modelChatList[model]) {
      AISetup.modelChatList[model] = reactive([])
    }
    const find = AISetup.modelChatList[model].find((f) => f.chatList.length === 0)
    if (find) {
      AISetup.tab = find.id
      return
    }
    const id = uuid()
    const item = reactive(
      new AIOllama({
        baseUrl: oitem?.url ?? 'http://127.0.0.1:11434',
        id,
        model,
        title: I18nT('prompt.newChat'),
        prompt: I18nT('prompt.default'),
        chatList: []
      })
    )
    item.updatePrompt()
    AISetup.modelChatList[model].unshift(item as any)
    AISetup.tab = id
    AISetup.model = model
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

  const delChat = (item: ModelChatItem) => {
    const list = AISetup.modelChatList[item.model]
    const index = list.findIndex((f) => f.id === item.id)
    if (index >= 0) {
      list.splice(index, 1)
    }
    if (AISetup.tab === item.id) {
      const fitem = list?.[0]
      if (fitem) {
        AISetup.tab = fitem.id
        AISetup.model = fitem.model
      } else {
        AISetup.tab = 'flyenv'
        AISetup.model = ''
      }
    }
  }

  const copyChat = () => {}

  return {
    collapseList,
    currentVersion,
    runService,
    runningService,
    serviceStart,
    startNewChat,
    toChat,
    delChat,
    copyChat
  }
}
