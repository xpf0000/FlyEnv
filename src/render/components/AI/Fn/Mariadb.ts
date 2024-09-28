import type BaseTask from '@/components/AI/Task/BaseTask'
import { AppStore } from '@/store/app'
import { BrewStore } from '@/store/brew'
import { startService } from '@/util/Service'
import { AIStore } from '@/components/AI/store'
import { fetchInstalled } from '@/components/AI/Fn/Util'
import { I18nT } from '@shared/lang'

export function startMariaDB(this: BaseTask) {
  return new Promise(async (resolve, reject) => {
    await fetchInstalled(['mariadb'])
    const appStore = AppStore()
    const brewStore = BrewStore()
    const current = appStore.config.server?.mariadb?.current
    const installed = brewStore.module('mariadb')?.installed
    let mariadb = installed?.find((i) => i.path === current?.path && i.version === current?.version)
    if (!mariadb || !mariadb?.version) {
      mariadb = installed?.find((i) => !!i.path && !!i.version)
    }
    if (!mariadb || !mariadb?.version) {
      reject(new Error(I18nT('ai.未发现可用版本')))
      return
    }
    const res = await startService('mariadb', mariadb)
    if (res === true) {
      const aiStore = AIStore()
      aiStore.chatList.push({
        user: 'ai',
        content: I18nT('ai.MariaDB服务启动成功')
      })
      resolve(true)
      return
    }
    reject(new Error(res as string))
  })
}
