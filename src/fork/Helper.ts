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
import { hasWindowsPrivilegeProvider } from '@shared/WindowsPrivilege'
import { appDebugLog, isWindows, uuid } from '@shared/utils'
import { timeOperation } from '@shared/OperationTiming'
import { bindWindowsPathLogger } from '@shared/WindowsPathDiagnostics'
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
  // 用户切换方式后旧 enable/key 缓存失效；下次确需 Helper 时重新做健康校验。
  private windowsPrivilegeRevision = -1

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
    if (this.deps.isWindows() && hasWindowsPrivilegeProvider()) {
      // 生产权限路由不再自动 fallback/repair，错误不能替用户决定使用另一种方式。
      this.invalidateHelperState()
      throw this.normalizeError(error)
    }
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
    if (this.deps.isWindows() && module !== 'helper' && hasWindowsPrivilegeProvider()) {
      if (this.windowsPrivilegeRevision !== global.Server?.WindowsPrivilegeRevision) {
        this.invalidateHelperState()
        this.windowsPrivilegeRevision = global.Server?.WindowsPrivilegeRevision ?? 0
      }
      // 在检查二进制、密钥或计划任务前进入共享权限路由；没有安装 Helper 的机器
      // 也必须能够通过用户已选 UAC 或当前管理员权限完成操作。
      // 先单独记录权限路由模块的冷导入，避免它落在 PATH 提交与首个权限阶段之间。
      return timeOperation(
        'privilege.import-router',
        () => import('@shared/WindowsPrivilegeOperation')
      ).then(({ executeWindowsPrivilegeOperation }) =>
        executeWindowsPrivilegeOperation<T>(module, fn, args, async (processes) => {
          if (!this.enable) {
            // 安装/修复归 main 所有；Helper 分支不得因准备失败而静默切换到 UAC。
            const method = await import('@shared/WindowsPrivilege').then(
              ({ resolveWindowsPrivilege }) => resolveWindowsPrivilege('helper/ready')
            )
            if (method !== 'helper')
              throw new AppHelperError(
                'windows_authorization_required',
                'Authorization method changed before Helper execution; retry the operation'
              )
          }
          const { withWindowsElevationLease } = await import('@shared/WindowsPrivilege')
          // 授权前采集的同一身份快照必须覆盖 Helper 实际执行的所有结束目标。
          // 新的四参数形状让普通 PID 与树模式都明确携带 mode 和身份数组。
          const helperArgs =
            module === 'tools' && fn === 'kill'
              ? [args[0], args[1], args[2] === true, processes ?? []]
              : module === 'tools' && fn === 'killPorts'
                ? [...args, processes ?? []]
                : args
          return withWindowsElevationLease(
            () => this.sendInternal<T>(module, fn, helperArgs, true, true),
            'helper'
          )
        })
      )
    }
    // The helper-only legacy tuple has no authorized process identity snapshot.
    // Refuse it before RPC dispatch instead of passing `true` as a Go identity slice.
    if (
      this.deps.isWindows() &&
      module === 'tools' &&
      fn === 'kill' &&
      args[2] === true &&
      !Array.isArray(args[3])
    ) {
      return Promise.reject(
        new AppHelperError(
          'windows_fallback_not_supported',
          'Windows tree stop requires an identity provider'
        )
      )
    }
    return this.sendInternal<T>(module, fn, args, true)
  }

  private sendInternal<T>(
    module: Module,
    fn: FN,
    args: any[],
    retrySignature: boolean,
    // 明确 Helper 选择才跳过旧自动 UAC 分支；签名重试必须保留同一传输方式。
    helperSelected = false
  ): Promise<T> {
    return new Promise(async (resolve, reject) => {
      // RPC 内部连接/响应回调不一定恢复 ALS，捕获原 PATH 请求；不输出签名、密钥或 args。
      const logPath = bindWindowsPathLogger()
      logPath('helper.rpc-begin', { fn, enabled: this.enable })
      let settled = false
      let requestMayHaveBeenSent = false
      let client: ReturnType<HelperDeps['createConnection']> | undefined
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
        logPath('helper.rpc-completed', { fn })
        clearRequestTimer()
        resolve(value)
      }

      const rejectOnce = (error: Error) => {
        if (settled) {
          return
        }
        settled = true
        logPath('helper.rpc-failed', { fn })
        clearRequestTimer()
        reject(error)
      }

      let closeClient = () => {}
      try {
        closeClient = () => {
          try {
            client?.destroy()
          } catch {}
        }

        if (!this.validateSendArgs(module, fn, args)) {
          rejectOnce(new Error('Path traversal detected'))
          return
        }

        // fork 可能比 Helper 二进制存活更久（例如被杀毒软件清理）；发送前使旧 socket
        // 状态失效，让本次走正常的二进制缺失错误路径，而不是误认为 Helper 仍可用。
        if (this.deps.isWindows() && this.enable && !this.deps.helperBinaryExists()) {
          this.invalidateHelperState()
        }

        // 这两项必须由健康 Helper 执行。此前的自动 UAC 状态不能绕过健康检查，
        // 因为它们没有通用 UAC 实现，而且常驻 Helper 的操作可能静默完成。
        if (
          this.deps.isWindows() &&
          this.deps.getWindowsElevationMethod() === 'uac' &&
          !isHelperFirstOperation &&
          !helperSelected
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
            await timeOperation('helper.health-check', () => this.deps.appHelperCheck())
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
        let transportFailed = false
        const buffer: Buffer[] = []
        let requestParam: any

        const handleSocketError = async (error: Error) => {
          if (settled || transportFailed) {
            return
          }
          transportFailed = true
          appDebugLog(
            '[Fork][Helper][error]',
            JSON.stringify({
              module,
              fn,
              error: {
                message: error.message,
                code: (error as NodeJS.ErrnoException).code
              }
            })
          ).catch()
          closeClient()
          if (requestMayHaveBeenSent) {
            // 一旦 write 被调用，Helper 可能已执行但响应丢失；不得切到 UAC/普通权限
            // 再执行一次，否则 stop 周边动作也可能被重复提交。保留未知终态给调用方。
            rejectOnce(
              new AppHelperError(
                'helper_pipe_unreachable',
                `Helper response was lost after request dispatch; execution result is unknown: ${error.message}`
              )
            )
            return
          }
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

        // 覆盖密钥读取、socket 路径解析与 connect 阶段；超时只在尚未派发 RPC 时
        // 允许 routeUnavailableHelper 选择备用执行方式。
        if (this.deps.helperRequestTimeoutMs > 0) {
          requestTimer = setTimeout(() => {
            handleSocketError(
              new AppHelperError(
                'helper_pipe_unreachable',
                requestMayHaveBeenSent
                  ? 'Helper response timed out after request dispatch; execution result is unknown'
                  : 'Helper initialization timed out'
              )
            ).catch((routeError) => rejectOnce(this.normalizeError(routeError)))
          }, this.deps.helperRequestTimeoutMs)
        }

        void (async () => {
          try {
            await timeOperation('helper.read-key', () => this.ensureKey())
            if (settled || transportFailed) return
            const socketPath = await timeOperation('helper.resolve-socket', () =>
              AppHelperSocketPathGet()
            )
            if (settled || transportFailed) return
            logPath('helper.connect-requested')
            client = this.deps.createConnection(socketPath)
          } catch (error) {
            if (!settled && !transportFailed) {
              void handleSocketError(error instanceof Error ? error : new Error(`${error}`)).catch(
                (routeError) => rejectOnce(this.normalizeError(routeError))
              )
            }
            return
          }

          if (!client || settled || transportFailed) {
            closeClient()
            return
          }

          const activeClient = client
          activeClient.on('connect', () => {
            logPath('helper.connected')
            try {
              if (settled || transportFailed) {
                closeClient()
                return
              }
              requestParam = {
                key: uuid(),
                module,
                function: fn,
                args,
                ...helperTaskAuthFields()
              }
              if (this.helperKey) {
                requestParam.sig = signTaskItem(this.helperKey, requestParam)
              }
              // write 被调用后即标记为结果不确定，即使 callback 返回错误也不能盲目重放。
              requestMayHaveBeenSent = true
              logPath('helper.request-sent', { fn })
              activeClient.write(JSON.stringify(requestParam), (error?: Error | null) => {
                if (error) {
                  void handleSocketError(error).catch((routeError) => {
                    rejectOnce(this.normalizeError(routeError))
                  })
                }
              })
            } catch (error) {
              void handleSocketError(error instanceof Error ? error : new Error(`${error}`)).catch(
                (routeError) => rejectOnce(this.normalizeError(routeError))
              )
            }
          })

          activeClient.on('data', (data: any) => {
            buffer.push(data)
          })

          activeClient.on('end', () => {
            logPath('helper.response-ended', {
              byteCount: buffer.reduce((sum, item) => sum + item.length, 0)
            })
            if (settled || transportFailed) {
              return
            }
            let res: any
            try {
              const content = Buffer.concat(buffer).toString().trim()
              res = JSON5.parse(content)
            } catch {}
            if (res && res?.key && res?.key === requestParam?.key) {
              buffer.splice(0)
              if (res?.code === 0) {
                closeClient()
                return resolveOnce(res?.data)
              }
              if (typeof res?.code !== 'number' || typeof res?.msg !== 'string') {
                transportFailed = true
                closeClient()
                rejectOnce(
                  new AppHelperError(
                    'helper_pipe_unreachable',
                    'Helper returned a malformed response after dispatch; execution result is unknown'
                  )
                )
                return
              }
              const error = new AppHelperError(helperResponseErrorCode(res.msg), res.msg)
              transportFailed = true
              closeClient()

              if (error.code === 'helper_signature_invalid') {
                // Helper 明确拒绝签名才证明业务方法未派发，可安全重签一次。
                appDebugLog(
                  '[Fork][Helper][signature-mismatch]',
                  JSON.stringify({ module, fn, retry: retrySignature })
                ).catch(() => {})
                if (retrySignature) {
                  clearRequestTimer()
                  this.invalidateHelperState()
                  this.sendInternal<T>(module, fn, args, false, helperSelected)
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
            if (requestMayHaveBeenSent) {
              rejectOnce(
                new AppHelperError(
                  'helper_pipe_unreachable',
                  'Helper returned an invalid response after request dispatch; execution result is unknown'
                )
              )
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
              .catch((routeError) => {
                rejectOnce(this.normalizeError(routeError))
              })
          })

          activeClient.on('error', (error) => {
            void handleSocketError(error).catch((routeError) => {
              rejectOnce(this.normalizeError(routeError))
            })
          })
        })().catch((error) => {
          if (!settled && !transportFailed) {
            void handleSocketError(error instanceof Error ? error : new Error(`${error}`)).catch(
              (routeError) => rejectOnce(this.normalizeError(routeError))
            )
          }
        })
      } catch (error) {
        closeClient()
        rejectOnce(this.normalizeError(error))
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
