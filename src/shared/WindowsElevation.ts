import {
  runPerformanceDiagnostic,
  performanceDiagnosticNow,
  performanceDiagnosticElapsed,
  writePerformanceLog,
  performanceDiagnosticText,
  buildPerformanceScriptTiming
} from './PerformanceDiagnostics'
import { createHash, randomUUID } from 'node:crypto'
import { resolveWindowsPowerShellPath } from './WindowsSystemPaths'
import { AppHelperError } from './WindowsHelperState'
import { appDebugLog } from './utils'
import { bindServiceStopLogger, currentServiceStopId } from './ServiceStopDiagnostics'
import { bindWindowsPathLogger } from './WindowsPathDiagnostics'
import {
  buildWindowsActionStagePrelude,
  parseWindowsActionStage,
  type WindowsActionStageEvent
} from './WindowsActionStage'
import {
  buildWindowsRunAsLauncher,
  isWindowsLaunchFailure,
  type WindowsLaunchDiagnostic
} from './WindowsRunAs'
import { buildWindowsPipeClient, createWindowsActionPipe } from './WindowsActionPipe'
import {
  acceptOperationTimingLine,
  hasOperationTiming,
  markOperationStage,
  timeOperation
} from './OperationTiming'

const quote = (value: string) => `'${value.replace(/'/g, "''")}'`
const MAX_BYTES = 8 * 1024 * 1024
const GRACE_MS = 10 * 60_000
// 未得到可信终态的脚本在本进程内禁止自动重放。宽限期结束仅回收资源，
// 不证明管理员子进程已退出，因此不能凭计时器把它从此集合中删除。
const uncertain = new Set<string>()

type WindowsActionLaunch = {
  executable: string
  args: string[]
}
type WindowsActionOptions = {
  // 测试可替换 launcher 来复现“已退出但管道结果稍晚到达”；生产仍固定系统 PowerShell。
  launch?: (plan: WindowsActionLaunch) => Promise<unknown>
  // 仅白名单只读调用点可声明；超时后允许重新查询，写操作默认禁止重放。
  readOnly?: boolean
}

export type WindowsActionResult<T = unknown> = {
  nonce: string
  ok: boolean
  data?: T
  error?: string
  permissionDenied?: boolean
  /** 仅性能诊断携带；不作为权限或执行成功的证明。 */
  timingMs?: number
  /** 执行端自己的 PID/阶段事件，仅用于诊断，绝不参与业务成功或权限判断。 */
  processStopEvents?: unknown[]
  /** 固定引导阶段随既有认证终态输送，不作为执行成功或权限的依据。 */
  actionStages?: unknown[]
}

/**
 * broker 已持有动作子进程，不再另启 PowerShell 等待它。保留 180 秒等待上限，
 * 超时只返回“未知”，不结束 broker/管理员动作；调用方继续接收迟到的认证结果。
 * 退出码/诊断仅用于现有启动分类。测试可使用短 timeout 检查计时器和未知状态。
 */
export const waitForWindowsBrokerLaunch = async (
  launch: Promise<{ code: number; diagnostic: WindowsLaunchDiagnostic }>,
  timeout = 180_000
): Promise<void> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const status = await Promise.race([
      launch,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              Object.assign(new Error('Windows action launch/result wait timed out'), {
                killed: true
              })
            ),
          timeout
        )
      })
    ])
    if (status.code !== 0)
      throw Object.assign(new Error('Windows action process did not complete successfully'), {
        code: status.code,
        stdout: JSON.stringify(status.diagnostic)
      })
  } finally {
    // 正常退出、启动失败及超时均释放 Node 的等待计时器；管道生命周期由执行器持有。
    clearTimeout(timer)
  }
}

/**
 * 一次性子进程引导：先连接管道并证明 nonce，再接收脚本，校验由父进程
 * 固定在引导中的 SHA-256。批准 UAC 的账户不需要读取原用户 TEMP。
 * 脚本来自本地动作白名单，业务返回值只取 FlyEnvActionResult；stdout
 * 不构成成功证据。沿异常链识别真正的权限拒绝，文件锁等普通错误不提权。
 */
