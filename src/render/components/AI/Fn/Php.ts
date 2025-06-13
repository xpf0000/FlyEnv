import type BaseTask from '@/components/AI/Task/BaseTask'
import { AIStore } from '@/components/AI/store'
import type { SoftInstalled } from '@shared/app'
import { I18nT } from '@lang/index'
import { BrewStore } from '@/store/brew'

export function startPhp(this: BaseTask, version: SoftInstalled) {
  return new Promise(async (resolve, reject) => {
    const brewStore = BrewStore()
    const res = await brewStore.module('php').start()
    if (res === true) {
      const aiStore = AIStore()
      aiStore.chatList.push({
        user: 'ai',
        content: I18nT('ai.phpServiceStarted', { num: version.num })
      })
      resolve(true)
    } else if (typeof res === 'string') {
      reject(new Error(res))
    }
  })
}
