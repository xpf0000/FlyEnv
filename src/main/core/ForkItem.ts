import {
  performanceDiagnosticValue,
  runPerformanceDiagnostic,
  performanceDiagnosticElapsed,
  performanceDiagnosticNow
} from '@shared/PerformanceDiagnostics'
import type { UtilityProcess } from 'electron'
import { appendFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ForkPromise } from '@shared/ForkPromise'
import {
  isLanguageChangedAck,
  type LanguageChanged,
  type LanguageRuntimePayload
} from '@shared/LanguageProtocol'
import type { BinVersionCacheBridge } from './BinVersionCacheBridge'
import type { EnvSyncBridge } from './EnvSyncBridge'
import { ForkIdleLifecycle, type ForkIdleScheduler } from './ForkIdleLifecycle'
import type { StopProcessListBridge } from './StopProcessListBridge'
import type { WindowsPrivilegeBridge } from './WindowsPrivilegeBridge'
import { getWindowsPrivilegeInteraction } from '@shared/WindowsPrivilege'
import { currentServiceStopContext } from '@shared/ServiceStopContext'
import { logServiceStopBoundary } from '@shared/ServiceStopDiagnostics'
import { bindWindowsPathLogger, isWindowsPathCommand } from '@shared/WindowsPathDiagnostics'
import {
  SERVICE_REQUEST_TIMEOUT_MS,
  serviceLifecycleAction,
  onServiceLifecycleCancellation
} from './ServiceLifecycle'

type Callback = (...args: any) => void

export type ForkItemOptions = {
  idleTimeoutMs: number
  primary: boolean
  idleScheduler?: ForkIdleScheduler
  forkProcess: (file: string) => UtilityProcess
  killProcess?: (pid: number) => void
}

type ForkItemCallback = {
  /** 只关联停止请求的传输耗时，不保存首表或业务扩展参数。 */
  stopTrace?: { module: string; started: number }
  /** 捕获原 PATH 请求范围；terminal/worker 退休回调不能借用后来请求的诊断上下文。 */
  pathTrace?: ReturnType<typeof bindWindowsPathLogger>
  resolve: Callback
  on: Callback
  onTerminal?: (info: any) => void
  timer?: ReturnType<typeof setTimeout>
  cancelSubscription?: () => void
}

function createRequestId(length = 32) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890'
  let value = ''
  for (let index = 0; index < length; index += 1) {
    value += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return value
}

export class ForkItem {
  private workerStartedAt = performanceDiagnosticNow()
  forkFile: string
  child: UtilityProcess
  childExited = false
  pid?: number
  loading = false
  _on: Callback = () => {}
  callback: Record<string, ForkItemCallback>
  readonly isPrimary: boolean
  private readonly lifecycle: ForkIdleLifecycle
  private readonly forkProcess: (file: string) => UtilityProcess
  private readonly killProcess: (pid: number) => void
  private readonly languageAcks = new Map<
    string,
    { resolve: (value: boolean) => void; timer: NodeJS.Timeout }
  >()
  // 标记已退休的实际进程对象；迟到 spawn/message 不得让异常 worker 恢复或领取新租约。
  private readonly retiredChildren = new WeakSet<UtilityProcess>()
  // 整个 ForkItem 销毁后不允许终态 hook 重新创建进程；正常 worker 退休仍允许后续重试。
  private disposed = false

  constructor(
    file: string,
    options: ForkItemOptions,
    private readonly envSyncBridge: EnvSyncBridge,
    private readonly stopProcessListBridge: StopProcessListBridge,
    private readonly binVersionCacheBridge: BinVersionCacheBridge,
    private readonly languageSnapshotProvider: () => LanguageRuntimePayload | undefined,
    // owner 使用真实 UtilityProcess 对象，重启 worker 后不能复用旧租约/请求缓存。
    private readonly windowsPrivilegeBridge?: WindowsPrivilegeBridge
  ) {
    this.forkFile = file
    this.isPrimary = options.primary
    this.callback = {}
    this.forkProcess = options.forkProcess
    this.killProcess = options.killProcess ?? ((pid) => process.kill(pid))
    this.lifecycle = new ForkIdleLifecycle(
      options.idleTimeoutMs,
      () => this.destroyChild(),
      options.idleScheduler
    )

    this.loading = true
    const child = this.forkProcess(file)
    this.child = child
    logServiceStopBoundary('fork.main-worker-created', {
      workerPid: child.pid,
      primary: this.isPrimary
    })
    this.postInitialization(child)
    this.attachChild(child)
  }

  get activeTaskCount() {
    return this.lifecycle.activeTaskCount
  }

