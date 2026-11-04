import {
  runPerformanceDiagnostic,
  performanceDiagnosticElapsed,
  performanceDiagnosticNow
} from '@shared/PerformanceDiagnostics'
// 业务运行时从轻量入口动态加载；IPC provider、插件桥和 dispatcher 继续归本进程。
// 不在 bootstrap 引用这些依赖，才能分别观测 OS 启动和运行时模块加载耗时。
import BaseManager from './BaseManager'
import { appDebugLog } from '@shared/utils'
import { ProcessSendError } from './ProcessSend'
import { AppI18n, getActiveLocale, I18nT } from '@lang/runtime'
import { FALLBACK_LOCALE } from '@lang/catalog'

// Fork-side plugin host bridge: fork plugin bundles resolve `@lang/runtime` to
// this object (see the 'flyenv-plugin-host-lang' esbuild plugin in
// scripts/plugin-builder.ts) so they share this process's live i18n instance
// instead of bundling a copy that never receives language updates.
;(globalThis as any).__FLYENV_PLUGIN_HOST__ = {
  lang: { AppI18n, FALLBACK_LOCALE, getActiveLocale, I18nT }
}
import { StopProcessListClient } from './StopProcessListClient'
import { setStopProcessListProvider } from '@shared/StopProcessList'
import { isServiceStopContext } from '@shared/ServiceStopContext'
import { logServiceStopBoundary } from '@shared/ServiceStopDiagnostics'
import {
  bindWindowsPathLogger,
  isWindowsPathCommand,
  withWindowsPathDiagnostics
} from '@shared/WindowsPathDiagnostics'
import { BinVersionCacheClient } from './BinVersionCacheClient'
import { setBinVersionCacheProvider } from './util/BinVersionCache'
import EnvSync from '@shared/EnvSync'
import { EnvSyncClient } from './EnvSyncClient'
import ForkLanguageService from './LanguageService'
import { WindowsPrivilegeClient } from './WindowsPrivilegeClient'
import {
  setWindowsPrivilegeProvider,
  withWindowsPrivilegeInteraction
} from '@shared/WindowsPrivilege'

const parentPort = process.parentPort
// fork 仅安装 IPC provider，Helper/UAC 选择和跨服务串行化都归 main。
const windowsPrivilegeClient = parentPort
  ? new WindowsPrivilegeClient((message) => parentPort.postMessage(message))
  : undefined
if (windowsPrivilegeClient) setWindowsPrivilegeProvider(windowsPrivilegeClient)
const stopProcessListClient = parentPort
  ? new StopProcessListClient((message) => parentPort.postMessage(message))
  : undefined
const binVersionCacheClient = parentPort
  ? new BinVersionCacheClient((message) => parentPort.postMessage(message))
  : undefined
const envSyncClient = parentPort
  ? new EnvSyncClient(
      (message) => parentPort.postMessage(message),
      (revision) => EnvSync.clearLocal(revision)
    )
  : undefined

if (envSyncClient) {
  EnvSync.setProvider({
    get: () => envSyncClient.get(),
    invalidate: () => envSyncClient.invalidate()
  })
}

if (stopProcessListClient) {
  setStopProcessListProvider(() => stopProcessListClient.request())
}

if (binVersionCacheClient) {
  setBinVersionCacheProvider({
    get: (fingerprint) => binVersionCacheClient.get(fingerprint),
    set: (fingerprint, value) => binVersionCacheClient.set(fingerprint, value)
  })
}

