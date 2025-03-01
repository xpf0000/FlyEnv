import { reactive } from 'vue'

export type PromptItem = {
  id: string
  lang: string
  name: string
  prompt: string
}

export const PromptSetup = reactive<{
  lang: string
  list: PromptItem[]
}>({
  lang: '',
  list: []
})

export const Setup = () => {
  return {}
}
