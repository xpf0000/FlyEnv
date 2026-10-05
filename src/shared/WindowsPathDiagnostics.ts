import { AsyncLocalStorage } from 'node:async_hooks'
import { appDebugLog } from './utils'
import { observeOperationTiming } from './OperationTiming'
import {
  bindPerformanceLogger,
  performanceDiagnosticNow,
  performanceDiagnosticValue,
  withPerformanceDiagnostics
} from './PerformanceDiagnostics'

type PathOwner = { rendererKey?: string; requestKey?: string; command: string }
type PathContext = { owner: PathOwner; started: number; sequence: number }
const diagnostics = new AsyncLocalStorage<PathContext>()

/** 只提供请求关联；独立环境 API 没有上下文仍可正常广播。 */
export const currentWindowsPathRequestKey = () => diagnostics.getStore()?.owner.requestKey
export const isWindowsPathCommand = (module: unknown, command: unknown) =>
  performanceDiagnosticValue(
    () =>
      process.platform === 'win32' &&
      module === 'tools' &&
      typeof command === 'string' &&
      ['updatePATH', 'removePATH', 'fetchPATH', 'envPathUpdate', 'envPathList'].includes(command),
    false
  )

/** 此处只拼装 PATH 请求元信息，时钟/日志格式/写入/容错由统一 logger 负责。 */
export const bindWindowsPathLogger = (owner: Partial<PathOwner> = {}) => {
  const context = diagnostics.getStore()
  const logger = bindPerformanceLogger(
    appDebugLog,
    '[WindowsPath][diagnostic]',
    () => ({
      ...context?.owner,
      ...owner,
      sourcePid: process.pid,
      sequence: context ? ++context.sequence : undefined
    }),
    context?.started
  )
  return (stage: string, details: Record<string, unknown> = {}) => {
    if (context) void logger(stage, details)
  }
}
export const logWindowsPath = (stage: string, details: Record<string, unknown> = {}) =>
  bindWindowsPathLogger()(stage, details)

/** 沿用并发隔离和既有测试观察器；开关不影响任务本身及其终态。 */
export const withWindowsPathDiagnostics = <T>(owner: PathOwner, task: () => T): T =>
  withPerformanceDiagnostics(
    () =>
      diagnostics.run(
        {
          owner,
          started: performanceDiagnosticNow(),
          sequence: 0
        },
        () => {
          const log = bindWindowsPathLogger()
          return observeOperationTiming((event) => log(event.stage, event), task)
        }
      ),
    task
  )
