import { AsyncLocalStorage } from 'node:async_hooks'
import {
  beginPerformanceStage,
  emitPerformanceTiming,
  performanceDiagnosticElapsed,
  performanceDiagnosticNow,
  performanceDiagnosticValue,
  timePerformanceOperation,
  timePerformanceSync,
  withPerformanceDiagnostics,
  type PerformanceTimingEvent
} from './PerformanceDiagnostics'

/** 此文件只适配 Node 异步上下文与固定子进程协议；计时/容错均在统一诊断入口。 */
export type OperationTimingEvent = PerformanceTimingEvent
type TimingContext = { started: number; emit: (event: OperationTimingEvent) => void }
const timing = new AsyncLocalStorage<TimingContext>()
const round = (value: number) => Math.round(value * 1000) / 1000

export const withOperationTiming = <T>(emit: TimingContext['emit'], action: () => T): T =>
  withPerformanceDiagnostics(
    () => timing.run({ started: performanceDiagnosticNow(), emit }, action),
    action
  )
export const hasOperationTiming = () =>
  performanceDiagnosticValue(() => Boolean(timing.getStore()), false)

/** 保留既有测试观察器，每个观察器由统一入口单独隔离，不能互相覆盖结果。 */
export const observeOperationTiming = <T>(observer: TimingContext['emit'], action: () => T): T =>
  withPerformanceDiagnostics(() => {
    const previous = timing.getStore()
    return timing.run(
      {
        started: previous?.started ?? performanceDiagnosticNow(),
        emit: (event) => {
          if (previous) emitPerformanceTiming(previous.emit, event)
          emitPerformanceTiming(observer, event)
        }
      },
      action
    )
  }, action)

const emit = (context: TimingContext, event: OperationTimingEvent) =>
  emitPerformanceTiming(context.emit, event)
export const markOperationStage = (stage: string) => {
  const context = timing.getStore()
  if (context)
    emit(context, {
      stage,
      kind: 'mark',
      atMs: performanceDiagnosticElapsed(context.started) ?? 0
    })
}
export const beginOperationStage = (stage: string) => {
  const context = timing.getStore()
  return beginPerformanceStage(stage, context?.emit, context?.started)
}
export const timeOperationSync = <T>(stage: string, action: () => T): T => {
  const context = timing.getStore()
  return timePerformanceSync(stage, action, context?.emit, context?.started)
}
export const timeOperation = <T>(stage: string, action: () => T | PromiseLike<T>): Promise<T> => {
  const context = timing.getStore()
  return timePerformanceOperation(stage, action, context?.emit, context?.started)
}

/** 只解析固定计时白名单；不将 stderr 标记当作认证/执行结果。 */
export const acceptOperationTimingLine = (line: string, status: 'ok' | 'error' = 'ok') => {
  if (line === 'FLYENV_TIMING|launcher.runas-requested') {
    markOperationStage('launcher.runas-requested')
    return true
  }
  const match =
    /^FLYENV_TIMING\|(broker\.compile|launcher\.runas|action\.execute)\|(\d+(?:\.\d+)?)$/u.exec(
      line
    )
  const context = performanceDiagnosticValue(() => timing.getStore(), undefined)
  if (!match || !context) return false
  const durationMs = Number(match[2])
  if (!Number.isFinite(durationMs) || durationMs > 900_000) return false
  emit(context, {
    stage: match[1],
    kind: 'end',
    status,
    atMs: performanceDiagnosticElapsed(context.started) ?? 0,
    durationMs: round(durationMs)
  })
  return true
}
