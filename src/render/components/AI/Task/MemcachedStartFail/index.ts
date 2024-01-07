import BaseTask from '@/components/AI/Task/BaseTask'
import { AIStore } from '@/components/AI/store'
import { killPort } from '@/components/AI/Fn/Util'
import { startMemcached } from '@/components/AI/Fn/Memcached'
import { I18nT } from '@shared/lang'

export class MemcachedStartFail extends BaseTask {
  constructor() {
    super()
    this.task = [
      {
        content: () => {
          const aiStore = AIStore()
          aiStore.chatList.push({
            user: 'ai',
            content: I18nT('ai.请查看日志', { flag: 'Memcached' })
          })
        },
        needInput: true,
        run: (err: string) => {
          return new Promise(async (resolve, reject) => {
            const aiStore = AIStore()
            const regex = /failed to listen on TCP port (\d+): Address already in use/g
            if (regex.test(err)) {
              aiStore.chatList.push({
                user: 'ai',
                content: I18nT('ai.识别到端口占用')
              })
              regex.lastIndex = 0
              const port = new Set()
              let m
              while ((m = regex.exec(err)) !== null) {
                console.log(m)
                if (m && m.length > 1) {
                  port.add(m[1])
                }
              }
              if (port.size > 0) {
                await killPort.call(this, Array.from(port))
              }
              startMemcached
                .call(this)
                .then(() => {
                  resolve(true)
                })
                .catch((e) => {
                  reject(e)
                })
              return
            }
            reject(new Error(I18nT('ai.未识别到错误原因')))
          })
        }
      }
    ]
  }
}
