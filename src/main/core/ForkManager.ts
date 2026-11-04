import {
  performanceDiagnosticElapsed,
  performanceDiagnosticNow,
  writePerformanceLog
} from '@shared/PerformanceDiagnostics'
import { utilityProcess } from 'electron'
import { cpus } from 'os'
import { fetchStopProcessListLocal } from '@shared/StopProcessList'
import { appDebugLog } from '@shared/utils'
import EnvSync from '@shared/EnvSync'
import { fetchEnvSyncLocal } from '@shared/EnvSyncLocal'
import type { EnvSyncInvalidated } from '@shared/EnvSyncProtocol'
import type { LanguageChanged, LanguageRuntimePayload } from '@shared/LanguageProtocol'
import { BinVersionCacheBridge } from './BinVersionCacheBridge'
import { ElectronStoreBinVersionCachePersistence } from './BinVersionCachePersistence'
import { BinVersionCacheStore } from './BinVersionCacheStore'
import { EnvSyncBridge } from './EnvSyncBridge'
import { EnvSyncCoordinator } from './EnvSyncCoordinator'
import { PRIMARY_FORK_IDLE_TIMEOUT_MS, TRANSIENT_FORK_IDLE_TIMEOUT_MS } from './ForkIdleLifecycle'
import { ForkItem } from './ForkItem'
import { getDedicatedServiceTransition } from './ForkWorkerPolicy'
import { StopProcessListBridge } from './StopProcessListBridge'
import { StopProcessListCache } from './StopProcessListCache'
import type { WindowsPrivilegeBridge } from './WindowsPrivilegeBridge'
import type { WindowsPrivilegeSnapshot } from '@shared/WindowsPrivilege'
import { ForkPromise } from '@shared/ForkPromise'
import { logServiceStopBoundary } from '@shared/ServiceStopDiagnostics'
import { logWindowsPath } from '@shared/WindowsPathDiagnostics'
import {
  hasServiceLifecyclePermit,
  isServiceLifecycleContextExpired,
  serviceLifecycleAction,
  waitForServiceDrain
} from './ServiceLifecycle'

export { ForkItem } from './ForkItem'

type Callback = (...args: any) => void

const CupCount = cpus().length

export class ForkManager {
  file: string
  forks: Array<ForkItem> = []
  ftpsrvFork?: ForkItem
  dnsFork?: ForkItem
  ollamaChatFork?: ForkItem
  llamaCppModelFork?: ForkItem

  _on: Callback = () => {}
  private readonly envSyncCoordinator = new EnvSyncCoordinator(fetchEnvSyncLocal, {
    ttlMs: 300_000,
    onEvent: (event) => {
      if (process.platform === 'win32') {
        void writePerformanceLog(appDebugLog, '[EnvSyncCoordinator][diagnostic]', () => ({
          sourcePid: process.pid,
          type: event.type,
          revision: event.revision,
          durationMs: 'durationMs' in event ? event.durationMs : undefined,
          envCount: 'envCount' in event ? event.envCount : undefined
        }))
      }
    }
  })
  private readonly envSyncBridge = new EnvSyncBridge(this.envSyncCoordinator)
  private readonly unsubscribeEnvSync = this.envSyncCoordinator.subscribe((revision) => {
    EnvSync.clearLocal(revision)
    this.broadcastEnvSyncInvalidated(revision)
  })
  private readonly stopProcessListCache = new StopProcessListCache(fetchStopProcessListLocal, {
    ttlMs: 650,
    onEvent: (event) => {
      void writePerformanceLog(appDebugLog, '[StopProcessListCache]', () => ({ ...event }))
    }
  })
  private readonly stopProcessListBridge = new StopProcessListBridge(this.stopProcessListCache)
  private readonly binVersionCacheStore = new BinVersionCacheStore(
    new ElectronStoreBinVersionCachePersistence(),
    {
      debounceMs: 2_000,
      onEvent: (event) => {
        console.log('[BinVersionCache]: ', event)
        // appDebugLog('[BinVersionCache]', JSON.stringify(event)).catch()
      }
    }
  )
  private readonly binVersionCacheBridge = new BinVersionCacheBridge(this.binVersionCacheStore)
  private languageSnapshotProvider?: () => LanguageRuntimePayload
  // 注入主进程唯一协调器；独立服务 fork 与普通池共享授权队列。
  windowsPrivilegeBridge?: WindowsPrivilegeBridge
  private serviceLifecycleClosing = false
  private readonly serviceLifecycleRequests = new Set<Promise<void>>()

  constructor(file: string) {
    this.file = file
    EnvSync.setProvider(this.envSyncCoordinator)
  }

  setLanguageSnapshotProvider(provider: () => LanguageRuntimePayload) {
    this.languageSnapshotProvider = provider
  }

  /** 启动/登记及批量边界清表，不触发查询；后续各 fork 仍共用同一新查询。 */
  invalidateStopProcessList(reason: string) {
    this.stopProcessListCache.invalidate(reason)
  }

