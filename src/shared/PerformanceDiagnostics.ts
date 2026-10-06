/**
 * 本次性能诊断的唯一开关：true 开启，false 关闭，直接在这里修改即可。
 * 开发、打包、插件和源码计时脚本均调用本文件方法；常量不导出，不散落业务判断。
 * 不读取环境变量，不按运行模式
 * 推导开关，也不需要构建器注入。打正式包需要关闭时，先把这里改成 false。
 * 模块无静态依赖，可用于 renderer 和轻量 fork 入口；错误与帮助程序必要诊断
 * 不受此开关影响，关闭观察器不能改变业务状态、权限判断或 IPC 终态。
 */
const PERFORMANCE_DIAGNOSTICS_ENABLED: boolean = true

export type PerformanceLogWriter = (category: string, message: string) => unknown
export type PerformanceLogData = Record<string, unknown>
export type PerformanceTimingObserver = (event: PerformanceTimingEvent, error?: unknown) => void
export type PerformanceTimingEvent = {
  stage: string
  kind: 'start' | 'end' | 'mark'
  atMs: number
  durationMs?: number
  status?: 'ok' | 'error'
  errorCode?: string
}

/** 仅采集纯诊断值；关闭或采集失败时省略元信息，不能把业务调用放进此入口。 */
export const performanceDiagnosticValue = <T>(collect: () => T, disabled: T): T => {
  if (!PERFORMANCE_DIAGNOSTICS_ENABLED) return disabled
  try {
    return collect()
  } catch {
    return disabled
  }
}

/** 诊断范围可以包裹业务，但绝不捕获业务异常或省掉业务调用。 */
export const withPerformanceDiagnostics = <T>(diagnose: () => T, task: () => T): T =>
  PERFORMANCE_DIAGNOSTICS_ENABLED ? diagnose() : task()

/** 只执行观察动作；例如日志监听/下一轮探针，失败不能传播到业务。 */
export const runPerformanceDiagnostic = (observe: () => unknown): void => {
  if (!PERFORMANCE_DIAGNOSTICS_ENABLED) return
  try {
    const pending = observe()
    if (pending && typeof (pending as PromiseLike<unknown>).then === 'function') {
      void Promise.resolve(pending).catch(() => {})
    }
  } catch {
    // 同步异常与异步拒绝都只丢失观察信息。
  }
}

/** Node 和浏览器共用单调时钟，不导入 perf_hooks 或重型业务依赖。 */
export const performanceDiagnosticNow = () => performanceDiagnosticValue(() => performance.now(), 0)
const round = (value: number) => Math.round(value * 1000) / 1000
export const performanceDiagnosticElapsed = (started: number): number | undefined =>
  performanceDiagnosticValue(() => round(performance.now() - started), undefined)

/**
 * 唯一性能日志写入入口：先判断开关，再生成数据、固定事件时间并序列化。
 * sink 只负责既有 Node 文件追加/renderer IPC；不全局注册、不排队、不改变业务协议。
 * fault=true 只用于必须保留的真实故障；序列化、同步 sink 和异步写入错误均吞掉。
 * 返回的 Promise 可由既有退出诊断等待；普通打点应 void 调用，避免等待日志 I/O。
 */
export const writePerformanceLog = async (
  writer: PerformanceLogWriter,
  category: string,
  data: PerformanceLogData | (() => PerformanceLogData),
  fault = false
): Promise<void> => {
  if (!PERFORMANCE_DIAGNOSTICS_ENABLED && !fault) return
  try {
    const event = typeof data === 'function' ? data() : data
    await writer(category, JSON.stringify({ ...event, at: event.at ?? new Date().toISOString() }))
  } catch {
    // 诊断不是成功/失败判据，不重试业务，不触发提权，也不能覆盖原异常。
  }
}

/** 绑定请求元信息和计时起点；全部日志格式/开关/序列化仍由上面的唯一入口负责。 */
export const bindPerformanceLogger = (
  writer: PerformanceLogWriter,
  category: string,
  owner: PerformanceLogData | (() => PerformanceLogData) = {},
  started = performanceDiagnosticNow()
) => {
  return (stage: string, details: PerformanceLogData = {}, fault = false): Promise<void> =>
    writePerformanceLog(
      writer,
      category,
      () => ({
        ...details,
        ...(typeof owner === 'function' ? owner() : owner),
        stage,
        elapsedMs: performanceDiagnosticElapsed(started)
      }),
      fault
    )
}

