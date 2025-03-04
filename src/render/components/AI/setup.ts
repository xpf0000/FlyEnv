import { reactive } from 'vue'
import { uuid } from '@shared/utils'
import { I18nT } from '@shared/lang'
import type { PromptItem } from '@/components/AI/Prompt/setup'
import { AIOllama } from '@/components/AI/AIOllama'
import { AsyncComponentShow } from '@/util/AsyncComponent'
import localForage from 'localforage'

export type ChatItem = {
  role: 'user' | 'system' | 'assistant'
  content: string
  images?: string[]
  error?: string
  model?: string
}

export type ModelChatItem = AIOllama

export type OllamaServerSetup = {
  url: string
  model: string
}

const onCompositionstart = () => {
  AISetup.isComposing = true
  console.log('开始中文输入')
}

const onCompositionend = () => {
  AISetup.isComposing = false
  console.log('结束中文输入')
}

export const AISetup = reactive<{
  aiShow: boolean
  tab: string
  ollamaServer: OllamaServerSetup
  modelChatList: ModelChatItem[]
  content: string
  isComposing: boolean
  updateCurrentChatPrompt: (item: PromptItem) => void
  save: () => void
  init: () => void
  initCompositionEvent: () => void
  deinitCompositionEvent: () => void
}>({
  aiShow: false,
  tab: 'flyenv',
  ollamaServer: {
    url: '',
    model: ''
  },
  modelChatList: [],
  content: '',
  isComposing: false,
  updateCurrentChatPrompt(item: PromptItem) {
    const currentChat = AISetup.modelChatList?.find((f) => f.id === AISetup.tab)
    if (!currentChat) {
      return
    }
    currentChat.title = item.name
    currentChat.prompt = item.prompt
    AISetup.save()
  },
  init() {
    localForage
      .getItem('flyenv-ai-chat-list')
      .then((res: any) => {
        if (res && res?.tab) {
          AISetup.tab = res.tab
        }
        if (res && res?.ollamaServer) {
          AISetup.ollamaServer = reactive(res.ollamaServer)
        }
        if (res && res?.modelChatList) {
          AISetup.modelChatList = reactive(res.modelChatList.map((m: any) => new AIOllama(m)))
        }
      })
      .catch()
  },
  save() {
    localForage
      .setItem(
        'flyenv-ai-chat-list',
        JSON.parse(
          JSON.stringify({
            tab: AISetup.tab,
            ollamaServer: AISetup.ollamaServer,
            modelChatList: AISetup.modelChatList
          })
        )
      )
      .then()
      .catch((e: any) => {
        console.log('flyenv-ai-chat-list save err: ', e)
      })
  },
  initCompositionEvent() {
    document.addEventListener('compositionstart', onCompositionstart)
    document.addEventListener('compositionend', onCompositionend)
  },
  deinitCompositionEvent() {
    document.removeEventListener('compositionstart', onCompositionstart)
    document.removeEventListener('compositionend', onCompositionend)
  }
})

export const Setup = () => {
  const startNewChat = () => {
    const id = uuid()
    const item = reactive(
      new AIOllama({
        id,
        title: I18nT('prompt.newChat'),
        prompt: I18nT('prompt.default'),
        chatList: []
      })
    )
    AISetup.modelChatList.unshift(item as any)
    AISetup.tab = id
    AISetup.save()
  }

  const toChat = (item?: ModelChatItem) => {
    if (!item) {
      AISetup.tab = 'flyenv'
    } else {
      AISetup.tab = item.id
    }
    AISetup.save()
  }

  const delChat = (item: ModelChatItem) => {
    const list = AISetup.modelChatList
    const index = list.findIndex((f) => f.id === item.id)
    if (index >= 0) {
      list.splice(index, 1)
    }
    if (AISetup.tab === item.id) {
      const fitem = list?.[0]
      if (fitem) {
        AISetup.tab = fitem.id
      } else {
        AISetup.tab = 'flyenv'
      }
    }
    AISetup.save()
  }

  const copyChat = (item: ModelChatItem) => {
    const list = AISetup.modelChatList
    const index = list.findIndex((f) => f.id === item.id)
    if (index >= 0) {
      const chatItem = list[index]
      const obj = JSON.parse(JSON.stringify(chatItem))
      obj.id = uuid()
      const copy = reactive(new AIOllama(obj))
      list.splice(index + 1, 0, copy as any)
    }
    AISetup.save()
  }

  let EditVM: any
  import('./ChatItemSetup/index.vue').then((res) => {
    EditVM = res.default
  })

  const editChat = (item: ModelChatItem) => {
    AsyncComponentShow(EditVM, {
      item
    }).then(() => {
      AISetup.save()
    })
  }

  let OllamaSetupVM: any
  import('./OllamaSetup/index.vue').then((res) => {
    OllamaSetupVM = res.default
  })
  const toOllamaSetup = () => {
    AsyncComponentShow(OllamaSetupVM).then(() => {
      AISetup.save()
    })
  }

  return {
    startNewChat,
    toChat,
    delChat,
    copyChat,
    editChat,
    toOllamaSetup
  }
}
