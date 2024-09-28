import type BaseTask from '@/components/AI/Task/BaseTask'
import { AppStore } from '@/store/app'
import { BrewStore } from '@/store/brew'
import { startService } from '@/util/Service'
import { AIStore } from '@/components/AI/store'
import { fetchInstalled } from '@/components/AI/Fn/Util'
import { I18nT } from '@shared/lang'

export function startMemcached(this: BaseTask) {
  return new Promise(async (resolve, reject) => {
    await fetchInstalled(['memcached'])
    const appStore = AppStore()
    const brewStore = BrewStore()
    const current = appStore.config.server?.memcached?.current
    const installed = brewStore.module('memcached')?.installed
    let memcached = installed?.find(
      (i) => i.path === current?.path && i.version === current?.version
    )
    if (!memcached || !memcached?.version) {
      memcached = installed?.find((i) => !!i.path && !!i.version)
    }
    if (!memcached || !memcached?.version) {
      reject(new Error(I18nT('ai.未发现可用版本')))
      return
    }
    const res = await startService('memcached', memcached)
    if (res === true) {
      const aiStore = AIStore()
      aiStore.chatList.push({
        user: 'ai',
        content: I18nT('ai.Memcached服务启动成功')
      })
      resolve(true)
      return
    }
    reject(new Error(res as string))
  })
}
