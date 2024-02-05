import BaseTask from '@/components/AI/Task/BaseTask'
import { AIStore } from '@/components/AI/store'
import { I18nT } from '@shared/lang'

export class HomebrewInstall extends BaseTask {
  constructor() {
    super()
    this.task = [
      {
        content: () => {
          const aiStore = AIStore()
          aiStore.chatList.push({
            user: 'ai',
            content: global.Server.BrewCellar
              ? I18nT('ai.brewHasInstall')
              : I18nT('ai.brewNotInstall')
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
