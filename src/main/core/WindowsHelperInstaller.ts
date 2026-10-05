/** main 持有 Helper 管理操作的生命周期；共享层仅提供身份契约与认证运输。 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { randomUUID } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import {
  windowsPowerShellEnv,
  windowsPowerShellPath,
  resolveWindowsPowerShellPath
} from '@shared/WindowsSystemPaths'
import { AppHelperError, type AppHelperErrorCode } from '@shared/WindowsHelperState'
import {
  buildWindowsRunAsLauncher,
  isWindowsLaunchFailure,
  type WindowsLaunchDiagnostic
} from '@shared/WindowsRunAs'
import { buildWindowsPipeClient, createWindowsActionPipe } from '@shared/WindowsActionPipe'

const execFileAsync = promisify(execFile)
const quote = (text: string) => `'${text.replace(/'/g, "''")}'`
const MAX_RESULT_BYTES = 128 * 1024
const LATE_RESULT_GRACE_MS = 10 * 60_000
// Distinct elevated-child exit code: the child could not reach the result pipe, so
// this code is the only channel back. The launcher converts it into JSON diagnostics.
export const WINDOWS_HELPER_PIPE_CONNECT_EXIT_CODE = 73

type InstallResult = { nonce: string; exitCode: number; stdout: string; stderr: string }
type InstallPlan = { powershell: string; childCommand: string; launcher: string }
type InstallOptions = {
  launch?: (plan: InstallPlan) => Promise<{ stdout: string; stderr: string }>
}

// Everything crossing the UAC boundary is command data. Neither an administrator's
// profile nor access to the initiating user's TEMP scripts/status files is required.
export const buildWindowsHelperElevationPlan = (
  script: string,
  pipeName: string,
  nonce: string
): InstallPlan => {
  const powershell = windowsPowerShellPath()
  const child = `
$ErrorActionPreference = 'Stop'
$env:PSModulePath = Join-Path $PSHOME 'Modules'
${buildWindowsPipeClient(pipeName)}
try {
  $pipe.Connect(10000)
} catch {
  try { $pipe.Dispose() } catch {}
  exit ${WINDOWS_HELPER_PIPE_CONNECT_EXIT_CODE}
}
$writer = New-Object IO.StreamWriter($pipe, (New-Object Text.UTF8Encoding($false)))
$writer.AutoFlush = $true
$reader = New-Object IO.StreamReader($pipe, (New-Object Text.UTF8Encoding($false)))
try {
  # Only an OS-authenticated connection receives READY; installation cannot start before that acknowledgement.
  $writer.WriteLine(${quote(nonce)})
  if ($reader.ReadLine() -cne 'READY') { throw 'Helper result pipe did not approve the connection' }
} catch { $reader.Dispose(); $writer.Dispose(); $pipe.Dispose(); exit ${WINDOWS_HELPER_PIPE_CONNECT_EXIT_CODE} }
$consoleLog = New-Object IO.StringWriter
[Console]::SetOut($consoleLog)
[Console]::SetError($consoleLog)
$global:LASTEXITCODE = 1
$output = ''
try {
  & {
${script}
  } *>&1 | ForEach-Object { $text = [string]$_ + [Environment]::NewLine; $room = 8000 - $output.Length; if ($room -gt 0) { $output += $text.Substring(0, [Math]::Min($room, $text.Length)) } }
} catch {
  $global:LASTEXITCODE = 1
  $consoleLog.WriteLine($_.Exception.Message)
} finally {
  $errors = $consoleLog.ToString()
  if ($errors.Length -gt 8000) { $errors = $errors.Substring($errors.Length - 8000) }
  try { $writer.WriteLine((@{ nonce=${quote(nonce)}; exitCode=[int]$global:LASTEXITCODE; stdout=$output; stderr=$errors } | ConvertTo-Json -Compress)) }
  finally { $reader.Dispose(); $writer.Dispose(); $pipe.Dispose(); $consoleLog.Dispose() }
}
exit $global:LASTEXITCODE
`
  const compressed = gzipSync(Buffer.from(child, 'utf8')).toString('base64')
  // The bootstrap contains no double quotes, so one Windows argument can carry it
  // through Start-Process without cmd.exe or another layer of shell interpolation.
  const childCommand = `& { $s = New-Object IO.MemoryStream(,[Convert]::FromBase64String('${compressed}')); $g = New-Object IO.Compression.GZipStream($s,[IO.Compression.CompressionMode]::Decompress); $r = New-Object IO.StreamReader($g,[Text.Encoding]::UTF8); try { $c = $r.ReadToEnd() } finally { $r.Dispose(); $g.Dispose(); $s.Dispose() }; & ([ScriptBlock]::Create($c)) }`
  const argumentsText = `-NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "${childCommand}"`
  const launcher = buildWindowsRunAsLauncher(powershell, argumentsText)
  if (launcher.length + powershell.length + 256 >= 30000) {
    throw new AppHelperError(
      'elevation_launch_failed',
      'Helper installer exceeds the Windows command-line limit'
    )
  }
  return { powershell, childCommand, launcher }
}

export const runWindowsHelperInstaller = async (
  script: string,
  options: InstallOptions = {}
): Promise<{ stdout: string; stderr: string }> => {
  const nonce = randomUUID()
  const pipeName = `FlyEnv.Install.${randomUUID()}`
  const plan = buildWindowsHelperElevationPlan(script, pipeName, nonce)
  // 计划构造保持纯函数；安装开始前验证系统文件，缺失时不启动 broker 或弹 UAC。
  resolveWindowsPowerShellPath()
  let result: InstallResult | undefined
  let awaitingLateResult = false
  // 安装和业务执行共用 native 身份边界；不能仅凭命令行可见的 nonce 接受安装成功。
  const pipe = await createWindowsActionPipe({
    pipeName,
    nonce,
    elevated: true,
    maxBytes: MAX_RESULT_BYTES,
    onResult: (value) => {
      const message = value as InstallResult
      if (
        !message ||
        typeof message !== 'object' ||
        Array.isArray(message) ||
        message.nonce !== nonce ||
        !Number.isInteger(message.exitCode) ||
        typeof message.stdout !== 'string' ||
        typeof message.stderr !== 'string'
      )
        throw new Error('Invalid Helper installation result')
      // 首份可信终态固定，重复消息或连接不可覆盖。
      result ??= message
    }
  })
  const resultReady = pipe.resultReady
  const closeResults = pipe.close
  try {
    const launch =
      options.launch ??
      ((p: InstallPlan) =>
        execFileAsync(p.powershell, ['-NoProfile', '-NonInteractive', '-Command', p.launcher], {
          windowsHide: true,
          timeout: 180_000,
          maxBuffer: MAX_RESULT_BYTES,
          env: windowsPowerShellEnv()
        }))
    let launchError: any
    try {
      await launch(plan)
    } catch (error) {
      launchError = error
    }
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
      if (result.exitCode === 0) return { stdout: result.stdout, stderr: result.stderr }
      const diagnostic = `${result.stdout}\n${result.stderr}`.trim()
      const marker = diagnostic.match(/FLYENV_HELPER_INSTALL_ERROR:([a-z_]+):([^\r\n]*)/)
      const codes: AppHelperErrorCode[] = [
        'helper_binary_missing',
        'helper_acl_invalid',
        'helper_task_invalid',
        'helper_task_start_failed',
        'helper_execution_failed'
      ]
      const code =
        marker && codes.includes(marker[1] as AppHelperErrorCode)
          ? (marker[1] as AppHelperErrorCode)
          : 'helper_execution_failed'
      throw new AppHelperError(
        code,
        marker?.[2] || `Helper installer exited with code ${result.exitCode}`,
        marker ? `${marker[0]}\n${diagnostic}` : diagnostic
      )
    }
    let details: WindowsLaunchDiagnostic = {}
    try {
      const parsed = JSON.parse(launchError?.stdout?.trim() || '{}')
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) details = parsed
    } catch {
      /* Preserve original error below. */
    }
    if (details.nativeErrorCode === 1223 && isWindowsLaunchFailure(details))
      throw new AppHelperError(
        'elevation_uac_cancelled',
        'Windows administrator approval was cancelled'
      )
    if (
      details.nativeErrorCode === WINDOWS_HELPER_PIPE_CONNECT_EXIT_CODE &&
      (details.pipeConnectFailed || details.phase === undefined)
    )
      throw new AppHelperError(
        'elevation_pipe_connect_failed',
        'The elevated installer could not connect to the FlyEnv result pipe. An antivirus or pipe policy may have blocked it.',
        launchError?.stderr
      )
    // 能确认 RunAs 启动失败的原生错误，与“子进程可能已安装但结果丢失”分开。
    // 不能将普通退出码/空结果视为未执行，否则 UI 会引导用户盲目重装。
    if (isWindowsLaunchFailure(details))
      throw new AppHelperError(
        'elevation_launch_failed',
        details.message || 'Windows could not launch the Helper installer',
        launchError?.stderr
      )
    if (!launchError || launchError?.killed || typeof launchError?.code === 'number') {
      awaitingLateResult = true
      throw new AppHelperError(
        'elevation_status_timeout',
        'No authenticated installation result was received. The installer may still be finishing; no installation files were removed.'
      )
    }
    throw new AppHelperError(
      'elevation_launch_failed',
      details.message ||
        launchError?.message ||
        'Elevated installer returned no authenticated result',
      launchError?.stderr
    )
  } finally {
    if (awaitingLateResult) {
      // Killing the launcher does not kill its elevated child. Retain the result
      // channel for a bounded grace period; the SID mutex still serializes retries.
      // These cleanup resources must not keep the application alive by themselves.
      pipe.retain()
      const cleanupTimer = setTimeout(() => {
        void closeResults()
      }, LATE_RESULT_GRACE_MS)
      cleanupTimer.unref()
      void resultReady.then(() => {
        clearTimeout(cleanupTimer)
        return closeResults()
      })
    } else {
      await closeResults()
    }
  }
}
