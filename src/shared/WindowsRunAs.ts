import { buildPerformanceScriptTiming } from './PerformanceDiagnostics'
const quote = (value: string) => `'${value.replace(/'/g, "''")}'`

/**
 * RunAs 的诊断来自受控 launcher，不能只看外层 PowerShell 退出码。
 * launch 阶段未拿到进程句柄可确认启动失败；wait 阶段出错则子进程可能已执行。
 * 异常类型用于定位企业策略问题，本身不作为“动作未执行”的证明。
 */
export type WindowsLaunchDiagnostic = {
  phase?: 'launch' | 'wait'
  childStarted?: boolean
  nativeErrorCode?: number
  exceptionType?: string
  pipeConnectFailed?: boolean
  message?: string
}

/** 直接使用受控 ProcessStartInfo，避免 Start-Process 的启动和 -Wait 共用一个 catch。 */
export const buildWindowsRunAsLauncher = (
  executable: string,
  argumentsText: string,
  // 仅性能诊断时打印固定标记；标记不参与启动/终态判断，也不包含业务参数。
  reportTiming = false
) => `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$phase = 'launch'
$started = $false
$p = $null
try {
  $info = New-Object Diagnostics.ProcessStartInfo
  $info.FileName = ${quote(executable)}
  $info.Arguments = ${quote(argumentsText)}
  $info.UseShellExecute = $true
  $info.Verb = 'runas'
  $info.WindowStyle = [Diagnostics.ProcessWindowStyle]::Hidden
  ${buildPerformanceScriptTiming('launcher.runas', 'start', reportTiming)}
  try { $p = [Diagnostics.Process]::Start($info) }
  finally {
    ${buildPerformanceScriptTiming('launcher.runas', 'end', reportTiming)}
  }
  # A successful Start call without a usable handle is still potentially started; never classify it as safe to replay.
  $started = $true
  $phase = 'wait'
  if ($null -eq $p) { throw 'Windows did not return an administrator process handle' }
  $p.WaitForExit()
  if ($p.ExitCode -eq 73) {
    @{ phase='wait'; childStarted=$true; nativeErrorCode=73; pipeConnectFailed=$true; message='The administrator process could not connect to the FlyEnv result pipe' } | ConvertTo-Json -Compress
  }
  exit $p.ExitCode
} catch {
  $e = $_.Exception
  while ($e.InnerException) { $e = $e.InnerException }
  @{ phase=$phase; childStarted=$started; nativeErrorCode=$e.NativeErrorCode; exceptionType=$e.GetType().FullName; message=$e.Message } | ConvertTo-Json -Compress
  exit 1
} finally { if ($null -ne $p) { $p.Dispose() } }
`

/** 旧诊断仅有原生启动错误；新诊断必须明确处于 launch 且未启动，wait 错误不能重放。 */
export const isWindowsLaunchFailure = (detail: WindowsLaunchDiagnostic) =>
  (detail.phase === 'launch' && detail.childStarted === false) ||
  (detail.phase === undefined && !!detail.nativeErrorCode)