  get isPinned() {
    return this.lifecycle.isPinned
  }

  pin() {
    this.lifecycle.pin()
  }

  unpin() {
    this.lifecycle.unpin()
  }

  onMessage(child: UtilityProcess, message: any) {
    // 在所有 bridge 前检查身份，否则旧 worker 的请求已入队而响应却被静默丢弃。
    if (child !== this.child || this.childExited || this.retiredChildren.has(child)) {
      this.windowsPrivilegeBridge?.detach(child)
      return
    }
    try {
      if (
        this.windowsPrivilegeBridge?.handle(message, child, (response) => {
          if (child !== this.child || this.childExited || this.retiredChildren.has(child))
            throw new Error('Fork authorization owner has retired')
          // 让桥接层统一处理发送异常并回收 owner 的租约，禁止吞掉断连故障。
          child.postMessage(response)
        })
      )
        return
    } catch (error) {
      // 认证桥同步异常必须结算此 worker 的等待请求并回收租约，不能从 message 回调逃逸。
      this.destroyChild({ code: 1, msg: `Fork authorization failed: ${String(error)}` })
      return
    }
    if (isLanguageChangedAck(message)) {
      const pending = this.languageAcks.get(message.requestId)
      if (pending) {
        clearTimeout(pending.timer)
        this.languageAcks.delete(message.requestId)
        pending.resolve(true)
      }
      return
    }
    if (
      this.envSyncBridge.handle(message, (response) => {
        try {
          child.postMessage(response)
        } catch {}
      })
    ) {
      return
    }
    if (
      this.stopProcessListBridge.handle(message, (response) => {
        try {
          child.postMessage(response)
        } catch {}
      })
    ) {
      return
    }
    if (
      this.binVersionCacheBridge.handle(message, (response) => {
        try {
          child.postMessage(response)
        } catch {}
      })
    ) {
      return
    }
    const { on, key, info } = message ?? {}
    if (on) {
      this._on({ key, info })
      return
    }
    const fn = this.callback[key]
    if (!fn) return
    if (info?.code === 0 || info?.code === 1) {
      fn.pathTrace?.('fork.main-terminal-received', { workerPid: child.pid, code: info.code })
      if (fn.stopTrace) {
        logServiceStopBoundary('fork.main-terminal-received', {
          requestKey: key,
          module: fn.stopTrace.module,
          workerPid: child.pid,
          code: info.code,
          durationMs: performanceDiagnosticElapsed(fn.stopTrace.started)
        })
      }
      // 先提交本请求的终态，再执行可重入 hook；hook 销毁/重建 worker 不影响新任务计数。
      delete this.callback[key]
      if (fn.timer) clearTimeout(fn.timer)
      fn.cancelSubscription?.()
      this.lifecycle.taskSettled()
      try {
        fn.onTerminal?.(info)
      } catch {}
      fn.resolve(info)
    } else if (info?.code === 200) {
      fn.on(info)
    }
  }

  send(...args: any[]) {
    return this.dispatch(undefined, args)
  }

  sendWithTerminalHook(onTerminal: (info: any) => void, ...args: any[]) {
    return this.dispatch(onTerminal, args)
  }

