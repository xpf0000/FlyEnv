import { createConnection } from 'net'
import {
  AppHelperCheck,
  AppHelperSocketPathGet,
  getHelperKey,
  helperResponseErrorCode,
  helperTaskAuthFields,
  signTaskItem,
  windowsHelperBinaryExists
} from '@shared/AppHelperCheck'
import type { AppHelper } from '../main/core/AppHelper'
import JSON5 from 'json5'
import { appDebugLog, isWindows, uuid } from '@shared/utils'
import {
  AppHelperError,
  isAppHelperError,
  isWindowsHelperFallbackAllowed,
  resolveWindowsElevationMethod,
  resolveWindowsHelperTransport,
  type AppHelperErrorCode,
  type WindowsElevationMethod
} from '@shared/WindowsHelperState'

type Module =
  'helper' | 'tools' | 'mariadb' | 'redis' | 'php' | 'mailpit' | 'mysql' | 'rabbitmq' | 'host'
type FN =
  | 'version'
  | 'health'
  | 'writeFileByRoot'
  | 'writeBufferBase64ByRoot'
  | 'installFlyEnvPowerShellIntegration'
  | 'ensureFlyEnvDataDirectory'
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

type WindowsHelperFallback = typeof import('@shared/WindowsHelperFallback').runWindowsHelperFallback

const summarizeHelperArgs = (args: any[]) =>
  args.map((arg) => {
    if (typeof arg === 'string') {
      return { type: 'string', length: arg.length }
    }
    if (Array.isArray(arg)) {
      return { type: 'array', length: arg.length }
    }
    if (arg && typeof arg === 'object') {
      return { type: 'object', keys: Object.keys(arg).slice(0, 32) }
    }
    return { type: typeof arg }
  })

const lazyWindowsHelperFallback: WindowsHelperFallback = async (...args) => {
  const { runWindowsHelperFallback } = await import('@shared/WindowsHelperFallback')
  return runWindowsHelperFallback(...args)
}

type HelperDeps = {
  createConnection: typeof createConnection
  appHelperCheck: typeof AppHelperCheck
  getHelperKey: typeof getHelperKey
  helperBinaryExists: () => boolean
  helperRequestTimeoutMs: number
  isWindows: typeof isWindows
  getWindowsElevationMethod: () => WindowsElevationMethod
  notifyWindowsElevationFallback: (reason: AppHelperErrorCode) => void
  resolveWindowsHelperTransport: typeof resolveWindowsHelperTransport
  runWindowsHelperFallback: WindowsHelperFallback
}

