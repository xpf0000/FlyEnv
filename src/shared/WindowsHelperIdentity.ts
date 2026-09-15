import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'

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
  if (!path.win32.isAbsolute(programData)) {
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

export const parseWindowsWhoAmIUserCsv = (
  output: string
): Pick<WindowsHelperIdentity, 'account' | 'sid'> => {
  const record = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => /^"[^"]+","S-1-/.test(line))
  const match = record?.match(/^"([^"]+)","(S-1-[^"]+)"$/)
  if (!match) {
    throw new Error('Could not parse whoami /user CSV output')
  }
  return { account: match[1], sid: match[2] }
}

export const getWindowsHelperIdentity = async (): Promise<WindowsHelperIdentity> => {
  const localAppData = process.env.LOCALAPPDATA ?? ''
  // Execute in the original process context, with explicit UTF-8 for Unicode accounts.
  const script =
    '[Console]::OutputEncoding = [Text.Encoding]::UTF8; $identity = [Security.Principal.WindowsIdentity]::GetCurrent(); @{ account = $identity.Name; sid = $identity.User.Value } | ConvertTo-Json -Compress'
  const { stdout } = await execFileAsync(
    path.win32.join(
      process.env.SystemRoot || 'C:\\Windows',
      'System32',
      'WindowsPowerShell',
      'v1.0',
      'powershell.exe'
    ),
    [
      '-NoProfile',
      '-NonInteractive',
      '-EncodedCommand',
      Buffer.from(script, 'utf16le').toString('base64')
    ],
    { windowsHide: true, timeout: 10_000 }
  )
  const identity = JSON.parse(stdout.trim()) as Pick<WindowsHelperIdentity, 'account' | 'sid'>
  if (!identity.account || !/^S-1-(?:\d+-)+\d+$/.test(identity.sid)) {
    throw new Error('Could not capture the FlyEnv Windows user identity')
  }
  return {
    ...identity,
    localAppData,
    ...windowsHelperInstancePaths(identity.sid)
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
): string =>
  template.replace(
    '#INSTALL_CONFIG#',
    Buffer.from(JSON.stringify(config), 'utf8').toString('base64')
  )

export const windowsHelperInstallerCommand = (
  scriptPath: string,
  tempDirectory: string
): string => {
  const quote = (value: string) => `'${value.replace(/'/g, "''")}'`
  const script = `$ErrorActionPreference = 'Stop'; $code = 1; try { Unblock-File -LiteralPath ${quote(scriptPath)}; & ${quote(scriptPath)}; $code = $LASTEXITCODE } finally { Remove-Item -LiteralPath ${quote(tempDirectory)} -Recurse -Force -ErrorAction SilentlyContinue }; exit $code`
  return `"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${Buffer.from(script, 'utf16le').toString('base64')}`
}

export const windowsHelperInstalledPath = (identity: Pick<WindowsHelperIdentity, 'sid'>): string =>
  windowsHelperInstancePaths(identity.sid).executable

export const windowsHelperArguments = (identity: WindowsHelperIdentity): string =>
  `--instance-id "${identity.instanceId}" --expected-user-sid "${identity.sid}"`

export const windowsHelperBinariesMatch = async (
  executable: string,
  sourceExecutable: string
): Promise<boolean> => {
  try {
    const [executableData, sourceData] = await Promise.all([
      fs.readFile(executable),
      fs.readFile(sourceExecutable)
    ])
    const executableHash = crypto.createHash('sha256').update(executableData).digest()
    const sourceHash = crypto.createHash('sha256').update(sourceData).digest()
    return crypto.timingSafeEqual(executableHash, sourceHash)
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
  if (!task.binaryMatches) return 'Installed helper executable differs from bundled version'
  return undefined
}

export const readWindowsHelperTask = async (
  identity: WindowsHelperIdentity,
  sourceExecutable: string
): Promise<WindowsHelperTask | null> => {
  const config = Buffer.from(
    JSON.stringify({
      taskFolder: identity.taskFolder,
      taskName: identity.taskName
    }),
    'utf8'
  ).toString('base64')
  const script = `
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'
$config = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${config}')) | ConvertFrom-Json
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
@{ principal=$principal; logonType=[int]$definition.Principal.LogonType; runLevel=[int]$definition.Principal.RunLevel; enabled=[bool]$task.Enabled; actionCount=$definition.Actions.Count; executable=[string]$action.Path; arguments=[string]$action.Arguments; triggerCount=$definition.Triggers.Count; triggerSid=[string]$triggerSid } | ConvertTo-Json -Compress
`
  const { stdout } = await execFileAsync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-EncodedCommand',
      Buffer.from(script, 'utf16le').toString('base64')
    ],
    { windowsHide: true, timeout: 10_000 }
  )
  const task = JSON.parse(stdout.trim()) as Omit<WindowsHelperTask, 'binaryMatches'> | null
  if (!task) return null
  return {
    ...task,
    binaryMatches: await windowsHelperBinariesMatch(identity.executable, sourceExecutable)
  }
}
