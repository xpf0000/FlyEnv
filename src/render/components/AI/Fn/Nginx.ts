import type BaseTask from '@/components/AI/Task/BaseTask'
import { AppStore } from '@/store/app'
import { BrewStore } from '@/store/brew'
import { startService } from '@/util/Service'
import { AIStore } from '@/components/AI/store'
import { killPort } from './Util'

export function startNginx(this: BaseTask) {
  return new Promise(async (resolve, reject) => {
    const appStore = AppStore()
    const brewStore = BrewStore()
    const current = appStore.config.server?.nginx?.current
    const installed = brewStore?.nginx?.installed
    let nginx = installed?.find((i) => i.path === current?.path && i.version === current?.version)
    if (!nginx || !nginx?.version) {
      nginx = installed?.find((i) => !!i.path && !!i.version)
    }
    if (!nginx || !nginx?.version) {
      reject(new Error('未发现可用版本，请先安装'))
      return
    }
    const res = await startService('nginx', nginx)
    if (res === true) {
      const aiStore = AIStore()
      aiStore.chatList.push({
        user: 'ai',
        content: `Nginx服务启动成功`
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
          content: `服务启动失败，错误原因：
          ${res}
          识别到错误原因: 端口占用，尝试结束占用端口的进程`
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
