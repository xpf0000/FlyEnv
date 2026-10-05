/**
 * 显式权限动作/端口工具使用的进程身份与 PowerShell 保护片段。
 * 普通服务在首次进程快照中判定归属，随后通过 ProcessKillStrict 执行；
 * 此处不再持有服务停止 ALS、首次列表或启动证明，避免出现第二套隐式停止链。
 */
export type WindowsProcessIdentity = {
  pid: number
  created: string
  source: 'startTime' | 'cim' | 'cim-descendant'
  path?: string
}

/**
 * Windows 普通权限、UAC 与 Helper 执行共用的保护策略。保护关键系统进程名及其
 * 系统目录映像路径，不以 PID 大小推断目标安全；路径不可读不会让查询变成成功，
 * 授权后的实际动作仍须重查创建时间/路径，并在真正停止前重复保护检查。
 * $target 必须为 Get-Process/Win32_Process 返回对象；调用点只能传固定变量名。
 */
export const windowsProcessSafetyGuard = (target: '$target' | '$p') => `
$protectedNames = @('system', 'registry', 'smss', 'csrss', 'wininit', 'services', 'lsass', 'lsaiso', 'svchost', 'winlogon', 'fontdrvhost', 'dwm', 'securityhealthservice', 'msmpeng')
$targetId = if ($null -ne ${target}.ProcessId) { [int]${target}.ProcessId } else { [int]${target}.Id }
$targetName = if ($null -ne ${target}.Name) { [string]${target}.Name } else { [string]${target}.ProcessName }
$targetName = [IO.Path]::GetFileNameWithoutExtension($targetName).ToLowerInvariant()
if ($targetId -le 4 -or $targetId -eq $PID -or $protectedNames -contains $targetName) { throw 'Refusing to stop a protected Windows process' }
$targetPath = if ($null -ne ${target}.ExecutablePath) { [string]${target}.ExecutablePath } else { [string]${target}.Path }
if (-not [string]::IsNullOrWhiteSpace($targetPath)) {
  # Do not block every executable in Windows: cmd/powershell/conhost can be legitimate service wrappers.
  $fullTargetPath = [IO.Path]::GetFullPath($targetPath)
  foreach ($directory in @('System32', 'SysWOW64')) {
    foreach ($name in $protectedNames) {
      # 系统目录由运行时 API 提供，不能用用户环境变量覆盖关键进程路径保护。
      $protectedPath = [IO.Path]::Combine([IO.Path]::GetDirectoryName([Environment]::SystemDirectory), $directory, $name + '.exe')
      if ($fullTargetPath.Equals($protectedPath, [StringComparison]::OrdinalIgnoreCase)) { throw 'Refusing to stop a protected Windows executable' }
    }
  }
}
`

/**
 * 授权前的只读快照和普通/UAC 停止脚本使用同一个进程查询入口。
 * Get-Process 的“PID 不存在”可幂等跳过；访问拒绝及其他查询错误不能变成空结果。
 * 固定函数只接受已经过数字白名单验证的 PID，不接受命令、路径或进程名。
 */
export const windowsStopProcessLookup = `
function Get-FlyEnvStopTarget([int]$processId) {
  try { return Get-Process -Id $processId -ErrorAction Stop }
  catch {
    if ($_.CategoryInfo.Category -eq [System.Management.Automation.ErrorCategory]::ObjectNotFound) { return $null }
    throw
  }
}
`

/**
 * Get-NetTCPConnection 只有带 CmdletizationQuery_NotFound 前缀的 ObjectNotFound
 * 才表示当前无匹配连接；LocalPort 等筛选条件会让错误 ID 带不同后缀。拒绝访问、
 * 提供程序异常及其他查询失败必须传播，不能把不可读
 * 的端口归属变成停止成功。
 */
export const windowsTcpConnectionLookup = `
function Get-FlyEnvTcpConnections([int]$port, [bool]$listeningOnly = $false) {
  try {
    if ($listeningOnly) {
      return @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction Stop)
    }
    return @(Get-NetTCPConnection -LocalPort $port -ErrorAction Stop)
  } catch {
    $errorId = [string]$_.FullyQualifiedErrorId
    if ($_.CategoryInfo.Category -eq [System.Management.Automation.ErrorCategory]::ObjectNotFound -and $errorId -like 'CmdletizationQuery_NotFound*,Get-NetTCPConnection*') {
      return @()
    }
    throw
  }
}
`

export const windowsStopListenerLookup = `${windowsTcpConnectionLookup}
function Get-FlyEnvStopListenerPids([int]$port) {
  $connections = @(Get-FlyEnvTcpConnections $port $true)
  return @($connections | Select-Object -ExpandProperty OwningProcess)
}
`

/** 真正执行停止前重查同一身份来源；包含普通权限拒绝后固定的 CIM 证据。 */
export const windowsStopIdentityLookup = `
function Get-FlyEnvStopIdentity([int]$processId, [string]$source) {
  if ($source -eq 'cim') {
    $item = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $processId) -ErrorAction Stop
    if ($null -eq $item) { return $null }
    if ([string]::IsNullOrWhiteSpace([string]$item.CreationDate) -or [string]::IsNullOrWhiteSpace([string]$item.ExecutablePath)) {
      throw ('Cannot verify process identity from CIM; PID=' + $processId)
    }
    $created = ([DateTime]$item.CreationDate).ToUniversalTime().ToString('o', [Globalization.CultureInfo]::InvariantCulture)
    return @{ created=$created; path=[string]$item.ExecutablePath }
  }
  $item = Get-FlyEnvStopTarget $processId
  if ($null -eq $item) { return $null }
  try {
    return @{ created=$item.StartTime.ToUniversalTime().ToString('o', [Globalization.CultureInfo]::InvariantCulture); path='' }
  } finally {
    $item.Dispose()
  }
}
`

/**
 * 完整精度的 UTC 启动身份值。只供固定 $target 变量使用，不插入业务输入。
 * Process.StartTime 路径保持逐字符相等；只有该读取被拒绝时才使用独立的 CIM
 * 创建时间加可执行路径证据，并在授权后继续以 CIM 查询复核同一记录。
 */
export const windowsProcessStartIdentity =
  "$target.StartTime.ToUniversalTime().ToString('o', [Globalization.CultureInfo]::InvariantCulture)"
