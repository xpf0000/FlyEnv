import { defineStore } from 'pinia'
import type { AIChatItem } from '@shared/app'
import type BaseTask from '@/components/AI/Task/BaseTask'

interface State {
  show: boolean
  chatList: Array<AIChatItem>
  currentTask?: BaseTask
}

const state: State = {
  show: false,
  chatList: [
    {
      user: 'ai',
      content: '你好， 我是pipi，有什么可以帮你的吗？'
    },
    {
      user: 'ai',
      content: '可以直接输入你的要求，比如新建站点'
    },
    {
      user: 'user',
      content: '帮我在 XXXXX 文件夹创建站点， 然后启动 php mysql 和 nginx'
    }
  ],
  currentTask: undefined
}

export const AIStore = defineStore('ai', {
  state: (): State => state,
  getters: {},
  actions: {}
})