/** 计时观察器同样不可信；统一隔离所有观察器异常。 */
export const emitPerformanceTiming = (
  observer: PerformanceTimingObserver,
  event: PerformanceTimingEvent,
  error?: unknown
) => runPerformanceDiagnostic(() => observer(event, error))

/**
 * 一个阶段共用一对时点，finish 幂等。异常参数个数用于区分正常返回与 throw undefined；
 * code getter 可能抛错，只省略诊断字段，不改变原错误。关闭或没有观察器时不取时钟。
 */
export const beginPerformanceStage = (
  stage: string,
  observer?: PerformanceTimingObserver,
  origin = 0
) => {
  if (!PERFORMANCE_DIAGNOSTICS_ENABLED || !observer) return (..._errors: unknown[]) => {}
  const started = performanceDiagnosticNow()
  emitPerformanceTiming(observer, { stage, kind: 'start', atMs: round(started - origin) })
  let ended = false
  return (...errors: unknown[]) => {
    if (ended) return
    ended = true
    const now = performanceDiagnosticNow()
    let errorCode: string | undefined
    try {
      const code = (errors[0] as { code?: unknown } | undefined)?.code
      if (typeof code === 'string') errorCode = code.slice(0, 80)
    } catch {}
    emitPerformanceTiming(
      observer,
      {
        stage,
        kind: 'end',
        atMs: round(now - origin),
        durationMs: round(now - started),
        status: errors.length === 0 ? 'ok' : 'error',
        errorCode
      },
      errors[0]
    )
  }
}

/** 同步/异步计时只观察 action，保留原值、原异常和原调用次数。 */
export const timePerformanceSync = <T>(
  stage: string,
  action: () => T,
  observer?: PerformanceTimingObserver,
  origin = 0
): T => {
  if (!PERFORMANCE_DIAGNOSTICS_ENABLED || !observer) return action()
  const finish = beginPerformanceStage(stage, observer, origin)
  try {
    const result = action()
    finish()
    return result
  } catch (error) {
    finish(error)
    throw error
  }
}
export const timePerformanceOperation = async <T>(
  stage: string,
  action: () => T | PromiseLike<T>,
  observer?: PerformanceTimingObserver,
  origin = 0
): Promise<T> => {
  if (!PERFORMANCE_DIAGNOSTICS_ENABLED || !observer) return action()
  const finish = beginPerformanceStage(stage, observer, origin)
  try {
    const result = await action()
    finish()
    return result
  } catch (error) {
    finish(error)
    throw error
  }
}

/** 独立步骤也使用同一计时器；错误和成功都通知，观察回调不影响主结果。 */
export const measurePerformanceStep = <T>(
  stage: string,
  action: () => T | PromiseLike<T>,
  report: (event: PerformanceTimingEvent) => void
) =>
  timePerformanceOperation(
    stage,
    action,
    (event) => {
      if (event.kind === 'end') report(event)
    },
    performanceDiagnosticNow()
  )

/** 控制台计时也是诊断，不由业务自行检查常量。 */
export const startPerformanceConsoleTimer = (label: string) =>
  runPerformanceDiagnostic(() => console.time(label))
export const endPerformanceConsoleTimer = (label: string) =>
  runPerformanceDiagnostic(() => console.timeEnd(label))

/** 脚本开关同样收敛在这里；关闭时提供必要空函数/占位，不能破坏认证结果回传。 */
export const performanceDiagnosticText = (enabled: string, disabled = '', requested = true) =>
  PERFORMANCE_DIAGNOSTICS_ENABLED && requested ? enabled : disabled