  /**
   * 批量停止先失效短缓存，再只调用一次取表；返回列表由调用方局部变量持有，
   * 随各 stopService 请求直接发送，不再维护批次 ID/Map 或 finally 释放协议。
   */
  fetchStopProcessListSnapshot() {
    return this.stopProcessListCache.get()
  }

  private createForkItem(idleTimeoutMs: number, primary = false) {
    return new ForkItem(
      this.file,
      {
        idleTimeoutMs,
        primary,
        forkProcess: (forkFile) => utilityProcess.fork(forkFile)
      },
      this.envSyncBridge,
      this.stopProcessListBridge,
      this.binVersionCacheBridge,
      () => this.languageSnapshotProvider?.(),
      this.windowsPrivilegeBridge
    )
  }

  private sendDedicatedService(fork: ForkItem, module: string, args: any[]) {
    const command = args[1]
    return fork.sendWithTerminalHook(
      (info) => {
        const transition = getDedicatedServiceTransition(module, command, info?.code)
        if (transition === 'pin') fork.pin()
        if (transition === 'unpin') fork.unpin()
      },
      ...args
    )
  }

  private broadcastEnvSyncInvalidated(revision: number) {
    const message: EnvSyncInvalidated = { type: 'env-sync-invalidated', revision }
    const forks = new Set(
      [
        this.ftpsrvFork,
        this.dnsFork,
        this.ollamaChatFork,
        this.llamaCppModelFork,
        ...this.forks
      ].filter((item): item is ForkItem => !!item)
    )
    for (const fork of forks) {
      if (fork.childExited) continue
      try {
        fork.child.postMessage(message)
      } catch {}
    }
  }

  on(fn: Callback) {
    this._on = fn
  }

  /** 偏好变更覆盖普通池及专用 worker；退出中的 worker 不影响其他进程同步。 */
  broadcastWindowsPrivilege(snapshot: WindowsPrivilegeSnapshot) {
    for (const fork of new Set([
      this.ftpsrvFork,
      this.dnsFork,
      this.ollamaChatFork,
      ...this.forks
    ])) {
      if (!fork || fork.childExited) continue
      try {
        fork.child.postMessage({ type: 'windows-privilege-changed', snapshot })
      } catch {}
    }
  }

  send(...args: any[]) {
    const selectionStarted = performanceDiagnosticNow()
    // stopService 参数必须由调用方在派发时绑定；这里不能按稍后的当前 PID/bin
    // 重新解析，否则迟到的旧停止响应可能针对替换后注册的新实例。
    const param = [...args]
    const module = param.shift()
    // 主入口关门后拒绝全部新的 raw 请求（包含配置/hosts 写入）；仅已有异步许可的
    // 排队请求和退出自己的清理可以继续，避免 drain 后再次启动服务或提交系统写入。
    if (
      isServiceLifecycleContextExpired() ||
      (this.serviceLifecycleClosing && !hasServiceLifecyclePermit())
    ) {
      return new ForkPromise((_resolve, reject) =>
        reject(new Error('Application is shutting down'))
      )
    }
    // 启动（含伴随服务 open*）可能增加进程：受理前和终态都撤销旧列表。
    // stop 不在此清表，才能让同一轮并行停止共享首次发现；退出确认仍使用新查询。
    const invalidatesProcessList = serviceLifecycleAction(module, param[0]) === 'start'
    if (invalidatesProcessList) this.invalidateStopProcessList('service-start-request')
    const track = (request: any) => {
      // 退出也等待已受理 hosts/配置等非生命周期请求，避免直接销毁 worker 截断写入。
      // then 回调在微任务中执行，届时 settled 已完成初始化，可安全引用自身做清理。
      const settled: Promise<void> = Promise.resolve(request).then(
        () => {
          if (invalidatesProcessList) this.invalidateStopProcessList('service-start-settled')
          this.serviceLifecycleRequests.delete(settled)
        },
        () => {
          // 启动失败也可能留下短暂子进程，不能只在成功分支撤销旧查询。
          if (invalidatesProcessList) this.invalidateStopProcessList('service-start-settled')
          this.serviceLifecycleRequests.delete(settled)
        }
      )
      this.serviceLifecycleRequests.add(settled)
      return request
    }
    if (module === 'ftp-srv') {
      if (!this.ftpsrvFork) {
        this.ftpsrvFork = this.createForkItem(TRANSIENT_FORK_IDLE_TIMEOUT_MS)
        this.ftpsrvFork._on = this._on
      }
      return track(this.sendDedicatedService(this.ftpsrvFork, module, args))
    }
    if (module === 'dns') {
      if (!this.dnsFork) {
        this.dnsFork = this.createForkItem(TRANSIENT_FORK_IDLE_TIMEOUT_MS)
        this.dnsFork._on = this._on
      }
      return track(this.sendDedicatedService(this.dnsFork, module, args))
    }
    const fn = param.shift()
    if (module === 'ollama' && ['chat', 'stopOutput'].includes(fn)) {
      if (!this.ollamaChatFork) {
        this.ollamaChatFork = this.createForkItem(TRANSIENT_FORK_IDLE_TIMEOUT_MS)
      }
      return track(this.ollamaChatFork.send(...args))
    }
    if (module === 'llama-cpp' && ['downloadHubModelFile', 'cancelModelDownload'].includes(fn)) {
      if (!this.llamaCppModelFork) {
        this.llamaCppModelFork = this.createForkItem(TRANSIENT_FORK_IDLE_TIMEOUT_MS)
      }
      return this.llamaCppModelFork.send(...args)
    }
    /**
     * Find a thread with no tasks.
     * The first generic item is always the three-minute primary. Every additional generic item
     * is reclaimed ten seconds after becoming idle.
     */
    let find = this.forks.find((item) => item.activeTaskCount === 0 && item.isPrimary)
    if (!find) find = this.forks.find((item) => item.activeTaskCount === 0)
    if (find) {
      console.log('fork find: ', this.forks.indexOf(find), find.isPrimary)
    }
    if (!find) {
      const forksCount = this.forks.length
      console.log('forksCount: ', forksCount, CupCount)
      if (forksCount < CupCount) {
        const primary = this.forks.length === 0
        find = this.createForkItem(
          primary ? PRIMARY_FORK_IDLE_TIMEOUT_MS : TRANSIENT_FORK_IDLE_TIMEOUT_MS,
          primary
        )
        this.forks.push(find)
      } else {
        find = this.forks.shift()!
        this.forks.push(find)
      }
    }
    find._on = this._on
    // 与调用方诊断范围共用 rendererKey；后续 ForkItem 日志补上真正的后端 requestKey。
    logWindowsPath('fork.main-worker-selected', {
      workerPid: find.child?.pid,
      primary: find.isPrimary,
      workerLoading: find.loading,
      activeTaskCount: find.activeTaskCount,
      durationMs: performanceDiagnosticElapsed(selectionStarted)
    })
    // 选池/创建 worker 在 ForkItem.dispatch 之前发生，单独计时避免把这段遗漏成 IPC 空档。
    // 这里只记模块与选中的 worker 状态；原 requestKey 随后由 ForkItem 生成，不另建 ID。
    if (fn === 'stopService') {
      logServiceStopBoundary('fork.main-worker-selected', {
        module,
        workerPid: find.child?.pid,
        primary: find.isPrimary,
        workerLoading: find.loading,
        activeTaskCount: find.activeTaskCount,
        durationMs: performanceDiagnosticElapsed(selectionStarted)
      })
    }
    return track(find.send(...args))
  }

