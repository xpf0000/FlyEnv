import { computed, nextTick, reactive, ref, watch } from 'vue'
import IPC from '@/util/IPC'
import { StorageGet, StorageSet } from '@/util/Storage'
import { AppStore } from '@/store/app'
import { uuid } from '@/util/Index'
import { AsyncComponentShow } from '@/util/AsyncComponent'
import { AISetup } from '@/components/AI/setup'

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

type PromptSetupType = {
  delCustomPrompt: (item: PromptItem) => void
  addCustomPrompt: (form: PromptItem) => void
  save: () => void
  init: () => void
  lang: string
  langs: LangItem[]
  prompts: PromptItem[]
  customPrompts: PromptItem[]
}

export const PromptSetup = reactive<PromptSetupType>({
  lang: '',
  langs: [],
  prompts: [],
  customPrompts: [],
  init() {
    if (PromptSetup.lang) {
      return
    }
    const data = StorageGet('flyenv-ai-custom-prompt')
    if (data) {
      PromptSetup.lang = data.lang
      PromptSetup.customPrompts = reactive(data.customPrompts)
      return
    }
    const appStore = AppStore()
    const lang = appStore.config.setup.lang
    if (lang === 'zh') {
      PromptSetup.lang = 'zh-Hans'
    } else {
      PromptSetup.lang = 'en'
    }
  },
  delCustomPrompt(item: PromptItem) {
    const index = PromptSetup.customPrompts.findIndex((f) => f.id === item.id)
    if (index >= 0) {
      PromptSetup.customPrompts.splice(index, 1)
    }
    PromptSetup.save()
  },
  addCustomPrompt(form: PromptItem) {
    if (form.id) {
      const data = reactive({ ...form })
      const index = PromptSetup.customPrompts.findIndex((f) => f.id === form.id)
      if (index >= 0) {
        PromptSetup.customPrompts[index] = data
      }
    } else {
      const data = { ...form }
      data.id = uuid()
      PromptSetup.customPrompts.unshift(reactive(data))
    }
    PromptSetup.save()
  },
  save() {
    StorageSet(
      'flyenv-ai-custom-prompt',
      {
        lang: PromptSetup.lang,
        customPrompts: PromptSetup.customPrompts
      },
      60 * 60 * 24 * 365 * 100
    )
  }
})

export const Setup = () => {
  const poperShow = ref<boolean | null>(null)
  PromptSetup.init()
  const fetchLangs = () => {
    if (PromptSetup.langs.length > 0) {
      return
    }
    const cache = StorageGet('fetchVerion-ai-lang')
    if (cache) {
      console.log('fetchLangs cache: ', cache)
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

  const onPoperShow = () => {
    fetchLangs()
    fetchPrompts()
  }

  const onPoperHide = () => {
    poperShow.value = false
  }

  const promptList = computed(() => {
    return PromptSetup.prompts.filter((p) => p.lang === PromptSetup.lang).reverse()
  })

  let EditVM: any
  import('./add.vue').then((res) => {
    EditVM = res.default
  })

  const showAdd = (item: any) => {
    AsyncComponentShow(EditVM, {
      item
    }).then(() => {
      poperShow.value = null
    })
    poperShow.value = true
  }

  const usePrompt = (item: PromptItem) => {
    AISetup.updateCurrentChatPrompt(item)
    poperShow.value = false
    nextTick(() => {
      poperShow.value = null
    })
  }

  watch(() => PromptSetup.lang, PromptSetup.save)

  return {
    promptList,
    showAdd,
    poperShow,
    usePrompt,
    onPoperShow,
    onPoperHide
  }
}
