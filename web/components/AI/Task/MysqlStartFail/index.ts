import BaseTask from '@web/components/AI/Task/BaseTask'
import { AIStore } from '@web/components/AI/store'
import { killPid, killPort } from '@web/components/AI/Fn/Util'
import { startMysql } from '@web/components/AI/Fn/Mysql'
import { I18nT } from '@shared/lang'

export class MysqlStartFail extends BaseTask {
  constructor() {
    super()
    this.task = [
      {
        content: () => {
          const aiStore = AIStore()
          aiStore.chatList.push({
            user: 'ai',
            content: I18nT('ai.checkLogs', { flag: 'Mysql' })
          })
        },
        needInput: true,
        run: (err: string) => {
          return new Promise(async (resolve, reject) => {
            const aiStore = AIStore()
            let regex = /another process with PID (\d+) is using UNIX socket file/g
            if (regex.test(err)) {
              aiStore.chatList.push({
                user: 'ai',
                content: I18nT('ai.socketOccupationDetected')
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
                await killPid.call(this, Array.from(port))
              }
              startMysql
                .call(this)
                .then(() => {
                  resolve(true)
                })
                .catch((e) => {
                  reject(e)
                })
              return
            }
            regex =
              /port: (\d+) failed, `bind\(\)` failed with error: Address already in use \(48\)/g
            if (regex.test(err)) {
              aiStore.chatList.push({
                user: 'ai',
                content: I18nT('ai.portOccupationDetected')
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
              startMysql
                .call(this)
                .then(() => {
                  resolve(true)
                })
                .catch((e) => {
                  reject(e)
                })
              return
            }
            reject(new Error(I18nT('ai.errorCauseNotIdentified')))
          })
        }
      }
    ]
  }
}