  sendLanguage(message: LanguageChanged, timeoutMs = 1_000) {
    if (this.childExited) return Promise.resolve(false)
    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        this.languageAcks.delete(message.requestId)
        resolve(false)
      }, timeoutMs)
      this.languageAcks.set(message.requestId, { resolve, timer })
      try {
        this.child.postMessage(message)
      } catch {
        clearTimeout(timer)
        this.languageAcks.delete(message.requestId)
        resolve(false)
      }
    })
  }

  isChildDisabled() {
    if (this.loading) return false
    return this.childExited || !this.pid
  }

  destroy() {
    this.disposed = true
    this.lifecycle.dispose()
    this.destroyChild()
  }

  /** 退出预算到期收口传输；不能将未收到终态的服务/写操作解释成已取消或已成功。 */
  cancelPendingRequests(reason: string) {
    if (Object.keys(this.callback).length) this.destroyChild({ code: 1, msg: reason })
  }

  private dispatch(onTerminal: ((info: any) => void) | undefined, args: any[]) {
    return new ForkPromise((resolve, reject, on) => {
      if (this.disposed) {
        reject(new Error('Fork item has been destroyed'))
        return
      }
      const thenKey = createRequestId()
      const pathTrace = isWindowsPathCommand(args[0], args[1])
        ? bindWindowsPathLogger({ requestKey: thenKey, command: args[1] })
        : undefined
      // 在选定 worker 后、可能的重建/初始化/序列化之前开始计时，覆盖原日志空档。
      const stopTrace = performanceDiagnosticValue(
        () =>
          args[1] === 'stopService'
            ? { module: String(args[0]), started: performanceDiagnosticNow() }
            : undefined,
        undefined
      )
      const trace = (stage: string, data: Record<string, unknown> = {}) =>
        runPerformanceDiagnostic(() => {
          const pathDetails = { ...data }
          delete pathDetails.error // 原错误仍走业务回包；新增诊断不复制自由错误文本。
          pathTrace?.(stage, { workerPid: this.child?.pid, ...pathDetails })
          if (stopTrace) {
            logServiceStopBoundary(stage, {
              requestKey: thenKey,
              module: stopTrace.module,
              workerPid: this.child?.pid,
              durationMs: performanceDiagnosticElapsed(stopTrace.started),
              ...data
            })
          }
        })
      trace('fork.main-dispatch-begin', {
        workerLoading: this.loading,
        workerExited: this.childExited,
        primary: this.isPrimary,
        activeTaskCount: this.activeTaskCount,
        workerAgeMs: performanceDiagnosticElapsed(this.workerStartedAt)
      })
      let started = false
      try {
        let child = this.child
        if (this.isChildDisabled()) {
          // 先结束旧 worker 和其任务，再登记新任务；旧清理不得清空新任务计数。
          this.destroyChild()
          if (this.disposed) throw new Error('Fork item has been destroyed')
          // 旧任务的 terminal hook 可能已同步重建进程，复用该进程避免再次替换。
          child = this.child
          if (this.isChildDisabled()) {
            this.loading = true
            this.workerStartedAt = performanceDiagnosticNow()
            child = this.forkProcess(this.forkFile)
            this.childExited = false
            this.child = child
            this.attachChild(child)
            trace('fork.main-worker-recreated')
          }
        }
        this.lifecycle.taskStarted()
        started = true
        const callback: ForkItemCallback = { resolve, on, onTerminal, stopTrace, pathTrace }
        this.callback[thenKey] = callback
        callback.cancelSubscription = onServiceLifecycleCancellation((error) => {
          if (this.child === child && this.callback[thenKey] === callback) {
            this.destroyChild({ code: 1, msg: error.message })
          }
        })
        if (serviceLifecycleAction(args[0], args[1])) {
          // 服务请求永不回终态时结束等待并退休真实 worker。旧消息不能恢复登记，
          // 同 worker 其他请求亦返回失败；底层 OS 服务可能仍在，结果保持 unknown。
          callback.timer = setTimeout(() => {
            if (this.callback[thenKey] === callback) {
              this.destroyChild({
                code: 1,
                msg: 'Fork service request timed out; result is unknown'
              })
            }
          }, SERVICE_REQUEST_TIMEOUT_MS)
        }
        trace('fork.main-initialization-send-begin')
        this.postInitialization(child, args[0], thenKey, args[1])
        trace('fork.main-initialization-sent')
        // stopService 参数（完整首表/退出原因）与命令一次发送，省去之后请求列表的 IPC。
        // 仍使用独立字段，dispatcher 统一插入第二参数，避免混入模块的可变业务参数。
        const stopContext = currentServiceStopContext()
        trace('fork.main-command-send-begin', {
          snapshotCount: stopContext?.processList.length,
          reason: stopContext?.reason
        })
        child.postMessage(
          stopContext
            ? { type: 'service-stop-command', commands: [thenKey, ...args], stopContext }
            : [thenKey, ...args]
        )
        trace('fork.main-command-sent')
      } catch (error) {
        trace('fork.main-dispatch-failed', { error: String(error) })
        const pending = this.callback[thenKey]
        if (pending?.timer) clearTimeout(pending.timer)
        pending?.cancelSubscription?.()
        delete this.callback[thenKey]
        if (started) this.lifecycle.taskSettled()
        // postMessage 已失败时不再复用该连接，立即回收其权限 owner 和其他等待任务。
        if (started) this.destroyChild()
        // 创建失败也必须允许下次请求重新创建，不能永久停留在 loading。
        if (this.childExited) this.loading = false
        reject(error)
      }
    })
  }

  private postInitialization(
    child: UtilityProcess,
    module?: string,
    requestKey?: string,
    command?: string
  ) {
    const server = JSON.parse(JSON.stringify(Server))
    // 每次命令发送前捕获当前 AsyncLocalStorage 意图，不能沿用上一条任务的交互标志。
    server.WindowsPrivilegeInteractive = getWindowsPrivilegeInteraction()
    child.postMessage({
      Server: server,
      Language: this.languageSnapshotProvider(),
      ...performanceDiagnosticValue(
        () => (module && requestKey ? { ForkModule: module, ForkRequestKey: requestKey } : {}),
        {}
      ),
      // 仅诊断元数据，不参与命令路由或授权；公开 stopService/插件参数保持不变。
      ...(isWindowsPathCommand(module, command) ? { ForkPathCommand: command } : {})
    })
  }

  private attachChild(child: UtilityProcess) {
    child.on('message', (message) => this.onMessage(child, message))
    child.on('error', (type, location, report) => this.onError(child, type, location, report))
    child.on('exit', () => this.onExit(child))
    child.on('spawn', () => this.onSpawn(child))
  }

  private onError(child: UtilityProcess, type: string, location: string, report: string) {
    if (child !== this.child) return
    logServiceStopBoundary('fork.main-worker-error', { workerPid: child.pid, type, location })
    this.loading = false
    const error = JSON.stringify({ type, location, report })
    appendFile(join(global.Server.BaseDir!, 'fork.error.txt'), `\n${error}`).catch(() => {})
    // error 不保证随后会有 exit；主动退休并终止 worker，立即归还全部权限 owner 资源。
    this.destroyChild({ code: 1, msg: error })
  }

  private onExit(child: UtilityProcess) {
    logServiceStopBoundary('fork.main-worker-exited', { workerPid: child.pid })
    // 即使是已经被替换的旧 worker，仍需清理其权限请求和排队租约。
    this.windowsPrivilegeBridge?.detach(child)
    // 主动退休后的 exit 只是迟到确认，不能重置 terminal hook 已创建的新请求。
    if (this.retiredChildren.has(child)) return
    this.retiredChildren.add(child)
    if (child !== this.child) return
    this.childExited = true
    this.pid = undefined
    this.loading = false
    this.lifecycle.childExited()
    this.resolveLanguageAcks()
    this.settleCallbacks({ code: 1, msg: 'Fork process exited' })
  }

  private onSpawn(child: UtilityProcess) {
    if (child !== this.child || this.retiredChildren.has(child)) return
    this.childExited = false
    this.pid = child.pid
    this.loading = false
    // spawn 仅表示 OS worker 已创建；fork.entry-ready 才证明静态导入及监听器已就绪。
    logServiceStopBoundary('fork.main-worker-spawned', {
      workerPid: child.pid,
      primary: this.isPrimary,
      durationMs: performanceDiagnosticElapsed(this.workerStartedAt)
    })
    console.log('onSpawn: ', this.pid)
  }

  private resolveLanguageAcks() {
    for (const pending of this.languageAcks.values()) {
      clearTimeout(pending.timer)
      pending.resolve(false)
    }
    this.languageAcks.clear()
  }

  private settleCallbacks(info: any) {
    // 生命周期已在退休前重置。先摘除整批旧回调，再调用可重入的 terminal hook；
    // hook 新建的任务使用新 map，不能被旧清理删除或扣减 activeTaskCount。
    const callbacks = this.callback
    this.callback = {}
    for (const [requestKey, callback] of Object.entries(callbacks)) {
      callback.pathTrace?.('fork.main-request-retired', {
        workerPid: this.child?.pid,
        code: info.code
      })
      // worker 退出/超时也会结算原 callback；与真实成功终态区别记录，不补造成功。
      if (callback.stopTrace) {
        logServiceStopBoundary('fork.main-request-retired', {
          requestKey,
          module: callback.stopTrace.module,
          workerPid: this.child?.pid,
          code: info.code,
          durationMs: performanceDiagnosticElapsed(callback.stopTrace.started)
        })
      }
      if (callback.timer) clearTimeout(callback.timer)
      callback.cancelSubscription?.()
      try {
        callback.onTerminal?.(info)
      } catch {}
      callback.resolve(info)
    }
  }

  private destroyChild(info = { code: 1, msg: 'Fork process destroyed' }) {
    const child = this.child
    // 即使 exit 已发生也重复清理 owner；WeakSet 与 bridge.detach 都是幂等的。
    this.windowsPrivilegeBridge?.detach(child)
    if (this.childExited) return
    this.retiredChildren.add(child)
    const pid = child?.pid || this.pid
    logServiceStopBoundary('fork.main-worker-retired', { workerPid: pid })
    this.childExited = true
    this.pid = undefined
    this.loading = false
    this.lifecycle.childExited()
    // 主动销毁与自然退出共用 owner 清理，防止后台权限请求阻塞全局队列。
    this.resolveLanguageAcks()
    this.settleCallbacks(info)
    try {
      child?.kill()
    } catch {}
    try {
      if (pid) this.killProcess(pid)
    } catch {}
  }
}
