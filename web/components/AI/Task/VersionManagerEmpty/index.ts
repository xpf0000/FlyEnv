import BaseTask from '@web/components/AI/Task/BaseTask'
import { AIStore } from '@web/components/AI/store'
import { I18nT } from '@shared/lang'

export class VersionManagerEmpty extends BaseTask {
  constructor() {
    super()
    this.task = [
      {
        content: () => {
          const aiStore = AIStore()
          aiStore.chatList.push({
            user: 'ai',
            content: I18nT('ai.brewNetIssues')
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
