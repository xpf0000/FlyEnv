import type BaseTask from '@/components/AI/Task/BaseTask'
import { AppStore } from '@/store/app'
import { BrewStore } from '@/store/brew'
import { AIStore } from '@/components/AI/store'
import { killPort } from '@/components/AI/Fn/Util'
import { I18nT } from '@lang/index'

export function startApache(this: BaseTask) {
  return new Promise(async (resolve, reject) => {
    const appStore = AppStore()
    const brewStore = BrewStore()
    await brewStore.module('apache').fetchInstalled()
    const current = appStore.config.server?.apache?.current
    const installed = brewStore.module('apache').installed
    let apache = installed?.find((i) => i.path === current?.path && i.version === current?.version)
    if (!apache || !apache?.version) {
      apache = installed?.find((i) => !!i.path && !!i.version)
    }
    if (!apache || !apache?.version) {
      reject(new Error(I18nT('ai.noAvailableVersion')))
      return
    }
    const res = await brewStore.module('apache').start()
    if (res === true) {
      const aiStore = AIStore()
      aiStore.chatList.push({
        user: 'ai',
        content: I18nT('ai.apacheServiceStarted')
      })
      resolve(true)
      return
    }
    if (typeof res === 'string') {
      const regex =
        // @ts-ignore
        /\(48\)Address already in use: AH00072: make_sock: could not bind to address ([\d\.\[:\]]*):(\d+)/g
      if (regex.test(res)) {
        const aiStore = AIStore()
        aiStore.chatList.push({
          user: 'ai',
          content: I18nT('ai.serviceStartFailedPort', { err: res })
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
          content: I18nT('ai.apacheServiceStarted')
        })
        resolve(true)
        return
      }
      reject(new Error(res))
    }
  })
}
