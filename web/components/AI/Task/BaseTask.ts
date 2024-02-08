import { AIStore } from '@web/components/AI/store'
import { I18nT } from '@shared/lang'
/**
 * content: 聊天内容
 * needInput: 是否需要用户的输入
 * 任务运行方法
 */
export interface BaseTaskItem {
  content?: () => void
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
      if (this.state === 'normal' && task.needInput) {
        this.state = 'waitInput'
        return
      }
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
            content: I18nT('ai.任务执行失败', { err: e.toString() })
          })
        })
    }
    if (this.state === 'waitInput') {
      doRun()
      return
    }
    if (task?.content) {
      task?.content()
    }
    doRun()
  }
}

export default BaseTask