const defaultHelperDeps: HelperDeps = {
  createConnection,
  appHelperCheck: AppHelperCheck,
  getHelperKey,
  helperBinaryExists: () => !isWindows() || !global.Server?.Static || windowsHelperBinaryExists(),
  helperRequestTimeoutMs: 30_000,
  isWindows,
  getWindowsElevationMethod: () =>
    resolveWindowsElevationMethod(global.Server?.WindowsElevationMethod),
  notifyWindowsElevationFallback: (reason) => {
    process.send?.({
      on: true,
      key: 'App-Windows-Elevation-Method-Fallback',
      info: { code: 200, method: 'uac', reason }
    })
  },
  resolveWindowsHelperTransport,
  runWindowsHelperFallback: lazyWindowsHelperFallback
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

  private invalidateHelperState() {
    this.enable = false
    this.helperKey = null
  }

  private validatePathArg(arg: any): boolean {
    if (typeof arg !== 'string') return true
    if (!arg.includes('/') && !arg.includes('\\')) return true
    const parts = arg.replace(/\\/g, '/').split('/')
    if (parts.some((p) => p === '..')) return false
    return true
  }

  private validateSendArgs(module: string, fn: string, args: any[]): boolean {
    for (const [index, arg] of args.entries()) {
      if (module === 'tools' && fn === 'setSystemPath' && (index === 0 || index === 2)) {
        continue
      }
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

  private async runWindowsUacFallback<T>(module: Module, fn: FN, args: any[]): Promise<T> {
    if (!isWindowsHelperFallbackAllowed(module, fn)) {
      throw new AppHelperError(
        'windows_fallback_not_supported',
        'Windows UAC does not support ' + module + '/' + fn
      )
    }
    this.enable = false
    return (await this.deps.runWindowsHelperFallback(module, fn, args)) as T
  }

  private async routeUnavailableHelper<T>(
    error: unknown,
    module: Module,
    fn: FN,
    args: any[]
  ): Promise<{ handled: boolean; value?: T }> {
    if (this.deps.isWindows() && isAppHelperError(error, 'helper_binary_missing')) {
      this.invalidateHelperState()
    }
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
    return this.sendInternal<T>(module, fn, args, true)
  }

  private sendInternal<T>(
    module: Module,
    fn: FN,
    args: any[],
    retrySignature: boolean
  ): Promise<T> {
    return new Promise(async (resolve, reject) => {
      console.trace('[Fork][Helper][send]', {
        module,
        fn,
        argCount: args.length,
        args: summarizeHelperArgs(args)
      })
      let settled = false
      const isHelperFirstOperation =
        module === 'tools' &&
        (fn === 'installFlyEnvPowerShellIntegration' || fn === 'ensureFlyEnvDataDirectory')
      let requestTimer: ReturnType<typeof setTimeout> | undefined

      const clearRequestTimer = () => {
        if (requestTimer) {
          clearTimeout(requestTimer)
          requestTimer = undefined
        }
      }

      const resolveOnce = (value: T) => {
        if (settled) {
          return
        }
        settled = true
        clearRequestTimer()
        resolve(value)
      }

      const rejectOnce = (error: Error) => {
        if (settled) {
          return
        }
        settled = true
        clearRequestTimer()
        reject(error)
      }

      if (!this.validateSendArgs(module, fn, args)) {
        rejectOnce(new Error('Path traversal detected'))
        return
      }

      // A running fork can outlive the Helper binary (for example after an
      // antivirus cleanup). Invalidate the cached socket state before trying
      // to send another task, so the normal binary-missing route is used.
      if (this.deps.isWindows() && this.enable && !this.deps.helperBinaryExists()) {
        this.invalidateHelperState()
      }

      // These operations require a healthy Helper. A previous automatic UAC
      // fallback must not bypass it, because neither operation has a generic
      // UAC fallback and both can complete silently through the running Helper.
      if (
        this.deps.isWindows() &&
        this.deps.getWindowsElevationMethod() === 'uac' &&
        !isHelperFirstOperation
      ) {
        try {
          resolveOnce(await this.runWindowsUacFallback<T>(module, fn, args))
        } catch (error) {
          rejectOnce(this.normalizeError(error))
        }
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
      let requestParam: any

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
            args: summarizeHelperArgs(args),
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
            new AppHelperError('helper_pipe_unreachable', error.message),
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
        requestParam = {
          key,
          module,
          function: fn,
          args,
          ...helperTaskAuthFields()
        }
        if (this.helperKey) {
          requestParam.sig = signTaskItem(this.helperKey, requestParam)
        }
        console.log('[Fork][Helper][request]', {
          module,
          fn,
          argCount: args.length,
          args: summarizeHelperArgs(args),
          clientPid: requestParam.clientPid,
          clientExe: requestParam.clientExe,
          hasSignature: typeof requestParam.sig === 'string',
          signatureLength: typeof requestParam.sig === 'string' ? requestParam.sig.length : 0,
          timestamp: requestParam.ts,
          noncePresent: typeof requestParam.nonce === 'string' && requestParam.nonce.length > 0
        })
        try {
          client.write(JSON.stringify(requestParam), (error?: Error | null) => {
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
        if (settled || transportFailed) {
          return
        }
        console.log('Disconnected from server')
        let res: any
        try {
          const content = Buffer.concat(buffer).toString().trim()
          res = JSON5.parse(content)
        } catch {}
        if (res && res?.key && res?.key === key) {
          buffer.splice(0)
          if (res?.code === 0) {
            closeClient()
            return resolveOnce(res?.data)
          }
          const error = new AppHelperError(
            helperResponseErrorCode(res?.msg ?? ''),
            res?.msg ?? 'Execution failed'
          )
          transportFailed = true
          closeClient()

          if (error.code === 'helper_signature_invalid') {
            appDebugLog(
              '[Fork][Helper][signature-mismatch]',
              JSON.stringify({
                module,
                fn,
                requestId: requestParam?.key,
                clientPid: requestParam?.clientPid,
                clientExe: requestParam?.clientExe,
                helperKeyLength: this.helperKey?.length ?? 0,
                signatureLength:
                  typeof requestParam?.sig === 'string' ? requestParam.sig.length : 0,
                retry: retrySignature
              })
            ).catch(() => {})
            if (retrySignature) {
              clearRequestTimer()
              this.invalidateHelperState()
              this.sendInternal<T>(module, fn, args, false)
                .then(resolveOnce)
                .catch((retryError) => rejectOnce(this.normalizeError(retryError)))
              return
            }
            this.routeUnavailableHelper<T>(error, module, fn, args)
              .then((routed) => {
                if (routed.handled) {
                  resolveOnce(routed.value as T)
                  return
                }
                rejectOnce(error)
              })
              .catch((routeError) => rejectOnce(this.normalizeError(routeError)))
            return
          }
          return rejectOnce(error)
        }
        transportFailed = true
        closeClient()
        const error = new AppHelperError('helper_pipe_unreachable', 'Invalid Helper response')
        this.routeUnavailableHelper<T>(error, module, fn, args)
          .then((routed) => {
            if (routed.handled) {
              resolveOnce(routed.value as T)
              return
            }
            rejectOnce(error)
          })
          .catch((routeError) => {
            rejectOnce(this.normalizeError(routeError))
          })
      })

      client.on('error', (error) => {
        handleSocketError(error).catch((routeError) => {
          rejectOnce(this.normalizeError(routeError))
        })
      })

      if (this.deps.helperRequestTimeoutMs > 0) {
        requestTimer = setTimeout(() => {
          handleSocketError(
            new AppHelperError('helper_pipe_unreachable', 'Helper response timed out')
          ).catch((routeError) => {
            rejectOnce(this.normalizeError(routeError))
          })
        }, this.deps.helperRequestTimeoutMs)
      }
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
