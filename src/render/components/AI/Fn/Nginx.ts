import type BaseTask from '@/components/AI/Task/BaseTask'
import { AppStore } from '@/store/app'
import { BrewStore } from '@/store/brew'
import { AIStore } from '@/components/AI/store'
import { killPort } from './Util'
import { I18nT } from '@lang/index'

export function startNginx(this: BaseTask) {
  return new Promise(async (resolve, reject) => {
    const appStore = AppStore()
    const brewStore = BrewStore()
    await brewStore.module('nginx').fetchInstalled()
    const current = appStore.config.server?.nginx?.current
    const installed = brewStore.module('nginx').installed
    let nginx = installed?.find((i) => i.path === current?.path && i.version === current?.version)
    if (!nginx || !nginx?.version) {
      nginx = installed?.find((i) => !!i.path && !!i.version)
    }
    if (!nginx || !nginx?.version) {
      reject(new Error(I18nT('ai.noAvailableVersion')))
      return
    }
    const res = await brewStore.module('nginx').start()
    if (res === true) {
      const aiStore = AIStore()
      aiStore.chatList.push({
        user: 'ai',
        content: I18nT('ai.nginxServiceStarted')
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