export const buildWindowsActionBootstrap = (
  pipeName: string,
  nonce: string,
  digest: string,
  reportTiming = false
) => `
$ErrorActionPreference = 'Stop'
${buildWindowsActionStagePrelude(true)}
Write-FlyEnvActionStage 'action.bootstrap'
$env:PSModulePath = Join-Path $PSHOME 'Modules'
${buildWindowsPipeClient(pipeName)}
Write-FlyEnvActionStage 'action.connect-start'
try { $pipe.Connect(10000) } catch { exit 73 }
Write-FlyEnvActionStage 'action.connected'
$reader = New-Object IO.StreamReader($pipe, (New-Object Text.UTF8Encoding($false)))
$writer = New-Object IO.StreamWriter($pipe, (New-Object Text.UTF8Encoding($false)))
$writer.AutoFlush = $true
try {
  try {
    # A failed identity handshake/payload check happens before the action; return the pre-execution pipe code.
    $writer.WriteLine(${quote(nonce)})
    $line = $reader.ReadLine()
    Write-FlyEnvActionStage 'action.payload-received'
    if ($null -eq $line) { throw 'Windows action pipe rejected the connection' }
    $payload = $line | ConvertFrom-Json
    $bytes = [Text.Encoding]::UTF8.GetBytes([string]$payload.script)
    $sha = [Security.Cryptography.SHA256]::Create()
    try { $hash = ([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant() } finally { $sha.Dispose() }
    if ($hash -cne ${quote(digest)}) { throw 'Windows action payload mismatch' }
    Write-FlyEnvActionStage 'action.payload-verified'
  } catch { exit 73 }
  $global:FlyEnvActionResult = $true
  # 每次动作独立初始化；kill 脚本才填入事件，成功/异常都随认证终态回传。
  $global:FlyEnvProcessStopEvents = $null
  ${buildPerformanceScriptTiming('action.execute', 'start', reportTiming)}
  try {
    Write-FlyEnvActionStage 'action.execute-start'
    & ([ScriptBlock]::Create([string]$payload.script)) | Out-Null
    $result = @{ nonce = ${quote(nonce)}; ok = $true; data = $global:FlyEnvActionResult }
  } catch {
    $e = $_.Exception
    $denied = $_.CategoryInfo.Category -eq 'PermissionDenied'
    while ($null -ne $e) {
      if ($e -is [UnauthorizedAccessException] -or $e -is [Security.SecurityException] -or (($e.HResult -band 65535) -eq 5)) { $denied = $true }
      $e = $e.InnerException
    }
    $result = @{ nonce = ${quote(nonce)}; ok = $false; error = $_.Exception.Message; permissionDenied = $denied }
  }
  Write-FlyEnvActionStage 'action.execute-end'
  ${buildPerformanceScriptTiming('action.execute', 'end', reportTiming)}
  if ($null -ne $global:FlyEnvProcessStopEvents) { $result.processStopEvents = @($global:FlyEnvProcessStopEvents.ToArray()) }
  Write-FlyEnvActionStage 'action.result-write'
  ${performanceDiagnosticText('$result.actionStages = @($script:FlyEnvActionStages.ToArray())')}
  $writer.WriteLine(($result | ConvertTo-Json -Depth 16 -Compress))
} finally { $writer.Dispose(); $reader.Dispose(); $pipe.Dispose() }
`

/**
 * 普通权限和 UAC 共用的结构化执行器。随机命名管道只服务本次 action，
 * broker 内的启动诊断负责定位启动错误，可信管道结果负责判定业务终态。
 * 超时后保留迟到结果通道，不重复执行可能仍在完成的系统修改。
 */
