import type BaseTask from '@/components/AI/Task/BaseTask'
import { startService } from '@/util/Service'
import { AIStore } from '@/components/AI/store'
import type { SoftInstalled } from '@shared/app'

export function startPhp(this: BaseTask, version: SoftInstalled) {
  return new Promise(async (resolve, reject) => {
    const res = await startService('php', version)
    if (res === true) {
      const aiStore = AIStore()
      aiStore.chatList.push({
        user: 'ai',
        content: `Php${version.num}服务启动成功`
      })
      resolve(true)
    } else if (typeof res === 'string') {
      reject(new Error(res))
    }
  })
}
