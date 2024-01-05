import { AIStore } from '@/components/AI/store'

/**
 * content: 聊天内容
 * needInput: 是否需要用户的输入
 * 任务运行方法
 */
export interface BaseTaskItem {
  content?: string
  needInput?: boolean
  run: (...args: any) => Promise<any>
}
class BaseTask {
  task: Array<BaseTaskItem> = []
  currentTask?: BaseTaskItem
  state: 'waitInput' | 'normal' | 'running' | 'failed' | 'success' = 'normal'
  constructor() {}
  next(param?: any) {
    if (this.state === 'failed' || this.state === 'success' || this.state === 'running') {
      return
    }
    if (!this.currentTask) {
      const task = this.task.shift()
      if (!task) {
        this.state = 'success'
        return
      }
      this.currentTask = task
    }
    const task = this.currentTask
    const doRun = () => {
      this.state = 'running'
      task
        ?.run(param)
        .then((res) => {
          this.state = 'normal'
          this.currentTask = undefined
          this.next(res)
        })
        .catch((e) => {
          this.state = 'failed'
          this.currentTask = undefined
          const aiStore = AIStore()
          aiStore.chatList.push({
            user: 'ai',
            content: '任务执行失败，原因: \n' + e.toString()
          })
        })
    }
    if (this.state === 'waitInput') {
      doRun()
      return
    }
    if (task?.content) {
      const aiStore = AIStore()
      aiStore.chatList.push({
        user: 'ai',
        content: task.content
      })
    }
    doRun()
  }
}

export default BaseTask
