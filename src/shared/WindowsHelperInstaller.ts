import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createServer, type Socket } from 'node:net'
import { randomUUID } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { windowsPowerShellEnv, windowsPowerShellPath } from './WindowsHelperIdentity'
import { AppHelperError, type AppHelperErrorCode } from './WindowsHelperState'

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
$pipe = New-Object IO.Pipes.NamedPipeClientStream('.', ${quote(pipeName)}, [IO.Pipes.PipeDirection]::Out)
try {
  $pipe.Connect(10000)
} catch {
  try { $pipe.Dispose() } catch {}
  exit ${WINDOWS_HELPER_PIPE_CONNECT_EXIT_CODE}
}
$writer = New-Object IO.StreamWriter($pipe, (New-Object Text.UTF8Encoding($false)))
$writer.AutoFlush = $true
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
  finally { $writer.Dispose(); $pipe.Dispose(); $consoleLog.Dispose() }
}
exit $global:LASTEXITCODE
`
  const compressed = gzipSync(Buffer.from(child, 'utf8')).toString('base64')
  // The bootstrap contains no double quotes, so one Windows argument can carry it
  // through Start-Process without cmd.exe or another layer of shell interpolation.
  const childCommand = `& { $s = New-Object IO.MemoryStream(,[Convert]::FromBase64String('${compressed}')); $g = New-Object IO.Compression.GZipStream($s,[IO.Compression.CompressionMode]::Decompress); $r = New-Object IO.StreamReader($g,[Text.Encoding]::UTF8); try { $c = $r.ReadToEnd() } finally { $r.Dispose(); $g.Dispose(); $s.Dispose() }; & ([ScriptBlock]::Create($c)) }`
  const argumentsText = `-NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "${childCommand}"`
  const launcher = `$ErrorActionPreference = 'Stop'; [Console]::OutputEncoding = [Text.Encoding]::UTF8; try { $p = Start-Process -FilePath ${quote(powershell)} -ArgumentList ${quote(argumentsText)} -Verb RunAs -WindowStyle Hidden -Wait -PassThru; if ($p.ExitCode -eq ${WINDOWS_HELPER_PIPE_CONNECT_EXIT_CODE}) { @{ nativeErrorCode=$p.ExitCode; message='The elevated installer could not connect to the FlyEnv result pipe. An antivirus or pipe policy may have blocked it.' } | ConvertTo-Json -Compress }; exit $p.ExitCode } catch { $e = $_.Exception; while ($e.InnerException) { $e = $e.InnerException }; @{ nativeErrorCode=$e.NativeErrorCode; message=$e.Message } | ConvertTo-Json -Compress; exit 1 }`
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
  const sockets = new Set<Socket>()
  let result: InstallResult | undefined
  let awaitingLateResult = false
  let resultArrived!: () => void
  const resultReady = new Promise<void>((resolve) => {
    resultArrived = resolve
  })
  const server = createServer((socket) => {
    sockets.add(socket)
    socket.setTimeout(awaitingLateResult ? LATE_RESULT_GRACE_MS : 180_000, () => socket.destroy())
    if (awaitingLateResult) socket.unref()
    socket.on('error', () => {})
    socket.on('close', () => sockets.delete(socket))
    let buffer = ''
    socket.setEncoding('utf8')
    socket.on('data', (chunk: string) => {
      buffer += chunk
      if (Buffer.byteLength(buffer, 'utf8') > MAX_RESULT_BYTES) {
        socket.destroy()
        return
      }
      if (!buffer.includes('\n')) return
      try {
        const message = JSON.parse(buffer.slice(0, buffer.indexOf('\n')))
        if (
          message.nonce === nonce &&
          Number.isInteger(message.exitCode) &&
          typeof message.stdout === 'string' &&
          typeof message.stderr === 'string'
        ) {
          result = message
          resultArrived()
        }
      } catch {
        /* Ignore malformed or unrelated peers; never trust an unauthenticated result. */
      }
      socket.end()
    })
  })
  const closeResults = async () => {
    for (const socket of sockets) socket.destroy()
    if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()))
  }
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(`\\\\.\\pipe\\${pipeName}`, resolve)
    })
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
    let details: { nativeErrorCode?: number; message?: string } = {}
    try {
      details = JSON.parse(launchError?.stdout?.trim() || '{}')
    } catch {
      /* Preserve original error below. */
    }
    if (details.nativeErrorCode === 1223)
      throw new AppHelperError(
        'elevation_uac_cancelled',
        'Windows administrator approval was cancelled'
      )
    if (details.nativeErrorCode === WINDOWS_HELPER_PIPE_CONNECT_EXIT_CODE)
      throw new AppHelperError(
        'elevation_pipe_connect_failed',
        'The elevated installer could not connect to the FlyEnv result pipe. An antivirus or pipe policy may have blocked it.',
        launchError?.stderr
      )
    if (launchError?.killed) {
      awaitingLateResult = true
      throw new AppHelperError(
        'elevation_status_timeout',
        'Timed out waiting for Windows administrator approval or installation. The installer may still be finishing; no installation files were removed.'
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
      server.unref()
      for (const socket of sockets) {
        socket.setTimeout(LATE_RESULT_GRACE_MS)
        socket.unref()
      }
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
