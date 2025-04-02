import BaseTask from '@web/components/AI/Task/BaseTask'
import { AIStore } from '@web/components/AI/store'
import { startNginx } from '@web/components/AI/Fn/Nginx'
import { I18nT } from '@shared/lang'

export class NginxStartFail extends BaseTask {
  constructor() {
    super()
    this.task = [
      {
        content: () => {
          const aiStore = AIStore()
          aiStore.chatList.push({
            user: 'ai',
            content: I18nT('ai.tryingToStartNginxService')
          })
        },
        run: startNginx.bind(this)
      }
    ]
  }
}
