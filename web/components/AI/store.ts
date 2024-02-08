import { defineStore } from 'pinia'
import type { AIChatItem } from '@shared/app'
import type BaseTask from '@web/components/AI/Task/BaseTask'

interface State {
  show: boolean
  chatList: Array<AIChatItem>
  currentTask?: BaseTask
}

const state: State = {
  show: false,
  chatList: [],
  currentTask: undefined
}

export const AIStore = defineStore('ai', {
  state: (): State => state,
  getters: {},
  actions: {}
})