export const runWindowsAction = async <T>(
  script: string,
  elevated: boolean,
  options: WindowsActionOptions = {}
): Promise<T> => {
  if (process.platform !== 'win32')
    throw new Error('Windows action is unavailable on this platform')
  if (Buffer.byteLength(script, 'utf8') > MAX_BYTES)
    throw new Error('Windows action payload is too large')
  const digest = createHash('sha256').update(script).digest('hex')
  if (!options.readOnly && uncertain.has(digest))
    throw new AppHelperError(
      'elevation_status_timeout',
      'A previous Windows action may still be running; retry after its result is known'
    )
  const nonce = randomUUID()
  const actionId = randomUUID()
  const stopId = currentServiceStopId()
  // 绑定当前 stopId，管道 callback/迟到结果不依赖 EventEmitter 恢复 ALS。
  const logStop = bindServiceStopLogger()
  // 与原请求绑定 actionId；broker/管理员子进程阶段回调不能串到其他并发 PATH 操作。
  const logPath = bindWindowsPathLogger()
  // 绑定 actionId/stopId；Node 收到 stderr 的时点与子进程实际发生时点分开记录。
  // 异步日志不阻塞 READY/LAUNCH 握手；每次仅保留有限阶段写入 Promise。
  const stageLogs: Promise<void>[] = []
  const recordStage = (event: WindowsActionStageEvent, authenticated = false) =>
    runPerformanceDiagnostic(() => {
      if (stageLogs.length >= 256) return
      logPath('action.transport-stage', {
        actionId,
        elevated,
        transportStage: event.stage,
        sourceAt: event.at,
        sourceElapsedMs: event.elapsedMs,
        actionPid: event.pid,
        brokerPid: event.childPid,
        authenticated
      })
      stageLogs.push(
        logStop('action.transport-stage', {
          actionId,
          elevated,
          transportStage: event.stage,
          sourceAt: event.at,
          sourceElapsedMs: event.elapsedMs,
          sourcePid: event.pid,
          brokerPid: event.childPid,
          authenticated,
          clock: event.stage.startsWith('launcher.')
            ? 'launcher'
            : event.stage.startsWith('node.')
              ? 'node'
              : 'powershell'
        })
      )
    })
  let executionLog: Promise<void> | undefined
  const startedAt = performanceDiagnosticNow()
  const logResult = (state: string, error?: unknown) => {
    // 成功/阶段日志属于性能观察；失败仍保留必要错误码，不能关闭真实故障诊断。
    logPath('action.result', {
      actionId,
      elevated,
      state,
      durationMs: performanceDiagnosticElapsed(startedAt),
      errorCode: error instanceof AppHelperError ? error.code : undefined
    })
    // 日志只记录请求标识、阶段和错误码；不写 nonce、脚本、文件内容或证书。
    void writePerformanceLog(
      appDebugLog,
      '[WindowsPrivilege][action]',
      () => ({
        actionId,
        stopId,
        elevated,
        state,
        elapsedMs: performanceDiagnosticElapsed(startedAt),
        reason: error instanceof AppHelperError ? error.code : undefined
      }),
      state.startsWith('failed')
    )
  }
  logResult('started')
  if (stopId) await logStop('action.started', { actionId, elevated })
  const pipeName = `FlyEnv.Action.${randomUUID()}`
  const reportTiming = hasOperationTiming()
  const bootstrap = buildWindowsActionBootstrap(pipeName, nonce, digest, reportTiming)
  const args = ['-NoProfile', '-NonInteractive', '-Command', bootstrap]
  // 管道 broker 直接启动固定引导。参数只有 pipe/nonce/digest，不包含业务脚本或文件内容。
  const childArgs = [
    '-NoProfile',
    '-NonInteractive',
    '-EncodedCommand',
    Buffer.from(bootstrap, 'utf16le').toString('base64')
  ]
  let result: WindowsActionResult<T> | undefined
  let unknown = false
  // native broker 先完成 ACL/对端令牌核验，nonce 只负责绑定当前动作。
  const pipe = await timeOperation(elevated ? 'uac.pipe-ready' : 'ordinary.pipe-ready', () =>
    createWindowsActionPipe({
      pipeName,
      nonce,
      elevated,
      maxBytes: MAX_BYTES,
      payload: { script },
      launch: options.launch ? undefined : { argumentsText: childArgs.join(' ') },
      onStage: recordStage,
      onResult: (value) => {
        const candidate = value as WindowsActionResult<T>
        if (
          !candidate ||
          typeof candidate !== 'object' ||
          Array.isArray(candidate) ||
          candidate.nonce !== nonce ||
          typeof candidate.ok !== 'boolean' ||
          (candidate.error !== undefined && typeof candidate.error !== 'string') ||
          (candidate.permissionDenied !== undefined &&
            typeof candidate.permissionDenied !== 'boolean')
        )
          throw new Error('Invalid Windows action result')
        // 第一份通过 OS 身份和字段校验的终态固定，不接受重复覆盖。
        if (!result && Array.isArray(candidate.actionStages)) {
          // 仅固定阶段/时间/PID 可进入日志；原始数组不是新的授权证据。
          for (const value of candidate.actionStages.slice(0, 64)) {
            const event = parseWindowsActionStage(value)
            if (event && event.stage.startsWith('action.')) recordStage(event, true)
          }
        }
        if (!result && Array.isArray(candidate.processStopEvents)) {
          executionLog = logStop('action.execution', {
            actionId,
            elevated,
            ok: candidate.ok,
            error: candidate.error,
            // 服务显式集合上限 4096，每个目标最多六条阶段，保留完整实际执行顺序。
            // 动作已通过本次 pipe/nonce 认证；事件仅诊断，不触发额外 kill。
            eventCount: candidate.processStopEvents.length,
            eventsTruncated: candidate.processStopEvents.length > 4096 * 6,
            events: candidate.processStopEvents.slice(0, 4096 * 6)
          })
        }
        if (
          !result &&
          reportTiming &&
          typeof candidate.timingMs === 'number' &&
          Number.isFinite(candidate.timingMs)
        )
          acceptOperationTimingLine(
            `FLYENV_TIMING|action.execute|${candidate.timingMs}`,
            candidate.ok ? 'ok' : 'error'
          )
        result ??= candidate
      }
    })
  )
  const resultReady = pipe.resultReady
  const close = pipe.close
  try {
    let launchError: any
    try {
      await timeOperation(
        elevated ? 'uac.launch-and-result' : 'ordinary.launch-and-result',
        async () => {
          // 生产不再启动额外 launcher；只等待 broker 的启动/退出诊断和认证结果。
          // 保留可替换 launcher 的测试入口，以复现旧的退出/迟到结果边界。
          if (!options.launch) return await waitForWindowsBrokerLaunch(pipe.launchReady)
          // 测试分支尚未启动动作，在这里检查路径；生产已由 broker 检查并开始启动，
          // 不在此再次读取路径，避免启动后路径变化被误报为“尚未执行的启动失败”。
          const executable = resolveWindowsPowerShellPath()
          const launcher = buildWindowsRunAsLauncher(executable, childArgs.join(' '), reportTiming)
          const plan = {
            executable,
            args: elevated ? ['-NoProfile', '-NonInteractive', '-Command', launcher] : args
          }
          markOperationStage(elevated ? 'uac.launcher-spawn' : 'ordinary.action-spawn')
          return await options.launch(plan)
        }
      )
    } catch (error) {
      launchError = error
    }
    // Windows 进程退出与 Node 管道 data 回调的调度先后不确定。给予结果
    // 一秒缓冲，避免成功动作被误判未知并永久进入 uncertain 集合。
    if (!result) {
      let timer: ReturnType<typeof setTimeout> | undefined
      await Promise.race([
        resultReady,
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, 1000)
        })
      ])
      clearTimeout(timer)
    }
    if (result) {
      await Promise.all(stageLogs)
      await executionLog
      if (result.ok) {
        logResult('completed')
        return result.data as T
      }
      throw new AppHelperError(
        result.permissionDenied ? 'windows_permission_denied' : 'helper_execution_failed',
        result.error || 'Windows action failed'
      )
    }
    let detail: WindowsLaunchDiagnostic = {}
    try {
      const parsed = JSON.parse(launchError?.stdout?.trim() || '{}')
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) detail = parsed
    } catch {}
    // 1223 是用户拒绝，73 是业务脚本执行前无法连接管道；都可确定尚未执行。
    if (detail.nativeErrorCode === 1223 && isWindowsLaunchFailure(detail))
      throw new AppHelperError(
        'elevation_uac_cancelled',
        'Windows administrator approval was cancelled'
      )
    if (detail.nativeErrorCode === 73 && (detail.pipeConnectFailed || detail.phase === undefined))
      throw new AppHelperError('elevation_pipe_connect_failed', detail.message!)
    if (isWindowsLaunchFailure(detail))
      throw new AppHelperError(
        'elevation_launch_failed',
        detail.message || 'Windows could not launch the administrator process'
      )
    // broker/测试 launcher 被结束或子进程普通退出而无结果时，不能推断操作未发生。
    if (!launchError || launchError?.killed || typeof launchError?.code === 'number') {
      unknown = true
      // 只读请求没有重复系统修改的风险，但仍保留迟到结果通道用于资源清理。
      if (!options.readOnly) uncertain.add(digest)
      throw new AppHelperError(
        'elevation_status_timeout',
        'Windows action returned no authenticated result and may still be completing'
      )
    }
    throw new AppHelperError(
      'elevation_launch_failed',
      detail.message || launchError?.message || 'Windows action returned no authenticated result'
    )
  } catch (error) {
    logResult('failed', error)
    throw error
  } finally {
    if (unknown) {
      // 已返回的 Promise 不因迟到结果改成成功；迟到终态仅解除重放保护并清理。
      pipe.retain()
      const timer = setTimeout(() => {
        close()
      }, GRACE_MS)
      timer.unref()
      void resultReady.then(async () => {
        clearTimeout(timer)
        if (!options.readOnly) uncertain.delete(digest)
        await executionLog
        logResult(result?.ok ? 'completed-late' : 'failed-late')
        close()
      })
    } else close()
  }
}
