import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import { buildWindowsHelperProcessStopScript } from './WindowsHelperProcess'
import {
  resolveWindowsPowerShellPath,
  windowsPowerShellEnv,
  windowsPowerShellPath
} from './WindowsSystemPaths'

const execFileAsync = promisify(execFile)

const WINDOWS_SID_PATTERN = /^S-1-(?:\d+-)+\d+$/i

export type WindowsHelperInstancePaths = {
  instanceId: string
  instanceRoot: string
  executable: string
  keyPath: string
  allowedRootsPath: string
  instanceConfigPath: string
  taskFolder: string
  taskName: string
  taskPath: string
  pipeName: string
  pipePath: string
}

export const windowsHelperInstanceId = (sid: string): string => {
  const canonicalSid = sid.trim().toUpperCase()
  if (!WINDOWS_SID_PATTERN.test(canonicalSid)) {
    throw new Error('Windows SID is invalid')
  }
  return crypto.createHash('sha256').update(canonicalSid, 'utf8').digest('hex').slice(0, 32)
}

export const windowsHelperInstancePaths = (
  sid: string,
  programData = process.env.ProgramData || 'C:\\ProgramData'
): WindowsHelperInstancePaths => {
  // 实例必须部署到本机的完整 ProgramData 路径；仅 isAbsolute 会接受 \\folder。
  // 禁止 UNC/设备命名空间/ADS，避免每 SID 实例被放到另一个盘符上下文或网络位置。
  if (
    !/^[a-z]:[\\/]/iu.test(programData) ||
    /[\x00-\x1f\x7f<>"|?*:]/u.test(programData.slice(2)) ||
    programData.split(/[\\/]/u).some((part) => part === '..' || /[. ]$/u.test(part))
  ) {
    throw new Error('ProgramData must be an absolute Windows path')
  }
  const instanceId = windowsHelperInstanceId(sid)
  const instanceRoot = path.win32.join(programData, 'FlyEnv', 'Helper', 'users', instanceId)
  const taskFolder = '\\FlyEnv\\Helper'
  const taskName = instanceId
  const pipeName = `FlyEnv.Helper.${instanceId}`
  return {
    instanceId,
    instanceRoot,
    executable: path.win32.join(instanceRoot, 'bin', 'flyenv-helper.exe'),
    keyPath: path.win32.join(instanceRoot, 'helper.key'),
    allowedRootsPath: path.win32.join(instanceRoot, 'allowed-roots'),
    instanceConfigPath: path.win32.join(instanceRoot, 'instance.json'),
    taskFolder,
    taskName,
    taskPath: `${taskFolder}\\${taskName}`,
    pipeName,
    pipePath: `\\\\.\\pipe\\${pipeName}`
  }
}

export type WindowsHelperIdentity = WindowsHelperInstancePaths & {
  account: string
  sid: string
  localAppData: string
}

export const getWindowsHelperIdentity = async (): Promise<WindowsHelperIdentity> => {
  const localAppData = process.env.LOCALAPPDATA ?? ''
  // Execute in the original process context, with explicit UTF-8 for Unicode accounts.
  const script =
    "[Console]::OutputEncoding = [Text.Encoding]::UTF8; $ErrorActionPreference = 'Stop'; $identity = [Security.Principal.WindowsIdentity]::GetCurrent(); @{ account = $identity.Name; sid = $identity.User.Value; programData = [Environment]::GetFolderPath([Environment+SpecialFolder]::CommonApplicationData) } | ConvertTo-Json -Compress"
  const { stdout } = await execFileAsync(
    resolveWindowsPowerShellPath(),
    [
      '-NoProfile',
      '-NonInteractive',
      '-EncodedCommand',
      Buffer.from(script, 'utf16le').toString('base64')
    ],
    { windowsHide: true, timeout: 10_000, env: windowsPowerShellEnv() }
  )
  const identity = JSON.parse(stdout.trim()) as Pick<WindowsHelperIdentity, 'account' | 'sid'> & {
    programData: string
  }
  if (!identity.account || !/^S-1-(?:\d+-)+\d+$/.test(identity.sid)) {
    throw new Error('Could not capture the FlyEnv Windows user identity')
  }
  return {
    account: identity.account,
    sid: identity.sid,
    localAppData,
    ...windowsHelperInstancePaths(identity.sid, identity.programData)
  }
}

export type WindowsHelperInstallConfig = {
  identity: WindowsHelperIdentity
  executable: string
  sourceExecutable: string
  backupExecutable: string
  dataPath: string
  helperVersion: number
}

export const buildWindowsHelperInstallScript = (
  template: string,
  config: WindowsHelperInstallConfig
): string => {
  if (!template.includes('#STOP_HELPER_PROCESSES#')) {
    throw new Error('Windows Helper installer template is missing the process shutdown stage')
  }
  return template
    .replace('#INSTALL_CONFIG#', Buffer.from(JSON.stringify(config), 'utf8').toString('base64'))
    .replace(
      '#STOP_HELPER_PROCESSES#',
      () =>
        buildWindowsHelperProcessStopScript({
          instanceId: config.identity.instanceId,
          sid: config.identity.sid,
          executablePaths: [config.executable, config.sourceExecutable, config.backupExecutable]
        })
    )
}

export const windowsHelperInstallerCommand = (
  scriptPath: string,
  tempDirectory: string
): string => {
  const quote = (value: string) => `'${value.replace(/'/g, "''")}'`
  const script = `$ErrorActionPreference = 'Stop'; $code = 1; try { Unblock-File -LiteralPath ${quote(scriptPath)}; & ${quote(scriptPath)}; $code = $LASTEXITCODE } finally { Remove-Item -LiteralPath ${quote(tempDirectory)} -Recurse -Force -ErrorAction SilentlyContinue }; exit $code`
  return `"${windowsPowerShellPath()}" -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${Buffer.from(script, 'utf16le').toString('base64')}`
}

export const windowsHelperInstalledPath = (
  identity: Pick<WindowsHelperIdentity, 'sid'> & Partial<Pick<WindowsHelperIdentity, 'executable'>>
): string => identity.executable ?? windowsHelperInstancePaths(identity.sid).executable

export const windowsHelperArguments = (identity: WindowsHelperIdentity): string =>
  `--instance-id "${identity.instanceId}" --expected-user-sid "${identity.sid}"`

// 安装指纹只用于验证已部署文件的完整性；重新构建/签名不代表协议升级。
// instance.json 由提权安装器写入并锁定 ACL，不能以新安装包的 SHA 替代此基线。
export const windowsHelperInstallationMatches = async (
  identity: WindowsHelperIdentity,
  helperVersion: number
): Promise<boolean> => {
  try {
    const [executableData, configData] = await Promise.all([
      fs.readFile(identity.executable),
      fs.readFile(identity.instanceConfigPath, 'utf8')
    ])
    // Windows PowerShell 5 的 Set-Content -Encoding UTF8 会写入 BOM。
    const config = JSON.parse(configData.replace(/^\uFEFF/, ''))
    if (
      !config ||
      config.schemaVersion !== 1 ||
      config.helperProtocol !== helperVersion ||
      config.instanceId !== identity.instanceId ||
      config.sid !== identity.sid ||
      config.pipeName !== identity.pipeName ||
      typeof config.helperSha256 !== 'string' ||
      !/^[a-f0-9]{64}$/i.test(config.helperSha256)
    )
      return false
    for (const key of ['executable', 'keyPath', 'allowedRootsPath'] as const) {
      if (
        typeof config[key] !== 'string' ||
        path.win32.normalize(config[key]).toLowerCase() !==
          path.win32.normalize(identity[key]).toLowerCase()
      )
        return false
    }
    const executableHash = crypto.createHash('sha256').update(executableData).digest()
    return crypto.timingSafeEqual(executableHash, Buffer.from(config.helperSha256, 'hex'))
  } catch {
    return false
  }
}

export type WindowsHelperTask = {
  principal: string
  logonType: number
  runLevel: number
  enabled: boolean
  executable: string
  arguments: string
  actionCount: number
  triggerSid: string
  triggerCount: number
  binaryMatches: boolean
  state?: number
  lastTaskResult?: number
}

export const windowsHelperTaskInvalidReason = (
  task: WindowsHelperTask | null,
  identity: WindowsHelperIdentity,
  executable: string
): string | undefined => {
  if (!task) return 'Scheduled task is missing or inaccessible'
  if (task.principal !== 'S-1-5-18') return 'Scheduled task principal is not SYSTEM'
  if (task.logonType !== 5 || task.runLevel !== 1)
    return 'Scheduled task logon configuration is stale'
  if (!task.enabled) return 'Scheduled task is disabled'
  if (
    task.actionCount !== 1 ||
    path.win32.normalize(task.executable).toLowerCase() !==
      path.win32.normalize(executable).toLowerCase()
  )
    return 'Scheduled task executable does not match'
  if (task.arguments !== windowsHelperArguments(identity))
    return 'Scheduled task instance ID or expected-user-sid does not match target user'
  if (task.triggerCount !== 1 || task.triggerSid !== identity.sid)
    return 'Scheduled task logon trigger does not match target user'
  if (!task.binaryMatches) return 'Installed helper integrity or protocol version does not match'
  return undefined
}

export const readWindowsHelperTask = async (
  identity: WindowsHelperIdentity,
  helperVersion: number,
  startIfStopped = false
): Promise<WindowsHelperTask | null> => {
  const binaryMatches = await windowsHelperInstallationMatches(identity, helperVersion)
  if (startIfStopped && !binaryMatches) {
    throw new Error('Refusing to start a helper with invalid integrity or protocol version')
  }
  const config = Buffer.from(
    JSON.stringify({
      taskFolder: identity.taskFolder,
      taskName: identity.taskName,
      executable: identity.executable,
      arguments: windowsHelperArguments(identity),
      sid: identity.sid,
      instanceConfigPath: identity.instanceConfigPath,
      installationRoot: path.win32.resolve(identity.instanceRoot, '../../..'),
      startIfStopped
    }),
    'utf8'
  ).toString('base64')
  const script = `
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'
$config = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${config}')) | ConvertFrom-Json
# 安装记录成为指纹基线前，确认它、程序及实例目录不能被普通用户改写。
# 与安装器一致，只允许 Administrators/SYSTEM 持有资产或拥有写权限。
$trustedSids = @('S-1-5-18', 'S-1-5-32-544')
$checkedPaths = @{}
$writeMask = [int64]([Security.AccessControl.FileSystemRights]::Write -bor [Security.AccessControl.FileSystemRights]::Delete -bor [Security.AccessControl.FileSystemRights]::DeleteSubdirectoriesAndFiles -bor [Security.AccessControl.FileSystemRights]::ChangePermissions -bor [Security.AccessControl.FileSystemRights]::TakeOwnership)
foreach ($asset in @($config.instanceConfigPath, $config.executable)) {
  $candidate = [string]$asset
  while ($candidate) {
    if ($checkedPaths.ContainsKey($candidate)) { break }
    $checkedPaths[$candidate] = $true
    $item = Get-Item -LiteralPath $candidate -Force -ErrorAction Stop
    if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Helper installation contains a reparse point' }
    if ($candidate -ieq $config.installationRoot -or $candidate.StartsWith(([string]$config.installationRoot + '\\'), [StringComparison]::OrdinalIgnoreCase)) {
      $acl = Get-Acl -LiteralPath $candidate -ErrorAction Stop
      # 程序文件按安装契约继承 bin 目录权限；目录和 instance.json 禁用继承。
      if (($candidate -ine $config.executable -and -not $acl.AreAccessRulesProtected) -or $acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -notin $trustedSids) { throw 'Helper installation ACL is not protected' }
      foreach ($rule in $acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier])) {
        if ($rule.AccessControlType -eq [Security.AccessControl.AccessControlType]::Allow -and $rule.IdentityReference.Value -notin $trustedSids -and ([int64]$rule.FileSystemRights -band $writeMask) -ne 0) { throw 'Helper installation permits untrusted writes' }
      }
    }
    $candidate = Split-Path -Parent $candidate
  }
}
$scheduler = New-Object -ComObject 'Schedule.Service'
$scheduler.Connect()
try { $task = $scheduler.GetFolder([string]$config.taskFolder).GetTask([string]$config.taskName) } catch { Write-Output 'null'; exit 0 }
$definition = $task.Definition
$principal = $definition.Principal.UserId
if ($principal -notmatch '^S-1-') { $principal = (New-Object Security.Principal.NTAccount($principal)).Translate([Security.Principal.SecurityIdentifier]).Value }
$action = $definition.Actions.Item(1)
$trigger = $definition.Triggers.Item(1)
$triggerSid = $trigger.UserId
if ($triggerSid -notmatch '^S-1-') { $triggerSid = (New-Object Security.Principal.NTAccount($triggerSid)).Translate([Security.Principal.SecurityIdentifier]).Value }
if ($config.startIfStopped) {
  if ($principal -ne 'S-1-5-18' -or $definition.Principal.LogonType -ne 5 -or $definition.Principal.RunLevel -ne 1 -or -not $task.Enabled -or $definition.Actions.Count -ne 1 -or $definition.Triggers.Count -ne 1 -or $triggerSid -ne $config.sid -or [IO.Path]::GetFullPath($action.Path) -ne [IO.Path]::GetFullPath($config.executable) -or $action.Arguments -cne $config.arguments) {
    throw 'Refusing to start an invalid helper task'
  }
  if ($task.State -ne 4 -and $task.State -ne 2) { $task.Run($null) | Out-Null }
}
@{ principal=$principal; logonType=[int]$definition.Principal.LogonType; runLevel=[int]$definition.Principal.RunLevel; enabled=[bool]$task.Enabled; actionCount=$definition.Actions.Count; executable=[string]$action.Path; arguments=[string]$action.Arguments; triggerCount=$definition.Triggers.Count; triggerSid=[string]$triggerSid; state=[int]$task.State; lastTaskResult=[int64]$task.LastTaskResult } | ConvertTo-Json -Compress
`
  const { stdout } = await execFileAsync(
    resolveWindowsPowerShellPath(),
    [
      '-NoProfile',
      '-NonInteractive',
      '-EncodedCommand',
      Buffer.from(script, 'utf16le').toString('base64')
    ],
    { windowsHide: true, timeout: 10_000, env: windowsPowerShellEnv() }
  )
  const task = JSON.parse(stdout.trim()) as Omit<WindowsHelperTask, 'binaryMatches'> | null
  if (!task) return null
  return {
    ...task,
    binaryMatches
  }
}

// Diagnostics are best-effort and bounded; they must never hide the original failure.
export const readWindowsHelperDiagnostics = async (
  identity: WindowsHelperIdentity,
  helperVersion: number
): Promise<string> => {
  const details: string[] = []
  try {
    const task = await readWindowsHelperTask(identity, helperVersion)
    details.push(
      task
        ? `Task state=${task.state}, LastTaskResult=${task.lastTaskResult}`
        : 'Task missing or inaccessible'
    )
  } catch (error) {
    details.push(`Task diagnostics unavailable: ${String(error).slice(0, 512)}`)
  }
  const logPath = path.win32.join(identity.instanceRoot, 'startup.log')
  try {
    const log = await fs.open(logPath, 'r')
    try {
      const stat = await log.stat()
      if (stat.isFile()) {
        const buffer = Buffer.alloc(Math.min(stat.size, 3072))
        const { bytesRead } = await log.read(
          buffer,
          0,
          buffer.length,
          Math.max(0, stat.size - buffer.length)
        )
        details.push(`Startup log (${logPath}):\n${buffer.subarray(0, bytesRead).toString('utf8')}`)
      }
    } finally {
      await log.close()
    }
  } catch {
    /* A process blocked before startup cannot create a log. */
  }
  return details.join('\n')
}
