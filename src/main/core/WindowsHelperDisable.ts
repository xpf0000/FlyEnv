/** main 持有 Helper 管理操作的生命周期；共享层仅提供身份契约与认证运输。 */
import {
  getWindowsHelperIdentity,
  windowsHelperArguments,
  type WindowsHelperIdentity
} from '@shared/WindowsHelperIdentity'
import { isWindowsProcessElevated, withWindowsElevationLease } from '@shared/WindowsPrivilege'
import { runWindowsAction } from '@shared/WindowsElevation'
import { access } from 'node:fs/promises'

const quote = (value: string) => `'${value.replace(/'/g, "''")}'`
// 停用可跨页面且涉及 SYSTEM 进程，重复命令共享一次维护操作及最终结果。
let pending: Promise<boolean> | undefined

/**
 * 只停原用户 SID 派生的精确任务和实例程序。SYSTEM 主体、动作、参数及
 * 登录触发 SID 全部匹配后才修改任务；任何可疑定义都明确拒绝。
 * 禁用任务防止下次登录再启动，随后等待进程退出；安装文件保留供以后修复。
 */
export const buildWindowsHelperDisableScript = (identity: WindowsHelperIdentity): string => `
$ErrorActionPreference = 'Stop'
$scheduler = New-Object -ComObject 'Schedule.Service'
$scheduler.Connect()
$task = $null
try { $task = $scheduler.GetFolder(${quote(identity.taskFolder)}).GetTask(${quote(identity.taskName)}) }
catch { if (($_.Exception.HResult -band 65535) -ne 2 -and ($_.Exception.HResult -band 65535) -ne 3) { throw } }
if ($null -ne $task) {
  # 跨账户批准 UAC 不改变目标 SID；不能按程序名或旧固定任务名批量停其他用户。
  $definition = $task.Definition
  $principal = [string]$definition.Principal.UserId
  if ($principal -notmatch '^S-1-') { $principal = (New-Object Security.Principal.NTAccount($principal)).Translate([Security.Principal.SecurityIdentifier]).Value }
  if ($principal -ne 'S-1-5-18' -or $definition.Principal.LogonType -ne 5 -or $definition.Principal.RunLevel -ne 1 -or $definition.Actions.Count -ne 1 -or $definition.Triggers.Count -ne 1 -or
      [IO.Path]::GetFullPath($definition.Actions.Item(1).Path) -ine ${quote(identity.executable)} -or
      $definition.Actions.Item(1).Arguments -cne ${quote(windowsHelperArguments(identity))}) {
    throw 'Refusing to stop an unverified FlyEnv Helper task'
  }
  $triggerSid = [string]$definition.Triggers.Item(1).UserId
  if ($triggerSid -notmatch '^S-1-') { $triggerSid = (New-Object Security.Principal.NTAccount($triggerSid)).Translate([Security.Principal.SecurityIdentifier]).Value }
  if ($triggerSid -cne ${quote(identity.sid)}) { throw 'Refusing to stop another user Helper task' }
  $task.Enabled = $false
  # 先禁止自动重启，再停止。任务修改成功但进程退出失败仍必须报失败，不能伪报停用。
  $task.Stop(0)
  $deadline = [DateTime]::UtcNow.AddSeconds(10)
  while ($task.State -eq 4 -and [DateTime]::UtcNow -lt $deadline) { Start-Sleep -Milliseconds 100 }
  if ($task.State -eq 4 -or $task.Enabled) { throw 'FlyEnv Helper did not stop' }
}
$remaining = @(Get-CimInstance Win32_Process -Filter "Name='flyenv-helper.exe'" | Where-Object {
  $_.ExecutablePath -ieq ${quote(identity.executable)} -and $_.CommandLine.Contains(${quote(identity.sid)}) -and $_.CommandLine.Contains(${quote(identity.instanceId)})
})
foreach ($process in $remaining) { Stop-Process -Id $process.ProcessId -Force -ErrorAction Stop }
$deadline = [DateTime]::UtcNow.AddSeconds(10)
do {
  $remaining = @(Get-CimInstance Win32_Process -Filter "Name='flyenv-helper.exe'" | Where-Object { $_.ExecutablePath -ieq ${quote(identity.executable)} })
  if ($remaining.Count -gt 0) { Start-Sleep -Milliseconds 100 }
} while ($remaining.Count -gt 0 -and [DateTime]::UtcNow -lt $deadline)
if ($remaining.Count -gt 0) { throw 'FlyEnv Helper is still running' }
$global:FlyEnvActionResult = $true
`

/** 已提升进程直接维护任务；普通进程只为此维护命令申请一次受协调的 UAC。 */
export const disableWindowsHelper = (): Promise<boolean> => {
  pending ??= (async () => {
    const identity = await getWindowsHelperIdentity()
    try {
      // 安装中断或配置丢失时，任务/进程仍可能存在。仅整个实例目录不存在
      // 才可跳过停用；不能把缺失 instance.json 当成 Helper 从未安装的证据。
      await access(identity.instanceRoot)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true
      // 原令牌无法遍历实例目录不证明不存在；由后续已授权维护脚本核对并处理。
      if (!['EACCES', 'EPERM'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error
    }
    const script = buildWindowsHelperDisableScript(identity)
    return (await isWindowsProcessElevated())
      ? await runWindowsAction<boolean>(script, false)
      : await withWindowsElevationLease(() => runWindowsAction<boolean>(script, true))
  })().finally(() => {
    pending = undefined
  })
  return pending
}
