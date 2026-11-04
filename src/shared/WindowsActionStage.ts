export { buildPerformanceStagePrelude as buildWindowsActionStagePrelude } from './PerformanceDiagnostics'

/** 固定阶段白名单仅用于解析诊断，不作为认证或业务终态证据。 */
const stages = new Set([
  'node.spawn-request',
  'node.spawned',
  'node.ready-accepted',
  'node.launch-sent',
  'node.result-accepted',
  'node.child-closed',
  'node.transport-failed',
  'broker.bootstrap',
  'broker.source-read',
  'broker.source-decoded',
  'broker.compile-start',
  'broker.compile-end',
  'broker.input-read-start',
  'broker.input-read-end',
  'broker.input-parse-end',
  'broker.pipe-created',
  'broker.ready',
  'broker.launch-authorized',
  'broker.client-connected',
  'broker.client-authenticated',
  'broker.payload-sent',
  'broker.result-received',
  'broker.failed',
  'launcher.start-request',
  'launcher.start-returned',
  'launcher.child-exited',
  'action.bootstrap',
  'action.connect-start',
  'action.connected',
  'action.payload-received',
  'action.payload-verified',
  'action.execute-start',
  'action.execute-end',
  'action.result-write'
])

export type WindowsActionStageEvent = {
  stage: string
  at: string
  elapsedMs: number
  pid: number
  /** Node 阶段额外标识直接 broker 子进程；子进程协议不提供/不信任这个字段。 */
  childPid?: number
}

/** 有界固定字段校验；不接受可自由插入日志的阶段名，也不把失败输出视为阶段。 */
export const parseWindowsActionStage = (value: unknown): WindowsActionStageEvent | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return
  const event = value as Partial<WindowsActionStageEvent>
  if (
    !stages.has(event.stage ?? '') ||
    typeof event.at !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(event.at) ||
    !Number.isFinite(Date.parse(event.at)) ||
    typeof event.elapsedMs !== 'number' ||
    !Number.isFinite(event.elapsedMs) ||
    event.elapsedMs < 0 ||
    event.elapsedMs > 900_000 ||
    typeof event.pid !== 'number' ||
    !Number.isSafeInteger(event.pid) ||
    event.pid <= 0
  )
    return
  return { stage: event.stage!, at: event.at, elapsedMs: event.elapsedMs, pid: event.pid }
}

/** Node 分块读取 stderr 后按完整行解析；UTF-8 不依赖 Windows 控制台代码页。 */
export const parseWindowsActionStageLine = (line: string): WindowsActionStageEvent | undefined => {
  const fields = line.trimEnd().split('|')
  if (fields.length !== 5 || fields[0] !== 'FLYENV_ACTION_STAGE') return
  return parseWindowsActionStage({
    stage: fields[1],
    at: fields[2],
    elapsedMs: Number(fields[3]),
    pid: Number(fields[4])
  })
}
