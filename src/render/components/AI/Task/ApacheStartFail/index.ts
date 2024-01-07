import BaseTask from '@/components/AI/Task/BaseTask'
import { AIStore } from '@/components/AI/store'
import { startApache } from '@/components/AI/Fn/Apache'
import { I18nT } from '@shared/lang'

export class ApacheStartFail extends BaseTask {
  constructor() {
    super()
    this.task = [
      {
        content: () => {
          const aiStore = AIStore()
          aiStore.chatList.push({
            user: 'ai',
            content: I18nT('ai.尝试启动Apache服务')
          })
        },
        run: startApache.bind(this)
      }
    ]
  }
}
