import type { CronJob, SystemScheduledTask } from '@shared/app'
import EnvSync from '@shared/EnvSync'
import { getPortableCronSchedule } from '@shared/CronExpression'
import type { PortableCronSchedule } from '@shared/CronExpression'
import { existsSync } from 'fs'
import { dirname, join } from 'path'
import { mkdirp, readFile, remove, spawnPromiseWithEnv, writeFile } from '../../Fn'
import { base64, homePath, runLogPath, systemTaskName, taskScriptPath } from './utils'

type WindowsCronWrapperScriptParams = {
  jobId: string
  hostId?: number
  scope: string
  command: string
  workDir: string
  runDir: string
  logFile: string
  cmdExe: string
  envPath: string
}

export const WINDOWS_CRON_WRAPPER_VERSION = 2
export const WINDOWS_CRON_WRAPPER_VERSION_MARKER = `$FlyEnvCronWrapperVersion = ${WINDOWS_CRON_WRAPPER_VERSION}`

export function isCurrentWindowsCronWrapper(content: string | Buffer | undefined): boolean {
  return `${content || ''}`.includes(WINDOWS_CRON_WRAPPER_VERSION_MARKER)
}

export function buildWindowsCronWrapperScript(params: WindowsCronWrapperScriptParams): string {
  return `${WINDOWS_CRON_WRAPPER_VERSION_MARKER}
$ErrorActionPreference = 'Continue'
$JobId = '${params.jobId}'
$HostId = '${params.hostId ? `${params.hostId}` : ''}'
$Scope = '${params.scope}'
$Command = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${base64(params.command)}'))
$WorkDir = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${base64(params.workDir)}'))
$RunDir = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${base64(params.runDir)}'))
$LogFile = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${base64(params.logFile)}'))
$CmdExe = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${base64(params.cmdExe)}'))
$env:Path = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${base64(params.envPath)}'))

New-Item -ItemType Directory -Force -Path $RunDir | Out-Null
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $LogFile) | Out-Null
$LockFile = Join-Path $RunDir "$JobId.running.lock"
$LockHandle = $null
try {
  $LockHandle = [IO.File]::Open(
    $LockFile,
    [IO.FileMode]::OpenOrCreate,
    [IO.FileAccess]::ReadWrite,
    [IO.FileShare]::None
  )
} catch [IO.IOException] {
  exit 0
} catch {
  exit 1
}

$ExitCode = 1
try {
  $RunId = "$(Get-Date -Format yyyyMMddHHmmss)-$PID"
  $OutFile = Join-Path $RunDir "$JobId-$RunId.out"
  $ErrFile = Join-Path $RunDir "$JobId-$RunId.err"
  $StartedAt = [DateTimeOffset]::Now.ToUnixTimeMilliseconds()
  $ExitCode = 0
  $CmdEncoding = [Text.Encoding]::Default
  try {
    $CmdEncoding = [Text.Encoding]::GetEncoding([Globalization.CultureInfo]::CurrentCulture.TextInfo.OEMCodePage)
  } catch {}

  try {
    if (-not (Test-Path -LiteralPath $WorkDir -PathType Container)) {
      [IO.File]::WriteAllText($ErrFile, "Work directory not found: $WorkDir", [Text.Encoding]::UTF8)
      [IO.File]::WriteAllText($OutFile, '', [Text.Encoding]::UTF8)
      $ExitCode = 1
    } else {
      $psi = New-Object System.Diagnostics.ProcessStartInfo
      $psi.FileName = $CmdExe
      $psi.Arguments = '/d /c ' + $Command
      $psi.WorkingDirectory = $WorkDir
      $psi.UseShellExecute = $false
      $psi.CreateNoWindow = $true
      $psi.RedirectStandardOutput = $true
      $psi.RedirectStandardError = $true
      try {
        $psi.StandardOutputEncoding = $CmdEncoding
        $psi.StandardErrorEncoding = $CmdEncoding
      } catch {}

      $process = New-Object System.Diagnostics.Process
      $process.StartInfo = $psi
      [void]$process.Start()
      $stdoutTask = $process.StandardOutput.ReadToEndAsync()
      $stderrTask = $process.StandardError.ReadToEndAsync()
      $process.WaitForExit()
      [IO.File]::WriteAllText($OutFile, $stdoutTask.Result, [Text.Encoding]::UTF8)
      [IO.File]::WriteAllText($ErrFile, $stderrTask.Result, [Text.Encoding]::UTF8)
      $ExitCode = $process.ExitCode
    }
  } catch {
    [IO.File]::WriteAllText($OutFile, '', [Text.Encoding]::UTF8)
    [IO.File]::WriteAllText($ErrFile, $_.Exception.Message, [Text.Encoding]::UTF8)
    $ExitCode = 1
  }

  $FinishedAt = [DateTimeOffset]::Now.ToUnixTimeMilliseconds()
  $record = [ordered]@{
    id = $RunId
    jobId = $JobId
    hostId = if ($HostId) { [long]$HostId } else { $null }
    scope = $Scope
    startedAt = $StartedAt
    finishedAt = $FinishedAt
    duration = $FinishedAt - $StartedAt
    exitCode = $ExitCode
    output = if (Test-Path -LiteralPath $OutFile) { [IO.File]::ReadAllText($OutFile) } else { '' }
    error = if (Test-Path -LiteralPath $ErrFile) { [IO.File]::ReadAllText($ErrFile) } else { '' }
  }
  ($record | ConvertTo-Json -Compress -Depth 4) | Add-Content -Encoding UTF8 -LiteralPath $LogFile
  Remove-Item -Force -LiteralPath $OutFile, $ErrFile -ErrorAction SilentlyContinue
} finally {
  if ($null -ne $LockHandle) {
    $LockHandle.Dispose()
  }
}
exit $ExitCode
`
}

