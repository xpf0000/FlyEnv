import BaseTask from '@web/components/AI/Task/BaseTask'
import { AIStore } from '@web/components/AI/store'
import { startApache } from '@web/components/AI/Fn/Apache'
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