// ---------------------- 兼容层开始 ----------------------
// 只有在 electron 环境下且存在 parentPort 时才执行兼容逻辑
if (parentPort) {
  // 1. 挂载 send 方法：让内部调用的 process.send 变为 process.parentPort.postMessage
  // @ts-ignore: 忽略 TS 对 process 上不存在 send 方法的报错
  if (!process.send) {
    // @ts-ignore
    process.send = (message: any) => {
      parentPort.postMessage(message)
      return true // Node.js 的 process.send 返回 boolean
    }
  }

  // 2. 转发 message 事件：让 process.on('message') 也能收到消息
  // 这样你连入口的监听逻辑都不用改成 parentPort.on
  parentPort.on('message', (e) => {
    const data = e.data
    // 在 provider 路由和 Node 兼容转发之前记录实际到达时间，区分 port 接收空档
    // 与 dispatcher 前处理。仅记录关联字段，不序列化 Server、语言包或整张进程表。
    const commands = data?.type === 'service-stop-command' ? data.commands : data
    const stopCommand = Array.isArray(commands) && commands[2] === 'stopService'
    if (data?.ForkRequestKey || stopCommand) {
      logServiceStopBoundary('fork.port-message-received', {
        requestKey: stopCommand ? commands[0] : data.ForkRequestKey,
        module: stopCommand ? commands[1] : data.ForkModule,
        workerPid: process.pid,
        kind: stopCommand ? 'stop-command' : 'initialization'
      })
    }
    // 权限响应/广播不进入业务 dispatcher，避免被误当成服务命令。
    if (windowsPrivilegeClient?.handleMessage(data)) return
    if (envSyncClient?.handleMessage(data)) {
      return
    }
    if (stopProcessListClient?.handleMessage(data)) {
      return
    }
    if (binVersionCacheClient?.handleMessage(data)) {
      return
    }
    // 将 electron 的消息结构 e.data 转发给 node 的标准事件
    // @ts-ignore
    process.emit('message', data)
  })
}
// ---------------------- 兼容层结束 ----------------------

const manager = new BaseManager()

