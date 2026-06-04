import { createConnection } from 'net'
import { uuid } from './Fn'
import {
  AppHelperCheck,
  AppHelperSocketPathGet,
  getHelperKey,
  helperTaskAuthFields,
  signTaskItem
} from '@shared/AppHelperCheck'
import type { AppHelper } from '../main/core/AppHelper'
import JSON5 from 'json5'
import { appDebugLog } from '@shared/utils'

type Module =
  | 'helper'
  | 'tools'
  | 'mariadb'
  | 'redis'
  | 'php'
  | 'mailpit'
  | 'mysql'
  | 'rabbitmq'
  | 'host'
type FN =
  | 'version'
  | 'writeFileByRoot'
  | 'writeBufferBase64ByRoot'
  | 'readFileByRoot'
  | 'processList'
  | 'macportsDirFixed'
  | 'logFileFixed'
  | 'iniFileFixed'
  | 'rm'
  | 'kill'
  | 'binFixed'
  | 'ln_s'
  | 'initPlugin'
  | 'sslAddTrustedCert'
  | 'sslFindCertificate'
  | 'dnsRefresh'
  | 'killPorts'
  | 'getPortPids'
  | 'chmod'
  | 'processListWin'
  | 'getSystemPath'
  | 'setSystemPath'
  | 'setSystemEnv'
  | 'runScript'
  | 'setAutoStartWin'
  | 'removeLoginItemMac'

class Helper {
  enable = false
  appHelper?: AppHelper
  private helperKey: Buffer | null = null

  async ensureKey() {
    if (this.helperKey) return
    this.helperKey = await getHelperKey()
  }

  private validatePathArg(arg: any): boolean {
    if (typeof arg !== 'string') return true
    if (!arg.includes('/') && !arg.includes('\\')) return true
    const parts = arg.replace(/\\/g, '/').split('/')
    if (parts.some((p) => p === '..')) return false
    return true
  }

  private validateSendArgs(module: string, fn: string, args: any[]): boolean {
    for (const arg of args) {
      if (typeof arg === 'string') {
        if (!this.validatePathArg(arg)) return false
      } else if (Array.isArray(arg)) {
        for (const item of arg) {
          if (typeof item === 'string' && !this.validatePathArg(item)) {
            return false
          }
        }
      }
    }
    return true
  }

  send<T>(module: Module, fn: FN, ...args: any): Promise<T> {
    return new Promise(async (resolve, reject) => {
      console.trace('Helper.send: ', module, fn, ...args)
      let settled = false

      const resolveOnce = (value: T) => {
        if (settled) {
          return
        }
        settled = true
        resolve(value)
      }

      const rejectOnce = (error: Error) => {
        if (settled) {
          return
        }
        settled = true
        reject(error)
      }

      if (!this.validateSendArgs(module, fn, args)) {
        rejectOnce(new Error('Path traversal detected'))
        return
      }

      if (!this.enable) {
        try {
          await AppHelperCheck()
          this.enable = true
        } catch (e) {
          this.enable = false
          if (this.appHelper) {
            this.appHelper.needInstall()
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
          rejectOnce(e instanceof Error ? e : new Error(`${e}`))
          return
        }
      }
      await this.ensureKey()
      const key = uuid()
      const client = createConnection(AppHelperSocketPathGet())
      const buffer: Buffer[] = []

      const closeClient = () => {
        try {
          client.destroy()
        } catch {}
      }

      const handleSocketError = (error: Error) => {
        appDebugLog(
          '[Fork][Helper][error]',
          `${JSON.stringify({
            module,
            fn,
            args,
            error: {
              message: error.message,
              code: (error as NodeJS.ErrnoException).code
            }
          })}`
        ).catch()
        closeClient()
        console.log('connect failed error: ', error)
        rejectOnce(error)
      }

      client.on('connect', () => {
        const param: any = {
          key,
          module,
          function: fn,
          args,
          ...helperTaskAuthFields()
        }
        if (this.helperKey) {
          param.sig = signTaskItem(this.helperKey, param)
        }
        console.log('Connected to server', param)
        try {
          client.write(JSON.stringify(param), (error?: Error | null) => {
            if (error) {
              handleSocketError(error)
            }
          })
        } catch (e) {
          handleSocketError(e instanceof Error ? e : new Error(`${e}`))
        }
      })

      client.on('data', (data: any) => {
        buffer.push(data)
      })

      client.on('end', () => {
        closeClient()
        console.log('Disconnected from server')
        let res: any
        try {
          const content = Buffer.concat(buffer).toString().trim()
          res = JSON5.parse(content)
        } catch {}
        if (res && res?.key && res?.key === key) {
          buffer.splice(0)
          if (res?.code === 0) {
            return resolveOnce(res?.data)
          }
        }
        return rejectOnce(new Error(res?.msg ?? 'Execution failed'))
      })

      client.on('error', (error) => {
        handleSocketError(error)
      })
    })
  }
}
export default new Helper()