export const buildPerformanceStagePrelude = (collectResult = false) =>
  performanceDiagnosticText(
    `
$script:FlyEnvStageClock = [Diagnostics.Stopwatch]::StartNew()
${collectResult ? '$script:FlyEnvActionStages = [Collections.Generic.List[object]]::new()' : ''}
function Write-FlyEnvActionStage([string]$stage) {
  try {
    $at = [DateTime]::UtcNow.ToString('o', [Globalization.CultureInfo]::InvariantCulture)
    $ms = $script:FlyEnvStageClock.Elapsed.TotalMilliseconds
    ${
      collectResult
        ? '$script:FlyEnvActionStages.Add(@{ stage=$stage; at=$at; elapsedMs=$ms; pid=$PID })'
        : "[Console]::Error.WriteLine('FLYENV_ACTION_STAGE|' + $stage + '|' + $at + '|' + $ms.ToString('F3', [Globalization.CultureInfo]::InvariantCulture) + '|' + $PID)"
    }
  } catch { }
}
`,
    'function Write-FlyEnvActionStage([string]$stage) {}'
  )

/** 两个停止脚本共用事件收集函数，统一控制初始化与写入，关闭时没有未初始化列表访问。 */
export const buildPerformanceProcessStopPrelude = () => `
$global:FlyEnvProcessStopEvents = ${performanceDiagnosticText('[Collections.Generic.List[object]]::new()', '$null')}
function Add-FlyEnvProcessStopEvent([string]$stage, [int]$pidValue, [hashtable]$details = @{}) {
${performanceDiagnosticText(`
  $entry = @{ stage=$stage; pid=$pidValue; at=[DateTime]::UtcNow.ToString('o') }
  foreach ($key in $details.Keys) { $entry[$key] = $details[$key] }
  [void]$global:FlyEnvProcessStopEvents.Add($entry)
`)}
}
`

/** 固定 PowerShell 计时阶段的开始/结束代码集中生成，不接受业务参数或任意阶段名。 */
export const buildPerformanceScriptTiming = (
  stage: 'broker.compile' | 'launcher.runas' | 'action.execute',
  phase: 'start' | 'end',
  requested: boolean
) => {
  const variable = {
    'broker.compile': '$compileTimer',
    'launcher.runas': '$runasTimer',
    'action.execute': '$actionTimer'
  }[stage]
  const start = `${variable}=[Diagnostics.Stopwatch]::StartNew()`
  const end =
    stage === 'action.execute'
      ? '$result.timingMs=$actionTimer.Elapsed.TotalMilliseconds'
      : `[Console]::Error.WriteLine('FLYENV_TIMING|${stage}|' + ${variable}.Elapsed.TotalMilliseconds.ToString('F3', [Globalization.CultureInfo]::InvariantCulture))`
  return performanceDiagnosticText(
    phase === 'start'
      ? (stage === 'launcher.runas'
          ? "[Console]::Error.WriteLine('FLYENV_TIMING|launcher.runas-requested'); "
          : '') + start
      : end,
    '',
    requested
  )
}

/** native broker 同样只获得固定诊断函数；关闭时不输出阶段或读取空 Stopwatch。 */
export const buildPerformanceNativeStageWriters = () => `
  static void WriteTiming(string line) { try { Console.Error.WriteLine(line); } catch {} }
  static void WriteStage(string stage, Stopwatch timer) {
    ${performanceDiagnosticText(`try {
      WriteTiming("FLYENV_ACTION_STAGE|" + stage + "|" + DateTime.UtcNow.ToString("o", System.Globalization.CultureInfo.InvariantCulture) + "|" + timer.Elapsed.TotalMilliseconds.ToString("F3", System.Globalization.CultureInfo.InvariantCulture) + "|" + Process.GetCurrentProcess().Id);
    } catch {}`)}
  }
`

export const buildPerformanceNativeLaunchTiming = (phase: 'start' | 'end') =>
  phase === 'start'
    ? performanceDiagnosticText(`Stopwatch timer = null;
    if (elevated && timing) {
      WriteTiming("FLYENV_TIMING|launcher.runas-requested"); timer = Stopwatch.StartNew();
    }`)
    : performanceDiagnosticText(
        `if (timer != null) WriteTiming("FLYENV_TIMING|launcher.runas|" + timer.Elapsed.TotalMilliseconds.ToString("F3", System.Globalization.CultureInfo.InvariantCulture));`
      )
