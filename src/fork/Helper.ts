import { createConnection } from 'net'
import { uuid } from './Fn'
import type { TaskItem } from '../helper/type'
import { AppHelperCheck, AppHelperSocketPathGet } from '@shared/AppHelperCheck'
import type { AppHelper } from '../main/core/AppHelper'
import JSON5 from 'json5'
import { appDebugLog } from '@shared/utils'

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
      })

      client.on('end', () => {
        try {
          client.destroySoon()
        } catch {}
        console.log('Disconnected from server')
        let res: any
        try {
          const content = Buffer.concat(buffer).toString().trim()
          res = JSON5.parse(content)
        } catch {}
        if (res && res?.key && res?.key === key) {
          buffer.splice(0)
          if (res?.code === 0) {
            return resolve(res?.data)
          }
        }
        return reject(new Error(res?.msg ?? 'Execution failed'))
      })

      client.on('error', (error) => {
        appDebugLog(
          '[Fork][Helper][error]',
          `${JSON.stringify({
            module,
            fn,
            args,
            error
          })}`
        ).catch()
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
