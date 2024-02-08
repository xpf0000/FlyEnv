import type BaseTask from '@web/components/AI/Task/BaseTask'
import { AppStore } from '@web/store/app'
import { BrewStore } from '@web/store/brew'
import { AIStore } from '@web/components/AI/store'
import { fetchInstalled, killPort } from '@web/components/AI/Fn/Util'
import { I18nT } from '@shared/lang'
import { startService } from '@web/fn'

export function startApache(this: BaseTask) {
  return new Promise(async (resolve, reject) => {
    await fetchInstalled(['apache'])
    const appStore = AppStore()
    const brewStore = BrewStore()
    const current = appStore.config.server?.apache?.current
    const installed = brewStore?.apache?.installed
    let apache = installed?.find((i) => i.path === current?.path && i.version === current?.version)
    if (!apache || !apache?.version) {
      apache = installed?.find((i) => !!i.path && !!i.version)
    }
    if (!apache || !apache?.version) {
      reject(new Error(I18nT('ai.未发现可用版本')))
      return
    }
    const res = await startService('apache', apache)
    if (res === true) {
      const aiStore = AIStore()
      aiStore.chatList.push({
        user: 'ai',
        content: I18nT('ai.Apache服务启动成功')
      })
      resolve(true)
      return
    }
    if (typeof res === 'string') {
      const regex =
        /\(48\)Address already in use: AH00072: make_sock: could not bind to address ([\d\.\[:\]]*):(\d+)/g
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
          await startApache.call(this)
        } catch (e) {
          reject(e)
          return
        }
        aiStore.chatList.push({
          user: 'ai',
          content: I18nT('ai.Apache服务启动成功')
        })
        resolve(true)
        return
      }
      reject(new Error(res))
    }
  })
}