export class WindowsSystemScheduler {
  constructor(private cronRoot: string) {}

  private runLogPath(jobId: string): string {
    return runLogPath(this.cronRoot, jobId)
  }

  private taskScriptPath(jobId: string, ext: 'ps1' | 'cmd'): string {
    return taskScriptPath(this.cronRoot, jobId, ext)
  }

  private winEnvValue(name: string): string {
    const env = { ...process.env, ...(EnvSync.AppEnv ?? {}) }
    const key = Object.keys(env).find((item) => item.toLowerCase() === name.toLowerCase())
    return key ? `${env[key] || ''}` : ''
  }

  private cmdQuote(value: string): string {
    return `"${value.replace(/"/g, '""')}"`
  }

  private async syncEnv() {
    await EnvSync.sync()
  }

  private systemRoot(): string {
    return this.winEnvValue('SystemRoot') || this.winEnvValue('windir') || 'C:\\Windows'
  }

  private async schtasksPath(): Promise<string> {
    await this.syncEnv()
    const systemRoot = this.systemRoot()
    const systemPath = EnvSync.SystemPath || join(systemRoot, 'System32')
    const candidates = [
      join(systemPath, 'schtasks.exe'),
      join(systemRoot, 'Sysnative', 'schtasks.exe'),
      join(systemRoot, 'System32', 'schtasks.exe')
    ]
    return candidates.find((path) => existsSync(path)) || 'schtasks.exe'
  }

  private async cmdPath(): Promise<string> {
    await this.syncEnv()
    const systemRoot = this.systemRoot()
    const candidates = [
      EnvSync.CMDPath,
      join(systemRoot, 'Sysnative', 'cmd.exe'),
      join(systemRoot, 'System32', 'cmd.exe')
    ].filter(Boolean) as string[]
    return candidates.find((path) => existsSync(path)) || 'cmd.exe'
  }

  private async powerShellPath(): Promise<string> {
    await this.syncEnv()
    const systemRoot = this.systemRoot()
    const candidates = [
      EnvSync.PowerShellPath,
      join(systemRoot, 'Sysnative', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
      join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    ].filter(Boolean) as string[]
    return candidates.find((path) => existsSync(path)) || 'powershell.exe'
  }

  private async resolvePath(): Promise<string> {
    await this.syncEnv()
    const env = { ...process.env, ...(EnvSync.AppEnv ?? {}) }
    return `${env.Path || env.PATH || process.env.Path || process.env.PATH || ''}`
  }

  private async writeWrapper(job: CronJob): Promise<string> {
    const psFile = this.taskScriptPath(job.id, 'ps1')
    const workDir = job.workDir || homePath()
    const runDir = join(this.cronRoot, 'tmp')
    const logFile = this.runLogPath(job.id)
    const scope = job.scope ?? (job.hostId ? 'host' : 'global')
    const cmdExe = await this.cmdPath()
    const powerShell = await this.powerShellPath()
    const envPath = await this.resolvePath()

    const psContent = buildWindowsCronWrapperScript({
      jobId: job.id,
      hostId: job.hostId,
      scope,
      command: job.command,
      workDir,
      runDir,
      logFile,
      cmdExe,
      envPath
    })

    await mkdirp(dirname(psFile))
    await writeFile(psFile, psContent)
    return `${this.cmdQuote(powerShell)} -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File ${this.cmdQuote(psFile)}`
  }

  private taskTime(hour: number, minute: number): string {
    return `${`${hour}`.padStart(2, '0')}:${`${minute}`.padStart(2, '0')}`
  }

  private weekdayName(day: number): string {
    return ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][day]
  }

