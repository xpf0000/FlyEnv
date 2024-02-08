import type BaseTask from '@web/components/AI/Task/BaseTask'
import { AppStore } from '@web/store/app'
import { BrewStore } from '@web/store/brew'
import { AIStore } from '@web/components/AI/store'
import { fetchInstalled, killPort } from './Util'
import { I18nT } from '@shared/lang'
import { startService } from '@web/fn'

export function startNginx(this: BaseTask) {
  return new Promise(async (resolve, reject) => {
    await fetchInstalled(['nginx'])
    const appStore = AppStore()
    const brewStore = BrewStore()
    const current = appStore.config.server?.nginx?.current
    const installed = brewStore?.nginx?.installed
    let nginx = installed?.find((i) => i.path === current?.path && i.version === current?.version)
    if (!nginx || !nginx?.version) {
      nginx = installed?.find((i) => !!i.path && !!i.version)
    }
    if (!nginx || !nginx?.version) {
      reject(new Error(I18nT('ai.未发现可用版本')))
      return
    }
    const res = await startService('nginx', nginx)
    if (res === true) {
      const aiStore = AIStore()
      aiStore.chatList.push({
        user: 'ai',
        content: I18nT('ai.Nginx服务启动成功')
      })
      resolve(true)
      return
    }
    if (typeof res === 'string') {
      const regex =
        /nginx: \[emerg\] bind\(\) to ([\d\.]*):(\d+) failed \(48: Address already in use\)/g
      if (regex.test(res)) {
        const aiStore = AIStore()
        aiStore.chatList.push({
          user: 'ai',
          content: I18nT('ai.服务启动失败端口占用', { err: res })
        })
        regex.lastIndex = 0
        const port = new Set()
        let m
        while ((m = regex.exec(res)) !== null) {
          if (m && m.length > 2) {
            port.add(m[2])
          }
        }
        await killPort.call(this, Array.from(port))
        try {
          await startNginx.call(this)
        } catch (e) {
          reject(e)
          return
        }
        resolve(true)
        return
      }
      reject(new Error(res))
    }
  })
}
