import { spawn } from 'node:child_process'
import { closeSync, openSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { mkdir, readFile, rm, stat } from 'node:fs/promises'
import EnvSync from '@shared/EnvSync'
import { powerShellInlineArgs } from '@shared/PowerShellCommand'
import { resolveWindowsPowerShellPath } from '@shared/WindowsSystemPaths'
import { AppLog } from '../../Fn'
import { I18nT } from '@lang/runtime'
import type { ServiceStartSpawnParams } from '../../util/ServiceStart'

const quote = (value: string) => `'${value.replaceAll("'", "''")}'`

export function buildNumaWindowsStartScript(bin: string, configFile: string, pidFile: string) {
  return `$ErrorActionPreference = 'Stop'
$process = $null
try {
  $info = New-Object Diagnostics.ProcessStartInfo
  $info.FileName = ${quote(bin)}
  $info.Arguments = ${quote(`"${configFile}"`)}
  $info.WorkingDirectory = ${quote(dirname(bin))}
  $info.UseShellExecute = $false
  # Keep a hidden console for Numa's ipconfig/hostname children to inherit.
  # CREATE_NO_WINDOW hides only Numa itself; its children otherwise allocate visible consoles.
  $info.CreateNoWindow = $false
  $info.WindowStyle = [Diagnostics.ProcessWindowStyle]::Hidden
  $process = [Diagnostics.Process]::Start($info)
  if ($null -eq $process) { throw 'Windows did not return the Numa process handle' }
  if ($process.WaitForExit(500)) { throw ('Numa exited during startup: ' + $process.ExitCode) }
  [IO.File]::WriteAllText(${quote(pidFile)}, $process.Id.ToString(), (New-Object Text.UTF8Encoding($false)))
} catch {
  $failure = $_
  if ($null -ne $process -and -not $process.HasExited) {
    try { $process.Kill(); $process.WaitForExit() }
    catch { [Console]::Error.WriteLine('Numa startup cleanup failed: ' + $_) }
  }
  [Console]::Error.WriteLine($failure)
  exit 1
} finally { if ($null -ne $process) { $process.Dispose() } }
`
}

/** Ordinary one-shot launcher: no elevation, service installation or persistent wrapper. */
export async function startNumaWindows(
  params: Pick<ServiceStartSpawnParams, 'version' | 'baseDir' | 'bin' | 'on'> & {
    configFile: string
    pidPath: string
  }
): Promise<{ 'APP-Service-Start-PID': string }> {
  const { version, baseDir, bin, configFile, pidPath, on } = params
  await mkdir(baseDir, { recursive: true })
  await mkdir(dirname(pidPath), { recursive: true })
  await rm(pidPath, { force: true })
  const versionText = version.version!.trim().replaceAll(' ', '')
  const output = join(baseDir, `numa-${versionText}-start-out.log`)
  const errorLog = join(baseDir, `numa-${versionText}-start-error.log`)
  const previousErrorSize = await stat(errorLog).then(
    (info) => info.size,
    (error) => {
      if (error.code === 'ENOENT') return 0
      throw error
    }
  )
  const env = await EnvSync.sync()
  const powerShell = resolveWindowsPowerShellPath()
  on({ 'APP-On-Log': AppLog('info', I18nT('appLog.execStartCommand')) })
  const out = openSync(output, 'a')
  let err: number | undefined
  try {
    err = openSync(errorLog, 'a')
    const launcher = spawn(
      powerShell,
      powerShellInlineArgs(buildNumaWindowsStartScript(bin, configFile, pidPath)),
      {
        env,
        cwd: dirname(bin),
        windowsHide: true,
        stdio: ['ignore', out, err]
      }
    )
    await new Promise<void>((resolve, reject) => {
      launcher.once('error', reject)
      launcher.once('exit', (code, signal) => {
        if (code === 0) resolve()
        else reject(new Error(`Numa launcher failed (${signal ?? code})`))
      })
    })
  } catch (error) {
    const details = await readFile(errorLog).then(
      (data) => data.subarray(previousErrorSize).toString('utf8').slice(-16000),
      () => ''
    )
    throw new Error([String(error), details.trim()].filter(Boolean).join('\n'))
  } finally {
    closeSync(out)
    if (err !== undefined) closeSync(err)
  }
  const pid = (await readFile(pidPath, 'utf8')).trim()
  if (!/^[1-9]\d*$/.test(pid)) throw new Error('Numa launcher returned an invalid PID')
  return { 'APP-Service-Start-PID': pid }
}