  /** 关闭全部原始请求入口，已受理操作仍可凭异步许可完成。 */
  beginServiceLifecycleShutdown() {
    this.serviceLifecycleClosing = true
  }

  async drainServiceLifecycleRequests() {
    try {
      await waitForServiceDrain(
        (async () => {
          while (this.serviceLifecycleRequests.size) {
            await Promise.allSettled([...this.serviceLifecycleRequests])
          }
        })()
      )
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      this.cancelPendingRequests(reason)
      await Promise.allSettled([...this.serviceLifecycleRequests])
      // 超时写入可能部分完成；明确记录未知状态，不能自动重放或假报已清理。
      const { appDebugLog } = await import('@shared/utils')
      await appDebugLog('[ForkManager][quit][drain-unknown]', reason).catch(() => {})
    }
  }

  /** 只结束仍有请求的 worker；之后退出自己的 stop 可以创建新 worker 重试已登记实例。 */
  cancelPendingRequests(reason: string) {
    for (const fork of new Set([
      this.ftpsrvFork,
      this.dnsFork,
      this.ollamaChatFork,
      ...this.forks
    ])) {
      fork?.cancelPendingRequests(reason)
    }
  }

  async broadcastLanguage(message: LanguageChanged) {
    const forks = new Set(
      [
        this.ftpsrvFork,
        this.dnsFork,
        this.ollamaChatFork,
        this.llamaCppModelFork,
        ...this.forks
      ].filter((item): item is ForkItem => !!item && !item.childExited)
    )
    return Promise.all([...forks].map((fork) => fork.sendLanguage(message)))
  }

  broadcastServer(server: unknown) {
    const forks = new Set(
      [
        this.ftpsrvFork,
        this.dnsFork,
        this.ollamaChatFork,
        this.llamaCppModelFork,
        ...this.forks
      ].filter((item): item is ForkItem => !!item && !item.childExited)
    )
    for (const fork of forks) {
      try {
        fork.child.postMessage({ Server: server })
      } catch {}
    }
  }

  async destroy() {
    await this.binVersionCacheStore.flush()
    this.unsubscribeEnvSync()
    EnvSync.setProvider(undefined)
    this.dnsFork?.destroy()
    this.ftpsrvFork?.destroy()
    this.ollamaChatFork?.destroy()
    this.llamaCppModelFork?.destroy()
    this.forks.forEach((fork) => {
      fork.destroy()
    })
  }
}
