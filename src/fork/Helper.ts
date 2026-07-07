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
import { appDebugLog, isWindows } from '@shared/utils'
import { AppHelperError, resolveWindowsHelperTransport } from '@shared/WindowsHelperState'
import { runWindowsHelperFallback } from '@shared/WindowsHelperFallback'

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

type HelperDeps = {
  createConnection: typeof createConnection
  appHelperCheck: typeof AppHelperCheck
  getHelperKey: typeof getHelperKey
  isWindows: typeof isWindows
  resolveWindowsHelperTransport: typeof resolveWindowsHelperTransport
  runWindowsHelperFallback: typeof runWindowsHelperFallback
}

const defaultHelperDeps: HelperDeps = {
  createConnection,
  appHelperCheck: AppHelperCheck,
  getHelperKey,
  isWindows,
  resolveWindowsHelperTransport,
  runWindowsHelperFallback
}

export class Helper {
  enable = false
  appHelper?: AppHelper
  private helperKey: Buffer | null = null

  constructor(private readonly deps: HelperDeps = defaultHelperDeps) {}

  async ensureKey() {
    if (this.helperKey) return
    this.helperKey = await this.deps.getHelperKey()
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

  private notifyNeedInstall() {
    if (this.appHelper) {
      this.appHelper.needInstall()
      return
    }
    process?.send?.({
      on: true,
      key: 'App-Need-Init-FlyEnv-Helper',
      info: {
        code: 200,
        msg: 'App-Need-Init-FlyEnv-Helper'
      }
    })
  }

  private normalizeError(error: unknown): Error {
    if (error instanceof Error) {
      return error
    }
    return new Error(`${error}`)
  }

  private async routeUnavailableHelper<T>(
    error: unknown,
    module: Module,
    fn: FN,
    args: any[]
  ): Promise<{ handled: boolean; value?: T }> {
    const transport = this.deps.isWindows()
      ? this.deps.resolveWindowsHelperTransport(error, module, fn)
      : 'prompt'

    if (transport === 'fallback') {
      this.enable = false
      const result = (await this.deps.runWindowsHelperFallback(module, fn, args)) as T
      return { handled: true, value: result }
    }

    if (transport === 'prompt') {
      this.enable = false
      this.notifyNeedInstall()
      throw this.normalizeError(error)
    }

    this.enable = false
    throw this.normalizeError(error)
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
          await this.deps.appHelperCheck()
          this.enable = true
        } catch (error) {
          try {
            const routed = await this.routeUnavailableHelper<T>(error, module, fn, args)
            if (routed.handled) {
              resolveOnce(routed.value as T)
            }
          } catch (routeError) {
            rejectOnce(this.normalizeError(routeError))
          }
          return
        }
      }
      await this.ensureKey()
      const key = uuid()
      const client = this.deps.createConnection(AppHelperSocketPathGet())
      const buffer: Buffer[] = []
      let transportFailed = false

      const closeClient = () => {
        try {
          client.destroy()
        } catch {}
      }

      const handleSocketError = async (error: Error) => {
        if (settled || transportFailed) {
          return
        }
        transportFailed = true
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
        try {
          const routed = await this.routeUnavailableHelper<T>(
            new AppHelperError('helper_execution_failed', error.message),
            module,
            fn,
            args
          )
          if (routed.handled) {
            resolveOnce(routed.value as T)
          }
        } catch (routeError) {
          rejectOnce(this.normalizeError(routeError))
        }
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
              handleSocketError(error).catch((routeError) => {
                rejectOnce(this.normalizeError(routeError))
              })
              return
            }
          })
        } catch (e) {
          handleSocketError(e instanceof Error ? e : new Error(`${e}`)).catch((routeError) => {
            rejectOnce(this.normalizeError(routeError))
          })
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
        handleSocketError(error).catch((routeError) => {
          rejectOnce(this.normalizeError(routeError))
        })
      })
    })
  }
}

export const createHelper = (deps: Partial<HelperDeps> = {}) => {
  return new Helper({
    ...defaultHelperDeps,
    ...deps
  })
}

export default createHelper()