// 业务 dispatcher 继续使用 Node message 事件；上面的 parentPort 兼容层只负责转发。
process.on('message', function (args: any) {
  const receivedAt = performanceDiagnosticNow()
  // 可选停止参数与原命令同一消息到达，完整表已经在参数中，不再请求 main 取批次表。
  // dispatcher 统一放入 stopService 第二参数；普通调用传 undefined，业务参数不混位。
  const envelope = args?.type === 'service-stop-command'
  const stopContext = envelope ? args.stopContext : undefined
  if (envelope && (!Array.isArray(args.commands) || !isServiceStopContext(stopContext))) {
    appDebugLog('[Fork][stop-context][invalid]', 'Invalid stop command envelope').catch()
    return
  }
  if (envelope) args = args.commands
  if (ForkLanguageService.handle(args)) {
    return
  }
  if (args.Server) {
    // 初始化消息携带原 key 和固定命令名；捕获回调，下一轮探针仍指向这一条初始化。
    const pathLog = isWindowsPathCommand(args.ForkModule, args.ForkPathCommand)
      ? withWindowsPathDiagnostics(
          { requestKey: args.ForkRequestKey, command: args.ForkPathCommand },
          () => bindWindowsPathLogger()
        )
      : undefined
    // initialization 与 command 共用已有 requestKey，区分积压传输和初始化执行。
    const trace = (stage: string, details: Record<string, unknown> = {}) =>
      runPerformanceDiagnostic(() => {
        pathLog?.(stage, {
          workerPid: process.pid,
          durationMs: performanceDiagnosticElapsed(receivedAt),
          ...details
        })
        if (args.ForkRequestKey) {
          logServiceStopBoundary(stage, {
            requestKey: args.ForkRequestKey,
            module: args.ForkModule,
            workerPid: process.pid,
            durationMs: performanceDiagnosticElapsed(receivedAt),
            ...details
          })
        }
      })
    trace('fork.initialization-received')
    global.Server = args.Server
    if (args.ForkModule === 'temporal') {
      appDebugLog(
        '[Temporal][fork-after-init]',
        JSON.stringify({
          requestKey: args.ForkRequestKey,
          baseDir: global.Server.BaseDir,
          appDir: global.Server.AppDir
        })
      ).catch()
    }
    if (args.Language) {
      // 同步语言包应用单独计时；此日志不等语言 ACK，也不改变语言消息协议。
      const languageStarted = performanceDiagnosticNow()
      trace('fork.language-apply.begin')
      ForkLanguageService.initialize(args.Language)
      trace('fork.language-apply.completed', {
        durationMs: performanceDiagnosticElapsed(languageStarted)
      })
    }
    manager.init()
    // 通用初始化已不再预加载 Cron；实际模块在随后命令派发时按需导入。
    // returned 仅表示 Server、语言和管理器同步初始化结束，不表示业务模块已就绪。
    trace('fork.initialization-returned')
    if (args.ForkRequestKey)
      runPerformanceDiagnostic(() => {
        // 单次 check 阶段观测：初始化回调返回后，事件循环何时进入下一轮。
        // 不是消息 ACK，也不等待模块加载；unref 防止诊断回调延长进程生命周期。
        try {
          const scheduledAt = performanceDiagnosticNow()
          const probe = setImmediate(() => {
            trace('fork.initialization-next-turn', {
              durationMs: performanceDiagnosticElapsed(scheduledAt)
            })
          })
          probe.unref()
        } catch {
          // 诊断调度失败只丢弃这一条观察，不能让初始化/后续服务停止失败。
        }
      })
    return
  } else {
    const stopRequest = Array.isArray(args) && args[2] === 'stopService'
    // BaseManager 会 shift 原 commands；在交给它之前保留诊断标识，异常也关联原请求。
    const stopRequestKey = stopRequest ? args[0] : undefined
    const stopModule = stopRequest ? args[1] : undefined
    if (stopRequest) {
      logServiceStopBoundary('fork.command-received', {
        requestKey: stopRequestKey,
        module: stopModule,
        workerPid: process.pid,
        snapshotCount: stopContext?.processList.length,
        reason: stopContext?.reason
      })
    }
    // 假设 manager 内部使用了 process.send，现在也能正常工作了
    const logArgs = Array.isArray(args) ? args.slice(3) : args
    // 在执行瞬间捕获本次消息的意图；异步 await 之后也不会被下一条消息覆盖。
    // 在模块动态导入之前绑定阶段观察器：Tool.win 的冷加载和执行分别可见。
    // manager 会修改命令数组，因此先捕获原 key；观察范围不改变任何业务参数。
    const pathRequest = Array.isArray(args) && isWindowsPathCommand(args[1], args[2])
    // exec 会 shift 原数组，外层异常回包必须保留真正的 key，尤其模块加载失败的场景。
    const commandRequestKey = Array.isArray(args) ? args[0] : undefined
    const execute = () =>
      withWindowsPrivilegeInteraction(global.Server?.WindowsPrivilegeInteractive === true, () =>
        manager.exec(args, stopContext)
      )
    const execution = pathRequest
      ? withWindowsPathDiagnostics({ requestKey: args[0], command: args[2] }, () => {
          const log = bindWindowsPathLogger()
          log('fork.command-received')
          return execute().catch((error) => {
            // 模块尚未加载/初始化完成时也保留失败阶段，错误内容仍由原回包处理。
            log('fork.dispatch-failed')
            throw error
          })
        })
      : execute()
    execution.then().catch((error) => {
      if (stopRequest) {
        logServiceStopBoundary('fork.dispatch-failed', {
          requestKey: stopRequestKey,
          module: stopModule,
          workerPid: process.pid,
          error: String(error)
        })
      }
      if (typeof commandRequestKey === 'string') {
        ProcessSendError(commandRequestKey, error)
      }
      appDebugLog(
        '[Fork][exec][error]',
        `${JSON.stringify({
          args: logArgs,
          error
        })}`
      ).catch()
    })
  }
})

// ESM 静态依赖先于本文件执行；此阶段标记其完成及命令监听器安装，不是 OS spawn。
// 无新增 READY/ACK 消息，main spawn 到本事件的 UTC 差值揭示入口加载空档。
logServiceStopBoundary('fork.entry-ready', { workerPid: process.pid })

export {}
