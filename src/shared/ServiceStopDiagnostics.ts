import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import type { PItem } from './Process'
import { appDebugLog } from './utils'
import { currentServiceStopContext } from './ServiceStopContext'
import {
  bindPerformanceLogger,
  performanceDiagnosticNow,
  performanceDiagnosticValue,
  timePerformanceOperation,
  withPerformanceDiagnostics,
  writePerformanceLog
} from './PerformanceDiagnostics'

/** 仅诊断元信息；不参与 PID 所有权判断，也不进入 renderer/Helper 的业务参数。 */
type ServiceStopDiagnosticOwner = {
  requestKey?: string
  quitId?: string
  module?: string
  version?: string | null
  bin?: string
  rootPid?: string
}
type ServiceStopDiagnosticContext = {
  stopId: string
  owner: ServiceStopDiagnosticOwner
  started: number
  sequence: number
}
const diagnostics = new AsyncLocalStorage<ServiceStopDiagnosticContext>()

// 全部诊断委托公共入口；ServiceStopContext 的首表、停止原因等业务状态
// 不属于这里的 ALS，关闭日志不能取消快照传参或改变 kill/退出确认逻辑。

/** 仅用于将已有 action 日志关联到停止，ID 不是身份/授权凭据。 */
export const currentServiceStopId = () => diagnostics.getStore()?.stopId

/** 仅安装 Node 请求关联范围；日志开关、时钟、写入均委托统一入口。 */
export const withServiceStopDiagnostics = <T>(
  owner: ServiceStopDiagnosticOwner,
  task: () => T
): T =>
  withPerformanceDiagnostics(() => {
    if (diagnostics.getStore()) return task()
    return diagnostics.run(
      {
        stopId: randomUUID(),
        owner: { ...owner },
        started: performanceDiagnosticNow(),
        sequence: 0
      },
      task
    )
  }, task)

/** 绑定已有范围，EventEmitter 回调不依赖上下文恢复；业务首表不属于诊断状态。 */
export const bindServiceStopLogger = () => {
  const context = diagnostics.getStore()
  const stopContext = currentServiceStopContext()
  return bindPerformanceLogger(
    appDebugLog,
    '[ServiceStop][diagnostic]',
    () => ({
      ...context?.owner,
      stopId: context?.stopId,
      snapshotSource: stopContext ? 'stop-argument' : undefined,
      snapshotCount: stopContext?.processList.length,
      reason: stopContext?.reason,
      sequence: context ? ++context.sequence : undefined,
      loggerPid: process.pid
    }),
    context?.started
  )
}
export const logServiceStop = (stage: string, data: Record<string, unknown> = {}) =>
  bindServiceStopLogger()(stage, data)

/** 不等待磁盘；统一入口在事件发生时固定 UTC，不展开业务参数和系统文件内容。 */
export const logServiceStopBoundary = (stage: string, data: Record<string, unknown> = {}) => {
  void writePerformanceLog(appDebugLog, '[ServiceStop][boundary]', () => ({
    ...diagnostics.getStore()?.owner,
    stopId: currentServiceStopId(),
    ...data,
    sourcePid: process.pid,
    stage
  }))
}

/** 核心计时器负责开始/结束与错误传播；此处仅翻译既有边界事件名。 */
export const timeServiceStopBoundary = <T>(
  stage: string,
  data: Record<string, unknown>,
  task: () => Promise<T> | T
): Promise<T> =>
  timePerformanceOperation(
    stage,
    task,
    (event, error) => {
      if (event.kind === 'start') logServiceStopBoundary(`${stage}.begin`, data)
      else if (event.kind === 'end')
        logServiceStopBoundary(`${stage}.${event.status === 'error' ? 'failed' : 'completed'}`, {
          ...data,
          durationMs: event.durationMs,
          error: event.status === 'error' ? String(error) : undefined
        })
    },
    performanceDiagnosticNow()
  )

/** 只供诊断展示，不修改真实首表；关闭时由统一入口省略快照克隆。 */
export const serviceStopProcessRows = (list: PItem[], includeCommand = false) =>
  performanceDiagnosticValue(
    () =>
      list.map((item) => ({
        pid: item.PID,
        ppid: item.PPID,
        created: item.CREATED ?? null,
        executable: item.EXECUTABLE ?? null,
        ...(includeCommand ? { command: item.COMMAND ?? null } : {})
      })),
    []
  )
