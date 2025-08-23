import { createConnection } from 'net'
import { uuid } from './Fn'
import type { TaskItem } from '../helper/type'
import { AppHelperCheck, AppHelperSocketPathGet } from '@shared/AppHelperCheck'
import type { AppHelper } from '../main/core/AppHelper'

type Module =
  | 'tools'
  | 'mariadb'
  | 'caddy'
  | 'redis'
  | 'php'
  | 'mailpit'
  | 'mysql'
  | 'rabbitmq'
  | 'host'
type FN =
  | 'writeFileByRoot'
  | 'readFileByRoot'
  | 'processList'
  | 'macportsDirFixed'
  | 'sslDirFixed'
  | 'logFileFixed'
  | 'iniFileFixed'
  | 'iniDefaultFileFixed'
  | 'rm'
  | 'kill'
  | 'binFixed'
  | 'ln_s'
  | 'exec'
  | 'initPlugin'
  | 'sslAddTrustedCert'
  | 'sslFindCertificate'
  | 'dnsRefresh'
  | 'killPorts'
  | 'getPortPids'
  | 'chmod'
  | 'getPortPidsWin'
  | 'processListWin'

class Helper {
  enable = false
  appHelper?: AppHelper

  send(module: Module, fn: FN, ...args: any) {
    return new Promise(async (resolve, reject) => {
      if (!this.enable) {
        try {
          await AppHelperCheck()
          this.enable = true
        } catch (e) {
          this.enable = false
          if (this.appHelper) {
            this.appHelper.initHelper().catch()
          } else {
            process?.send?.({
              on: true,
              key: 'App-Need-Init-FlyEnv-Helper',
              info: {
                code: 200,
                msg: 'App-Need-Init-FlyEnv-Helper'
              }
            })
          }
          reject(e)
          return
        }
      }

      const key = uuid()
      const client = createConnection(AppHelperSocketPathGet())
      const buffer: Buffer[] = []
      client.on('connect', () => {
        const param: TaskItem = {
          key,
          module,
          function: fn,
          args
        }
        console.log('Connected to server', param)
        client.write(JSON.stringify(param))
      })

      client.on('data', (data: any) => {
        buffer.push(data)
        let res: any
        try {
          const content = Buffer.concat(buffer).toString().trim()
          res = JSON.parse(content)
        } catch {}
        if (res && res?.key && res?.key === key) {
          buffer.splice(0)
          if (res?.code === 0) {
            resolve(res?.data)
          } else {
            reject(new Error(res?.msg ?? 'Execution failed'))
          }
          client.end() // Close connection
          return
        }
      })

      client.on('end', () => {
        console.log('Disconnected from server')
        try {
          client.destroySoon()
        } catch {}
      })

      client.on('error', (error) => {
        try {
          client.destroySoon()
        } catch {}
        console.log('connect failed error: ', error)
        reject(new Error('connect failed'))
      })
    })
  }
}
export default new Helper()
