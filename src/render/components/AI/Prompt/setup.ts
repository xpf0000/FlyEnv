import { computed, reactive } from 'vue'
import IPC from '@/util/IPC'
import { StorageGet, StorageSet } from '@/util/Storage'

export type LangItem = {
  id: string
  lang: string
  name: string
}

export type PromptItem = {
  id: string
  lang: string
  name: string
  prompt: string
}

export const PromptSetup = reactive<{
  lang: string
  langs: LangItem[]
  prompts: PromptItem[]
}>({
  lang: '',
  langs: [],
  prompts: []
})

export const Setup = () => {
  const fetchLangs = () => {
    if (PromptSetup.langs.length > 0) {
      return
    }
    const cache = StorageGet('fetchVerion-ai-lang')
    if (cache) {
      PromptSetup.langs = reactive(cache)
      return
    }
    IPC.send('app-fork:ai', 'allLang').then((key: string, res: any) => {
      IPC.off(key)
      const list = res?.data ?? []
      PromptSetup.langs = reactive(list)
      if (list.length > 0) {
        StorageSet('fetchVerion-ai-lang', list, 12 * 60 * 60)
      }
    })
  }

  const fetchPrompts = () => {
    if (PromptSetup.prompts.length > 0) {
      return
    }
    const cache = StorageGet('fetchVerion-ai-prompt')
    if (cache) {
      PromptSetup.prompts = reactive(cache)
      return
    }
    IPC.send('app-fork:ai', 'allPrompt').then((key: string, res: any) => {
      IPC.off(key)
      const list = res?.data ?? []
      PromptSetup.prompts = reactive(list)
      if (list.length > 0) {
        StorageSet('fetchVerion-ai-prompt', list, 12 * 60 * 60)
      }
    })
  }

  fetchLangs()
  fetchPrompts()

  const promptList = computed(() => {
    return PromptSetup.prompts.filter((p) => p.lang === PromptSetup.lang)
  })

  return {
    promptList
  }
}