  private monthName(month: number): string {
    return ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][
      month - 1
    ]
  }

  private scheduleArgs(schedule: PortableCronSchedule): string[] {
    switch (schedule.type) {
      case 'minute':
        return ['/SC', 'MINUTE', '/MO', `${schedule.interval}`, '/ST', '00:00']
      case 'hourly':
        return [
          '/SC',
          'HOURLY',
          '/MO',
          `${schedule.interval}`,
          '/ST',
          this.taskTime(0, schedule.minute)
        ]
      case 'daily':
        return ['/SC', 'DAILY', '/MO', '1', '/ST', this.taskTime(schedule.hour, schedule.minute)]
      case 'weekly':
        return [
          '/SC',
          'WEEKLY',
          '/D',
          schedule.weekdays.map((day) => this.weekdayName(day)).join(','),
          '/ST',
          this.taskTime(schedule.hour, schedule.minute)
        ]
      case 'monthly': {
        const monthArg =
          schedule.months.length === 12
            ? '*'
            : schedule.months.map((month) => this.monthName(month)).join(',')
        return [
          '/SC',
          'MONTHLY',
          '/D',
          `${schedule.day}`,
          '/M',
          monthArg,
          '/ST',
          this.taskTime(schedule.hour, schedule.minute)
        ]
      }
    }
  }

  private async installTask(job: CronJob, taskAction: string) {
    const schedule = getPortableCronSchedule(job.schedule)
    await spawnPromiseWithEnv(
      await this.schtasksPath(),
      [
        '/Create',
        '/TN',
        systemTaskName(job.id),
        ...this.scheduleArgs(schedule),
        '/TR',
        taskAction,
        '/F'
      ],
      { windowsHide: true }
    )
  }

  private async removeTask(jobId: string) {
    await spawnPromiseWithEnv(
      await this.schtasksPath(),
      ['/Delete', '/TN', systemTaskName(jobId), '/F'],
      { windowsHide: true }
    ).catch(() => {})
  }

  async install(job: CronJob) {
    const taskAction = await this.writeWrapper(job)
    await this.installTask(job, taskAction)
  }

  async repair(jobs: CronJob[]): Promise<void> {
    for (const job of jobs) {
      if (!job.enabled) {
        continue
      }

      try {
        const psFile = this.taskScriptPath(job.id, 'ps1')
        const content = await readFile(psFile, 'utf8').catch(() => undefined)
        if (isCurrentWindowsCronWrapper(content)) {
          continue
        }
        await this.writeWrapper(job)
      } catch (error) {
        console.error(`[Cron][Windows] wrapper repair failed for ${job.id}:`, error)
      }
    }
  }

  async remove(jobId: string) {
    await this.removeTask(jobId)
    await remove(this.taskScriptPath(jobId, 'ps1')).catch(() => {})
    await remove(this.taskScriptPath(jobId, 'cmd')).catch(() => {})
  }

  async listSystemTasks(): Promise<SystemScheduledTask[]> {
    const script = `
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$tasks = @(Get-ScheduledTask | Sort-Object TaskPath, TaskName | ForEach-Object {
  $actions = @($_.Actions | ForEach-Object {
    $parts = @()
    if ($_.Execute) { $parts += $_.Execute }
    if ($_.Arguments) { $parts += $_.Arguments }
    if ($_.WorkingDirectory) { $parts += ('StartIn=' + $_.WorkingDirectory) }
    $parts -join ' '
  }) -join [Environment]::NewLine
  $triggers = @($_.Triggers | ForEach-Object { $_.ToString() }) -join [Environment]::NewLine
  $info = $null
  $nextRunTime = $null
  try {
    $info = Get-ScheduledTaskInfo -TaskName $_.TaskName -TaskPath $_.TaskPath -ErrorAction Stop
    if ($info.NextRunTime -and $info.NextRunTime.Year -gt 1900) {
      $nextRunTime = [DateTimeOffset]::new($info.NextRunTime).ToUnixTimeMilliseconds()
    }
  } catch {}
  $fullName = "$($_.TaskPath)$($_.TaskName)"
  $isFlyEnv = $_.TaskName -like 'FlyEnv-Cron-*'
  $jobId = if ($isFlyEnv) { $_.TaskName.Substring('FlyEnv-Cron-'.Length) } else { $null }
  [PSCustomObject]@{
    id = $fullName
    platform = 'windows'
    name = $_.TaskName
    fullName = $fullName
    path = $_.TaskPath
    schedule = $triggers
    command = $actions
    nextRunTime = $nextRunTime
    state = [string]$_.State
    enabled = [bool]($_.State -ne 'Disabled')
    description = [string]$_.Description
    author = [string]$_.Author
    isFlyEnv = [bool]$isFlyEnv
    jobId = $jobId
    raw = $fullName
  }
})
if ($tasks.Count -eq 0) { '[]' } else { $tasks | ConvertTo-Json -Compress -Depth 6 }
`
    const res = await spawnPromiseWithEnv(
      await this.powerShellPath(),
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { windowsHide: true }
    )
    const raw = `${res.stdout || ''}`.trim()
    if (!raw) {
      return []
    }
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : [parsed]
  }

  async deleteSystemTask(id: string): Promise<void> {
    if (!id?.trim()) {
      throw new Error('System task id is required')
    }

    await spawnPromiseWithEnv(await this.schtasksPath(), ['/Delete', '/TN', id.trim(), '/F'], {
      windowsHide: true
    })
  }
}
