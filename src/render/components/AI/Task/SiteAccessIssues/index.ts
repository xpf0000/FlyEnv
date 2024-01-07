import BaseTask from '@/components/AI/Task/BaseTask'
import { AIStore } from '@/components/AI/store'
import { I18nT } from '@shared/lang'

export class SiteAccessIssues extends BaseTask {
  constructor() {
    super()
    this.task = [
      {
        content: () => {
          const aiStore = AIStore()
          aiStore.chatList.push({
            user: 'ai',
            content: I18nT('ai.站点错误码是否以下几种'),
            action: 'SiteAccessIssues'
          })
        },
        run: () => {
          return new Promise(async (resolve) => {
            resolve(true)
          })
        }
      }
    ]
  }
}
