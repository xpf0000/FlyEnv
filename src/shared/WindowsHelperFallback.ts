import { buildPerformanceProcessStopPrelude } from './PerformanceDiagnostics'
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { lstatSync, readFileSync, statSync } from 'node:fs'
import * as fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'
import { deflateRawSync } from 'node:zlib'
import {
  windowsProcessSafetyGuard,
  windowsStopProcessLookup,
  windowsTcpConnectionLookup,
  windowsStopListenerLookup,
  windowsProcessStartIdentity,
  windowsStopIdentityLookup
} from './WindowsProcessSafety'
import { buildPowerShellEncodedCommand } from './PowerShellCommand'
import { getWindowsHelperIdentity, windowsHelperInstancePaths } from './WindowsHelperIdentity'
import {
  windowsPowerShellPath,
  windowsSystemDirectory,
  resolveWindowsPowerShellPath
} from './WindowsSystemPaths'
import { AppHelperError, isWindowsHelperFallbackAllowed } from './WindowsHelperState'

/**
 * 本文件保留一份动作验证/脚本实现，以及独立入口仍需的旧传输适配。
 * 标准权限路由使用 buildWindowsPrivilegeAction，直接得到业务脚本；旧入口
 * 才使用 buildWindowsHelperFallbackPlan/runWindowsHelperFallback 编码命令、
 * 选择数据文件或调用 Sudo。二者显式传递各自的根目录上下文，不切换全局状态。
 */

export type WindowsHelperFallbackMode = 'inline' | 'data-file'

/**
 * 服务停止的完整显式 PID 集合已在 fork 按父先子后排序。一次 PowerShell 动作
 * 预检并保留原对象句柄，一次 taskkill 显式传递所有有序 PID，不使用 /T，
 * 不逐 PID 启动外部命令或等待；taskkill 参数顺序不等同于父已确认退出。
 * 根保留 EXE 约束；后代继承首次树归属，只比创建时点，不单独匹配路径/配置。
 * 使用原生 StartTime 与 CIM 的微秒精度对齐，不为每个 worker 发 CIM 查询。
 */
const buildWindowsOrderedServiceStopAction = (
  preamble: string,
  targets: string,
  expected: string
) => `${preamble}
${targets}
${expected}
${windowsStopProcessLookup}
${buildPerformanceProcessStopPrelude()}
function Confirm-FlyEnvOriginalProcess($target, $snapshot) {
  $actualTime = $target.StartTime.ToUniversalTime()
  $expectedTime = [DateTime]::Parse([string]$snapshot.created, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::RoundtripKind).ToUniversalTime()
  $format = if ($snapshot.source -eq 'startTime') { 'o' } else { "yyyy-MM-dd'T'HH:mm:ss.ffffff'Z'" }
  if ($actualTime.ToString($format, [Globalization.CultureInfo]::InvariantCulture) -cne $expectedTime.ToString($format, [Globalization.CultureInfo]::InvariantCulture)) {
    throw ('Process identity changed; PID=' + $target.Id + '; refresh and retry')
  }
  if ($snapshot.source -ne 'cim-descendant') {
    ${windowsProcessSafetyGuard('$target')}
    if ($snapshot.source -eq 'cim' -and -not [string]::Equals([IO.Path]::GetFullPath([string]$target.Path), [IO.Path]::GetFullPath([string]$snapshot.path), [StringComparison]::OrdinalIgnoreCase)) {
      throw ('Process path changed; PID=' + $target.Id + '; refresh and retry')
    }
  } elseif ($target.Id -le 4 -or $target.Id -eq $PID -or @('system','registry','smss','csrss','wininit','services','lsass','lsaiso','svchost','winlogon','fontdrvhost','dwm','securityhealthservice','msmpeng') -contains $target.ProcessName.ToLowerInvariant()) {
    throw ('Refusing to stop a protected Windows process; PID=' + $target.Id)
  }
  return $actualTime.ToString('o', [Globalization.CultureInfo]::InvariantCulture)
}
$expectedByPid = @{}
foreach ($snapshot in @($expectedProcesses)) {
  if ($expectedByPid.ContainsKey([int]$snapshot.pid)) { throw 'Duplicate process identity' }
  $expectedByPid[[int]$snapshot.pid] = $snapshot
}
$opened = [Collections.Generic.List[object]]::new()
try {
  # 全部目标先打开句柄；句柄跨越预检、父结束与后代结束，号码不能被新对象复用。
  foreach ($targetPid in $targetPids) {
    Add-FlyEnvProcessStopEvent 'preflight-request' $targetPid
    $target = Get-FlyEnvStopTarget $targetPid
    if ($null -eq $target) { Add-FlyEnvProcessStopEvent 'preflight-skipped-missing' $targetPid; continue }
    try {
      $targetHandle = $target.Handle
      if ($target.HasExited) { Add-FlyEnvProcessStopEvent 'preflight-skipped-exited' $targetPid; $target.Dispose(); continue }
      $snapshot = $expectedByPid[[int]$targetPid]
      if ($null -eq $snapshot) { throw ('Missing process identity; PID=' + $targetPid) }
      $created = Confirm-FlyEnvOriginalProcess $target $snapshot
      Add-FlyEnvProcessStopEvent 'preflight-identity' $targetPid @{ expectedCreated=$snapshot.created; actualCreated=$created; source=$snapshot.source }
      $opened.Add(@{ target=$target; snapshot=$snapshot })
    } catch {
      # 获取句柄/StartTime 也可能失败；清理不能再次抛错并覆盖原错误或遗漏 Dispose。
      $preflightError = $_
      $alreadyExited = $false
      try { $alreadyExited = $target.HasExited } catch { }
      try { $target.Dispose() } catch { }
      if ($alreadyExited) { Add-FlyEnvProcessStopEvent 'preflight-skipped-exited' $targetPid; continue }
      Add-FlyEnvProcessStopEvent 'preflight-failed' $targetPid @{ error=$preflightError.Exception.Message }
      throw $preflightError
    }
  }
  # 授权等待后再次比对原句柄身份；只收集尚未退出的原对象，不扩树、不接纳复用 PID。
  $live = @(foreach ($entry in $opened) {
    $target = $entry.target
    if ($target.HasExited) { Add-FlyEnvProcessStopEvent 'before-stop-skipped-exited' $target.Id; continue }
    [void](Confirm-FlyEnvOriginalProcess $target $entry.snapshot)
    $target
  })
  if ($live.Count -gt 0) {
    $executable = [IO.Path]::Combine([Environment]::SystemDirectory, 'taskkill.exe')
    $arguments = '/F' + (($live | ForEach-Object { ' /PID ' + [int]$_.Id }) -join '')
    Add-FlyEnvProcessStopEvent 'taskkill-request' 0 @{ executable=$executable; arguments=$arguments; orderedPids=@($live | ForEach-Object { $_.Id }) }
    $startInfo = [Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName=$executable; $startInfo.Arguments=$arguments
    $startInfo.UseShellExecute=$false; $startInfo.CreateNoWindow=$true
    $startInfo.RedirectStandardOutput=$true; $startInfo.RedirectStandardError=$true
    $command = [Diagnostics.Process]::new(); $command.StartInfo=$startInfo
    try {
      if (-not $command.Start()) { throw 'Cannot start taskkill' }
      # 同时排空两个输出管道，防止多 PID 输出堵塞；这里只等待一次命令终态。
      $stdout = $command.StandardOutput.ReadToEndAsync()
      $stderr = $command.StandardError.ReadToEndAsync()
      if (-not $command.WaitForExit(10000)) {
        try { $command.Kill() } catch { }
        throw 'taskkill command timed out; result is unknown'
      }
      Add-FlyEnvProcessStopEvent 'taskkill-result' 0 @{ exitCode=$command.ExitCode; stdout=$stdout.GetAwaiter().GetResult(); stderr=$stderr.GetAwaiter().GetResult() }
      if ($command.ExitCode -ne 0 -and @($live | Where-Object { -not $_.HasExited }).Count -gt 0) {
        throw ('taskkill failed; exitCode=' + $command.ExitCode)
      }
      # 非零但原句柄全部已退出是自然退出竞态；命令成功不额外等待每一个 PID。
      foreach ($target in $live) { Add-FlyEnvProcessStopEvent 'stop-command-completed' $target.Id }
    } finally { $command.Dispose() }
  }
} finally {
  foreach ($entry in $opened) { $entry.target.Dispose() }
}
`
export type WindowsHelperFallbackTempFileKind = 'text' | 'base64'

export type WindowsHelperFallbackPlan = {
  mode: WindowsHelperFallbackMode
  command: string
  script: string
  tempFilePath?: string
  tempFileKind?: WindowsHelperFallbackTempFileKind
  tempFileContent?: string
}

const DEFAULT_INLINE_LIMIT = 6000
const MAX_ALLOWED_ROOTS_FILE_BYTES = 64 * 1024
const MAX_DIRECT_UAC_COMMAND_LENGTH = 30_000
const MACHINE_ENV_REGISTRY_PATH =
  'Registry::HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment'
const ALLOWED_OTHER_ENV_KEYS = new Set(['ERLANG_HOME', 'GRADLE_HOME', 'JAVA_HOME'])
const ALLOWED_AUTO_START_TASKS = new Set(['FlyEnvHelperTask', 'FlyEnvStartup', 'flyenv-helper'])
const ALLOWED_AUTO_START_BASENAMES = new Set([
  'electron.exe',
  'flyenv-helper.exe',
  'flyenv.exe',
  'phpwebstudy.exe'
])
const MANAGED_PATH_FRAGMENTS = [
  '/flyenv',
  '/flyenv.app',
  '/php-web-study',
  '/phpwebstudy',
  '/phpwebstudy-data'
]
const CONTROL_CHAR_PATTERN = /[\x00\r\n]/u
const ENV_KEY_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/
const CERT_NAME_PATTERN = /^[A-Za-z0-9_.-]{1,128}\.crt$/
const AUTO_TASK_NAME_PATTERN = /^[A-Za-z0-9_. -]{1,64}$/
const ENV_PATH_PATTERN = /^%[A-Za-z0-9_]+%(?:\\[^<>"|?*\x00\r\n;]*)?$/
const WINDOWS_SID_PATTERN = /^S-\d+(?:-\d+)+$/iu

type ValidatedWriteFileArgs = {
  targetPath: string
  content: string
}

type ValidatedWriteBufferArgs = {
  targetPath: string
  base64Content: string
}

type FlyEnvPowerShellProfileTarget = {
  edition: 'windows-powershell' | 'pwsh'
  path: string
}

type ValidatedFlyEnvPowerShellIntegrationArgs = {
  scriptPath: string
  scriptBase64: string
  profiles: FlyEnvPowerShellProfileTarget[]
}

export type FlyEnvPowerShellIntegrationUacPlan = {
  powershellPath: string
  args: string[]
  childCommand: string
  childScript: string
  resultPath: string
  nonce: string
  commandLength: number
}

export type FlyEnvPowerShellIntegrationUacPlanOptions = {
  powershellPath?: string
  resultPath?: string
  nonce?: string
  targetUserSid?: string
}

const execFileAsync = promisify(execFile)

export type FlyEnvPowerShellIntegrationFallbackResult = {
  scriptState: 'updated' | 'unchanged'
  profiles: Array<{
    edition: 'windows-powershell' | 'pwsh'
    path: string
    state: 'updated' | 'unchanged'
  }>
}

type ValidatedSetSystemPathArgs = {
  paths: string[]
  otherVars: Record<string, string>
  expectedPath?: string
}

type ValidatedSetSystemEnvArgs = {
  key: string
  value: string
}

type ValidatedSetAutoStartArgs = {
  enabled: boolean
  taskName: string
  exePath: string
}

type ValidatedSslAddTrustedCertArgs = {
  cwd: string
  caName: string
}

type ConfiguredAllowedRoots = {
  roots: string[]
  filePresent: boolean
}

function helperExecutionFailed(message: string): never {
  throw new AppHelperError('helper_execution_failed', message)
}

function fallbackNotSupported(module: string, fn: string): never {
  throw new AppHelperError(
    'windows_fallback_not_supported',
    `Windows helper fallback does not support ${module}/${fn}`
  )
}

function powerShellString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

function ensureArgCount(args: unknown[], expected: number, label: string): void {
  if (args.length !== expected) {
    helperExecutionFailed(`${label} expects ${expected} arguments, got ${args.length}`)
  }
}

function ensureString(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    helperExecutionFailed(`${label} must be a string, got ${typeof value}`)
  }
  return value
}

function comparePath(value: string): string {
  return path.win32
    .normalize(value)
    .replace(/[\\/]+/g, '/')
    .replace(/\/+$/g, '')
    .toLowerCase()
}

function pathEqual(a: string, b: string): boolean {
  return comparePath(a) === comparePath(b)
}

function pathInDir(targetPath: string, dirPath: string): boolean {
  const target = comparePath(targetPath)
  const dir = comparePath(dirPath)
  return target === dir || target.startsWith(`${dir}/`)
}

function hasPathTraversal(value: string): boolean {
  return value
    .split(/[\\/]/)
    .map((part) => part.trim())
    .some((part) => part === '..')
}

function isRootPath(targetPath: string): boolean {
  const normalized = path.win32.normalize(targetPath)
  const parsed = path.win32.parse(normalized)
  const rest = normalized.slice(parsed.root.length)
  return rest === '' || rest === '.'
}

function cleanAbsPath(value: string, label: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    helperExecutionFailed(`${label} must not be empty`)
  }
  if (CONTROL_CHAR_PATTERN.test(trimmed)) {
    helperExecutionFailed(`${label} contains control characters`)
  }
  if (hasPathTraversal(trimmed)) {
    helperExecutionFailed(`${label} contains path traversal`)
  }
  // win32.isAbsolute('\\folder') 为 true，但盘符取决于当前目录；设备命名空间
  // 又会绕过通常的 Win32 规范化。只接收完整盘符路径或带 server/share 的 UNC。
  // 原始值必须与验证值一致，防止 Node 直接执行原参数而 PowerShell 使用 trim 后参数。
  if (
    value !== trimmed ||
    (!/^[a-z]:[\\/]/iu.test(trimmed) && !/^\\\\[^\\/]+[\\/][^\\/]+(?:[\\/]|$)/u.test(trimmed)) ||
    /^\\\\[?.][\\/]/u.test(trimmed) ||
    /[\x00-\x1f\x7f<>"|?*]/u.test(trimmed) ||
    trimmed.replace(/^[a-z]:/iu, '').includes(':') ||
    trimmed.split(/[\\/]/u).some((part) => part !== '.' && /[. ]$/u.test(part))
  ) {
    helperExecutionFailed(`${label} contains an ambiguous or unsupported Windows path`)
  }
  // Win32 设备名在普通目录内也有特殊含义（如 NUL.txt）；不能把它当业务文件。
  if (
    trimmed
      .split(/[\\/]/u)
      .some((part) => /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³]) *(?:\.|$)/iu.test(part))
  ) {
    helperExecutionFailed(`${label} contains a reserved Windows device name`)
  }
  const normalized = path.win32.normalize(trimmed)
  if (!path.win32.isAbsolute(normalized)) {
    helperExecutionFailed(`${label} must be an absolute path`)
  }
  if (isRootPath(normalized)) {
    helperExecutionFailed(`${label} must not be a root path`)
  }
  return normalized
}

function windowsSystemPath(): string {
  // 系统敏感路径范围不能由用户同步环境或固定 C: 回退决定。
  return windowsSystemDirectory()
}

function windowsSystemRoot(): string {
  return path.win32.dirname(windowsSystemPath())
}

function windowsHostsPathCandidates(): string[] {
  const systemRoot = windowsSystemRoot()
  return [path.win32.join(systemRoot, 'System32', 'drivers', 'etc', 'hosts')]
}

function isExplicitSystemFile(targetPath: string): boolean {
  return windowsHostsPathCandidates().some((candidate) => pathEqual(targetPath, candidate))
}

function isSensitiveSystemPath(targetPath: string): boolean {
  const systemRoot = windowsSystemRoot()
  const sensitivePaths = [
    path.win32.join(systemRoot, 'System32'),
    path.win32.join(systemRoot, 'SysWOW64')
  ]
  return sensitivePaths.some((candidate) => pathInDir(targetPath, candidate))
}

function isManagedPathByName(targetPath: string): boolean {
  const normalized = comparePath(targetPath)
  return MANAGED_PATH_FRAGMENTS.some((fragment) => normalized.includes(fragment))
}

function isManagedDirectoryByName(targetPath: string): boolean {
  return isManagedPathByName(path.win32.dirname(targetPath))
}

function isManagedPathByExecutable(targetPath: string): boolean {
  const executableDir = path.win32.dirname(process.execPath)
  let current = path.win32.normalize(executableDir)
  for (;;) {
    const base = path.win32.basename(current).toLowerCase()
    if (base.includes('flyenv') || base.includes('phpwebstudy') || base.includes('php-web-study')) {
      return pathInDir(targetPath, current)
    }
    const parent = path.win32.dirname(current)
    if (parent === current) {
      return false
    }
    current = parent
  }
}

function isWindowsProgramFilesFlyEnvPath(targetPath: string): boolean {
  const candidates = [process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter(
    Boolean
  ) as string[]
  return candidates.some((candidate) => {
    if (!pathInDir(targetPath, candidate)) {
      return false
    }
    const normalized = comparePath(targetPath)
    return (
      normalized.includes('/flyenv') ||
      normalized.includes('/phpwebstudy') ||
      normalized.includes('/php-web-study')
    )
  })
}

/**
 * 构造上下文显式沿验证链传递：现代动作使用 main 提供的 roots，旧兼容入口
 * 仅携带目标 SID 来定位 allowed-roots。没有可变全局变量、ALS 或临时切换。
 * roots=[] 仍表示已提供的空白名单，不能退回旧目录名推断。
 */
type WindowsActionScope = { roots?: string[]; targetUserSid?: string }

function allowedRootsFilePath(targetUserSid?: string): string {
  if (targetUserSid) {
    try {
      return windowsHelperInstancePaths(targetUserSid).allowedRootsPath
    } catch {
      helperExecutionFailed('FlyEnv helper target SID is invalid')
    }
  }
  const programData = process.env.ProgramData || 'C:\\ProgramData'
  return path.win32.join(programData, 'FlyEnv', 'flyenv.allowed-roots')
}

function readConfiguredAllowedRoots(scope: WindowsActionScope): ConfiguredAllowedRoots {
  // 现代动作只读本次 main 提供的根目录，不检查 Helper 安装文件；空数组也不能
  // 被解释成“没有配置”而扩大范围。只有旧兼容入口才定位目标账户的配置文件。
  if (scope.roots !== undefined) return { roots: scope.roots, filePresent: true }
  const targetPath = allowedRootsFilePath(scope.targetUserSid)
  let stats: ReturnType<typeof statSync>
  try {
    stats = statSync(targetPath)
  } catch {
    return { roots: [], filePresent: false }
  }

  try {
    if (
      lstatSync(targetPath).isSymbolicLink() ||
      !stats.isFile() ||
      stats.size > MAX_ALLOWED_ROOTS_FILE_BYTES
    ) {
      return { roots: [], filePresent: true }
    }
  } catch {
    return { roots: [], filePresent: true }
  }

  let data = ''
  try {
    data = readFileSync(targetPath, 'utf8')
  } catch {
    return { roots: [], filePresent: true }
  }

  const roots: string[] = []
  const seen = new Set<string>()
  for (const rawLine of data.split(/\r?\n/)) {
    const line = rawLine.replace(/^\ufeff/u, '').trim()
    if (!line || line.startsWith('#')) {
      continue
    }
    try {
      const clean = cleanAbsPath(line, 'configured allowed root')
      const key = comparePath(clean)
      if (!seen.has(key)) {
        seen.add(key)
        roots.push(clean)
      }
    } catch {}
  }

  return { roots, filePresent: true }
}

function isConfiguredAllowedRoot(targetPath: string, roots: string[]): boolean {
  return roots.some((root) => pathInDir(targetPath, root))
}

function validateFlyEnvDataDirectoryRecoveryRoot(value: string, scope: WindowsActionScope): string {
  const targetPath = cleanAbsPath(value, 'ensureFlyEnvDataDirectory data directory')
  const protectedRoot = path.win32.join(process.env.ProgramData || 'C:\\ProgramData', 'FlyEnv')
  if (pathInDir(targetPath, protectedRoot) || pathInDir(protectedRoot, targetPath)) {
    helperExecutionFailed('Cannot grant user write access to helper installation')
  }
  if (isSensitiveSystemPath(targetPath)) {
    helperExecutionFailed(`sensitive system path is not allowed: ${value}`)
  }
  if (pathHasSymlinkComponent(targetPath)) {
    helperExecutionFailed(`ensureFlyEnvDataDirectory data directory contains a reparse point`)
  }
  const configured = readConfiguredAllowedRoots(scope)
  if (!configured.filePresent || configured.roots.length === 0) {
    helperExecutionFailed('FlyEnv data-directory roots are unavailable')
  }
  if (!configured.roots.some((root) => pathEqual(targetPath, root))) {
    helperExecutionFailed(`unexpected FlyEnv data-directory root: ${value}`)
  }
  return targetPath
}

function pathHasSymlinkComponent(targetPath: string): boolean {
  let current = cleanAbsPath(targetPath, 'path')
  for (;;) {
    try {
      if (lstatSync(current).isSymbolicLink()) {
        return true
      }
    } catch {}
    const parent = path.win32.dirname(current)
    if (parent === current) {
      return false
    }
    current = parent
  }
}

function isBusinessPathAllowed(targetPath: string, scope: WindowsActionScope): boolean {
  const configured = readConfiguredAllowedRoots(scope)
  if (isConfiguredAllowedRoot(targetPath, configured.roots) || isExplicitSystemFile(targetPath)) {
    return true
  }
  if (!configured.filePresent) {
    return (
      isManagedPathByName(targetPath) ||
      isManagedPathByExecutable(targetPath) ||
      isWindowsProgramFilesFlyEnvPath(targetPath)
    )
  }
  return false
}

function validatePathAccess(
  targetPath: string,
  label: string,
  forWrite: boolean,
  scope: WindowsActionScope
): string {
  const clean = cleanAbsPath(targetPath, label)
  if (isExplicitSystemFile(clean)) {
    if (pathHasSymlinkComponent(clean)) {
      helperExecutionFailed(`${label} contains symlink component`)
    }
    return clean
  }
  if (isSensitiveSystemPath(clean)) {
    helperExecutionFailed(`sensitive system path is not allowed: ${targetPath}`)
  }
  if (!isBusinessPathAllowed(clean, scope)) {
    helperExecutionFailed(`path outside FlyEnv allowed scope: ${targetPath}`)
  }
  if (pathHasSymlinkComponent(clean)) {
    helperExecutionFailed(`${label} contains symlink component`)
  }
  if (forWrite && isRootPath(clean)) {
    helperExecutionFailed(`refusing root path: ${targetPath}`)
  }
  return clean
}

function validatePathForRead(targetPath: string, label: string, scope: WindowsActionScope): string {
  return validatePathAccess(targetPath, label, false, scope)
}

function validatePathForWrite(
  targetPath: string,
  label: string,
  scope: WindowsActionScope
): string {
  return validatePathAccess(targetPath, label, true, scope)
}

function validatePathForRemove(
  targetPath: string,
  label: string,
  scope: WindowsActionScope
): string {
  const clean = cleanAbsPath(targetPath, label)
  if (isExplicitSystemFile(clean)) {
    helperExecutionFailed(`refusing to remove protected system file: ${targetPath}`)
  }
  return validatePathAccess(clean, label, true, scope)
}

function validatePathLikeEnvEntry(value: string, label: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    helperExecutionFailed(`${label} must not be empty`)
  }
  // 单引号是合法路径字符；脚本统一通过 powerShellString 转义，不经过命令 shell。
  if (CONTROL_CHAR_PATTERN.test(trimmed) || /[;"]/u.test(trimmed)) {
    helperExecutionFailed(`invalid PATH entry: ${trimmed}`)
  }
  if (/\$env:/iu.test(trimmed)) {
    helperExecutionFailed(`PowerShell-style PATH entries are not allowed: ${trimmed}`)
  }
  if (trimmed.includes('%')) {
    if (!ENV_PATH_PATTERN.test(trimmed) || hasPathTraversal(trimmed)) {
      helperExecutionFailed(`${label} must be an absolute path or %ENVVAR%-style path`)
    }
    return trimmed
  }
  const clean = cleanAbsPath(trimmed, label)
  if (hasPathTraversal(clean)) {
    helperExecutionFailed(`PATH entry contains traversal: ${trimmed}`)
  }
  return clean
}

function validateSystemPathPayload(paths: unknown[]): string[] {
  return paths.map((entry, index) => {
    const value = ensureString(entry, `setSystemPath paths[${index}]`)
    if (value.includes('\0')) {
      helperExecutionFailed(`setSystemPath paths[${index}] contains NUL`)
    }
    return value
  })
}

function validateSystemEnvKey(key: string, allowWhitelisted: boolean): string {
  if (!ENV_KEY_PATTERN.test(key)) {
    helperExecutionFailed(`invalid environment variable key: ${key}`)
  }
  if (key.startsWith('FLYENV_')) {
    return key
  }
  if (allowWhitelisted && ALLOWED_OTHER_ENV_KEYS.has(key)) {
    return key
  }
  helperExecutionFailed(`environment variable key is not allowed: ${key}`)
}

function validateSystemEnvValue(key: string, value: string): string {
  if (value.length > 4096 || CONTROL_CHAR_PATTERN.test(value)) {
    helperExecutionFailed(`invalid environment variable value for ${key}`)
  }
  if (value === '') {
    return value
  }
  if (value.includes('%')) {
    return validatePathLikeEnvEntry(value, `environment variable value for ${key}`)
  }
  if (path.win32.isAbsolute(value.trim())) {
    // 这里只把路径作为白名单环境键的字符串值写入注册表，并不写入该路径。
    // JAVA_HOME 等必须能够引用 FlyEnv junction 和自定义安装目录；复用文件写入
    // 校验会误拒绝 junction/allowed-root 外的版本。保留完整路径语法检查，实际
    // 文件写入、删除及 profile 的 allowed-root/reparse 防护不作放宽。
    return cleanAbsPath(value, `environment variable value for ${key}`)
  }
  if (/[\\/]/u.test(value)) {
    helperExecutionFailed(`environment variable value must be an allowed path: ${key}`)
  }
  return value
}

function validateBase64(value: string, label: string): string {
  if (value === '') {
    return value
  }
  if (/\s/u.test(value) || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    helperExecutionFailed(`${label} must be valid base64`)
  }
  try {
    const normalized = Buffer.from(value, 'base64').toString('base64')
    if (normalized !== value) {
      helperExecutionFailed(`${label} must be valid base64`)
    }
  } catch {
    helperExecutionFailed(`${label} must be valid base64`)
  }
  return value
}

function validateFlyEnvPowerShellProfileTarget(
  value: unknown,
  index: number
): FlyEnvPowerShellProfileTarget {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    helperExecutionFailed(`installFlyEnvPowerShellIntegration profiles[${index}] must be an object`)
  }
  const profile = value as Record<string, unknown>
  const edition = ensureString(
    profile.edition,
    `installFlyEnvPowerShellIntegration profiles[${index}].edition`
  )
  if (edition !== 'windows-powershell' && edition !== 'pwsh') {
    helperExecutionFailed(`unsupported PowerShell edition: ${edition}`)
  }
  const targetPath = cleanAbsPath(
    ensureString(profile.path, `installFlyEnvPowerShellIntegration profiles[${index}].path`),
    `installFlyEnvPowerShellIntegration profiles[${index}].path`
  )
  if (pathHasSymlinkComponent(targetPath)) {
    helperExecutionFailed(`PowerShell profile contains a reparse point: ${targetPath}`)
  }
  const expectedDirectory = edition === 'windows-powershell' ? 'WindowsPowerShell' : 'PowerShell'
  const expectedFileName =
    edition === 'windows-powershell' ? 'Microsoft.PowerShell_profile.ps1' : 'Profile.ps1'
  if (
    path.win32.basename(path.win32.dirname(targetPath)).toLowerCase() !==
      expectedDirectory.toLowerCase() ||
    path.win32.basename(targetPath).toLowerCase() !== expectedFileName.toLowerCase()
  ) {
    helperExecutionFailed(`unexpected ${edition} profile path: ${targetPath}`)
  }
  return { edition, path: targetPath }
}

function validateFlyEnvPowerShellScriptPath(value: string, scope: WindowsActionScope): string {
  const scriptPath = validatePathForWrite(
    value,
    'installFlyEnvPowerShellIntegration scriptPath',
    scope
  )
  if (
    path.win32.basename(scriptPath).toLowerCase() !== 'flyenv.ps1' ||
    path.win32.basename(path.win32.dirname(scriptPath)).toLowerCase() !== 'bin'
  ) {
    helperExecutionFailed(`invalid FlyEnv runtime script path: ${scriptPath}`)
  }
  const configured = readConfiguredAllowedRoots(scope)
  if (!configured.filePresent || configured.roots.length === 0) {
    helperExecutionFailed('FlyEnv runtime script roots are unavailable')
  }
  const expectedPaths = configured.roots.map((root) => path.win32.join(root, 'bin', 'flyenv.ps1'))
  if (!expectedPaths.some((expected) => pathEqual(scriptPath, expected))) {
    helperExecutionFailed(`unexpected FlyEnv runtime script path: ${scriptPath}`)
  }
  return scriptPath
}

function validateFlyEnvPowerShellIntegrationArgs(
  args: unknown[],
  scope: WindowsActionScope
): ValidatedFlyEnvPowerShellIntegrationArgs {
  ensureArgCount(args, 1, 'installFlyEnvPowerShellIntegration')
  if (typeof args[0] !== 'object' || args[0] === null || Array.isArray(args[0])) {
    helperExecutionFailed('installFlyEnvPowerShellIntegration request must be an object')
  }
  const request = args[0] as Record<string, unknown>
  const scriptPath = validateFlyEnvPowerShellScriptPath(
    ensureString(request.scriptPath, 'installFlyEnvPowerShellIntegration scriptPath'),
    scope
  )
  const scriptBase64 = validateBase64(
    ensureString(request.scriptBase64, 'installFlyEnvPowerShellIntegration scriptBase64'),
    'installFlyEnvPowerShellIntegration scriptBase64'
  )
  if (!scriptBase64 || Buffer.from(scriptBase64, 'base64').length > 1024 * 1024) {
    helperExecutionFailed('invalid FlyEnv runtime script content')
  }
  if (!Array.isArray(request.profiles) || request.profiles.length === 0) {
    helperExecutionFailed('installFlyEnvPowerShellIntegration requires at least one profile')
  }
  const seen = new Set<string>()
  const profiles = request.profiles.map((profile, index) => {
    const target = validateFlyEnvPowerShellProfileTarget(profile, index)
    if (seen.has(target.edition)) {
      helperExecutionFailed(`duplicate PowerShell profile edition: ${target.edition}`)
    }
    seen.add(target.edition)
    return target
  })
  return { scriptPath, scriptBase64, profiles }
}

function buildTempFilePath(kind: WindowsHelperFallbackTempFileKind): string {
  const suffix = kind === 'base64' ? '.b64.txt' : '.txt'
  return path.join(os.tmpdir(), `flyenv-helper-fallback-${randomUUID()}${suffix}`)
}

function buildPowerShellPreamble(): string {
  return `$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::InputEncoding = [System.Text.Encoding]::UTF8`
}

function validateWriteFileArgs(args: unknown[], scope: WindowsActionScope): ValidatedWriteFileArgs {
  ensureArgCount(args, 2, 'writeFileByRoot')
  return {
    targetPath: validatePathForWrite(
      ensureString(args[0], 'writeFileByRoot arg[0] (targetPath)'),
      'writeFileByRoot targetPath',
      scope
    ),
    content: ensureString(args[1], 'writeFileByRoot arg[1] (content)')
  }
}

function validateWriteBufferArgs(
  args: unknown[],
  scope: WindowsActionScope
): ValidatedWriteBufferArgs {
  ensureArgCount(args, 2, 'writeBufferBase64ByRoot')
  return {
    targetPath: validatePathForWrite(
      ensureString(args[0], 'writeBufferBase64ByRoot arg[0] (targetPath)'),
      'writeBufferBase64ByRoot targetPath',
      scope
    ),
    base64Content: validateBase64(
      ensureString(args[1], 'writeBufferBase64ByRoot arg[1] (base64Content)'),
      'writeBufferBase64ByRoot base64Content'
    )
  }
}

function validateRmArgs(args: unknown[], scope: WindowsActionScope): string {
  ensureArgCount(args, 1, 'rm')
  return validatePathForRemove(
    ensureString(args[0], 'rm arg[0] (targetPath)'),
    'rm targetPath',
    scope
  )
}

function validateSetSystemPathArgs(args: unknown[]): ValidatedSetSystemPathArgs {
  if (args.length !== 2 && args.length !== 3) {
    helperExecutionFailed(`setSystemPath expects 2 or 3 arguments, got ${args.length}`)
  }
  if (!Array.isArray(args[0])) {
    helperExecutionFailed('setSystemPath arg[0] (paths) must be a string array')
  }
  const paths = validateSystemPathPayload(args[0])
  if (typeof args[1] !== 'object' || args[1] === null || Array.isArray(args[1])) {
    helperExecutionFailed('setSystemPath arg[1] (otherVars) must be a map[string]string')
  }
  const otherVars: Record<string, string> = {}
  for (const [rawKey, rawValue] of Object.entries(args[1] as Record<string, unknown>)) {
    const key = validateSystemEnvKey(rawKey, true)
    const value = validateSystemEnvValue(
      key,
      ensureString(rawValue, `setSystemPath otherVars[${rawKey}]`)
    )
    otherVars[key] = value
  }
  if (args.length === 2) {
    return { paths, otherVars }
  }
  const expectedPath = ensureString(args[2], 'setSystemPath arg[2] (expectedPath)')
  if (expectedPath.includes('\0')) {
    helperExecutionFailed('setSystemPath arg[2] (expectedPath) contains NUL')
  }
  return {
    paths,
    otherVars,
    expectedPath
  }
}

function validateSetSystemEnvArgs(args: unknown[]): ValidatedSetSystemEnvArgs {
  ensureArgCount(args, 2, 'setSystemEnv')
  const key = validateSystemEnvKey(ensureString(args[0], 'setSystemEnv arg[0] (key)'), false)
  const value = validateSystemEnvValue(key, ensureString(args[1], 'setSystemEnv arg[1] (value)'))
  return { key, value }
}

function validateSetAutoStartArgs(
  args: unknown[],
  scope: WindowsActionScope
): ValidatedSetAutoStartArgs {
  ensureArgCount(args, 3, 'setAutoStartWin')
  if (typeof args[0] !== 'boolean') {
    helperExecutionFailed(
      `setAutoStartWin arg[0] (enabled) must be a boolean, got ${typeof args[0]}`
    )
  }
  const enabled = args[0]
  const taskName = ensureString(args[1], 'setAutoStartWin arg[1] (taskName)')
  if (!AUTO_TASK_NAME_PATTERN.test(taskName) || !ALLOWED_AUTO_START_TASKS.has(taskName)) {
    helperExecutionFailed(`invalid auto-start task name: ${taskName}`)
  }
  const rawExePath = ensureString(args[2], 'setAutoStartWin arg[2] (exePath)')
  if (!enabled && !rawExePath.trim()) {
    return { enabled, taskName, exePath: '' }
  }
  const exePath = cleanAbsPath(rawExePath, 'setAutoStartWin exePath')
  if (isSensitiveSystemPath(exePath)) {
    helperExecutionFailed(`sensitive system path is not allowed: ${exePath}`)
  }
  const exeBasename = path.win32.basename(exePath).toLowerCase()
  if (!ALLOWED_AUTO_START_BASENAMES.has(exeBasename)) {
    helperExecutionFailed(`invalid auto-start executable: ${exeBasename}`)
  }
  if (!isBusinessPathAllowed(exePath, scope) && !isManagedDirectoryByName(exePath)) {
    helperExecutionFailed(`auto-start executable outside FlyEnv allowed scope: ${exePath}`)
  }
  return { enabled, taskName, exePath }
}

function validateSslAddTrustedCertArgs(
  args: unknown[],
  scope: WindowsActionScope
): ValidatedSslAddTrustedCertArgs {
  ensureArgCount(args, 2, 'sslAddTrustedCert')
  const cwd = validatePathForRead(
    ensureString(args[0], 'sslAddTrustedCert arg[0] (cwd)'),
    'sslAddTrustedCert cwd',
    scope
  )
  const caName = ensureString(args[1], 'sslAddTrustedCert arg[1] (caName)').trim()
  if (path.win32.basename(caName) !== caName || path.posix.basename(caName) !== caName) {
    helperExecutionFailed('sslAddTrustedCert caName must be a basename')
  }
  if (!CERT_NAME_PATTERN.test(caName)) {
    helperExecutionFailed(`invalid certificate name: ${caName}`)
  }
  return { cwd, caName }
}

function buildWriteFileScript(args: ValidatedWriteFileArgs, tempFilePath?: string): string {
  const contentExpression = tempFilePath
    ? `Get-Content -LiteralPath ${powerShellString(tempFilePath)} -Raw`
    : powerShellString(args.content)
  return `${buildPowerShellPreamble()}
$targetPath = ${powerShellString(args.targetPath)}
$parentPath = Split-Path -Parent $targetPath
if ($parentPath) {
  New-Item -ItemType Directory -Path $parentPath -Force | Out-Null
}
$content = ${contentExpression}
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
[System.IO.File]::WriteAllText($targetPath, $content, $utf8NoBom)`
}

function buildWriteBufferScript(args: ValidatedWriteBufferArgs, tempFilePath?: string): string {
  const base64Expression = tempFilePath
    ? `(Get-Content -LiteralPath ${powerShellString(tempFilePath)} -Raw).Trim()`
    : powerShellString(args.base64Content)
  return `${buildPowerShellPreamble()}
$targetPath = ${powerShellString(args.targetPath)}
$parentPath = Split-Path -Parent $targetPath
if ($parentPath) {
  New-Item -ItemType Directory -Path $parentPath -Force | Out-Null
}
$base64Content = ${base64Expression}
$bytes = [System.Convert]::FromBase64String($base64Content)
[System.IO.File]::WriteAllBytes($targetPath, $bytes)`
}

function buildInstallFlyEnvPowerShellIntegrationScript(
  args: ValidatedFlyEnvPowerShellIntegrationArgs,
  options: {
    resultPath?: string
    nonce?: string
    allowedRootsPath?: string
    // 新运行链直接携带已验证根目录，跨账户管理员不读取原用户/Helper 临时配置。
    runtimeRoots?: string[]
  } = {}
): string {
  // Documents 可位于 OneDrive；Cloud 占位对象带 ReparsePoint，但并不将名称
  // 重定向到其他路径。仅在 profile 路径遇到该标记时查询原生 tag，精确放行
  // CLOUD/CLOUD_1..F 且不含 NameSurrogate 的标签。junction/symlink/未知标签、
  // 查询失败仍拒绝；runtime 脚本和 Helper 安装/allowed-roots 不使用此例外。
  const cloudTagReader = `using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
public static class FlyEnvProfileCloudTag {
  [StructLayout(LayoutKind.Sequential)] private struct AttributeTag { public uint Attributes; public uint Tag; }
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  private static extern SafeFileHandle CreateFile(string path, uint access, uint share, IntPtr security, uint disposition, uint flags, IntPtr template);
  [DllImport("kernel32.dll", SetLastError=true)]
  private static extern bool GetFileInformationByHandleEx(SafeFileHandle handle, int kind, out AttributeTag info, uint size);
  private static Exception LastError() {
    int code = Marshal.GetLastWin32Error();
    // Win32Exception 的通用 HResult 不携带 ACCESS_DENIED；转为标准权限异常，
    // 让普通令牌失败仍能由统一执行器识别并进入用户选择的 UAC/Helper 回退。
    return code == 5 ? (Exception)new UnauthorizedAccessException("Cannot query PowerShell profile metadata") : new Win32Exception(code);
  }
  public static bool IsCloudPlaceholder(string path) {
    // OPEN_REPARSE_POINT: 查询当前对象本身，不能先沿 junction 跟随到另一个目标。
    using (SafeFileHandle handle = CreateFile(path, 0x80, 7, IntPtr.Zero, 3, 0x02200000, IntPtr.Zero)) {
      if (handle.IsInvalid) throw LastError();
      AttributeTag info;
      if (!GetFileInformationByHandleEx(handle, 9, out info, 8)) throw LastError();
      return (info.Tag & ~0x0000f000u) == 0x9000001au && (info.Tag & 0x20000000u) == 0;
    }
  }
}`
  const runtimeSetup = `$payloadJson = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String(${powerShellString(Buffer.from(JSON.stringify(args), 'utf8').toString('base64'))}))
$payload = $payloadJson | ConvertFrom-Json`
  const resultSetup =
    options.resultPath && options.nonce
      ? `$flyEnvResultPath = ${powerShellString(options.resultPath)}
$flyEnvResultNonce = ${powerShellString(options.nonce)}
function Write-FlyEnvIntegrationResult($Result) {
  $json = $Result | ConvertTo-Json -Compress -Depth 8
  [IO.File]::WriteAllText($flyEnvResultPath, $json, [Text.UTF8Encoding]::new($false))
}`
      : ''
  const resultStart = options.resultPath && options.nonce ? 'try {' : ''
  const resultEnd =
    options.resultPath && options.nonce
      ? `Write-FlyEnvIntegrationResult ([PSCustomObject]@{ nonce = $flyEnvResultNonce; result = $flyEnvResult })
}
catch {
  try {
    Write-FlyEnvIntegrationResult ([PSCustomObject]@{ nonce = $flyEnvResultNonce; error = $_.Exception.Message })
  }
  catch {}
  exit 1
}`
      : '$flyEnvResult | ConvertTo-Json -Compress'
  return `${buildPowerShellPreamble()}
${runtimeSetup}
${resultSetup}
${resultStart}
function Normalize-FlyEnvShellPath([string]$Value, [string]$Label) {
  if ([string]::IsNullOrWhiteSpace($Value) -or $Value -match "[\x00\r\n]") {
    throw "$Label is invalid"
  }
  if ($Value -match '(^|[\\\\/])\\.\\.([\\\\/]|$)') {
    throw "$Label contains path traversal"
  }
  return [IO.Path]::GetFullPath($Value)
}
function Test-FlyEnvShellPathEqual([string]$Left, [string]$Right) {
  return [string]::Equals($Left, $Right, [StringComparison]::OrdinalIgnoreCase)
}
function Assert-FlyEnvShellNoReparsePoint([string]$Path, [bool]$AllowCloudProfile = $false) {
  $current = [IO.Path]::GetFullPath($Path)
  while ($true) {
    if (Test-Path -LiteralPath $current) {
      $item = Get-Item -LiteralPath $current -Force
      if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        # Cloud 例外只允许 profile 调用显式启用，不能一律放行 ReparsePoint。
        if (-not $AllowCloudProfile) { throw "FlyEnv shell path contains a reparse point: $Path" }
        if (-not ('FlyEnvProfileCloudTag' -as [type])) {
          Add-Type -TypeDefinition ${powerShellString(cloudTagReader)} -ErrorAction Stop
        }
        if (-not [FlyEnvProfileCloudTag]::IsCloudPlaceholder($current)) {
          throw "FlyEnv shell path contains a reparse point: $Path"
        }
      }
    }
    $parent = Split-Path -Parent $current
    if ([string]::IsNullOrEmpty($parent) -or (Test-FlyEnvShellPathEqual $parent $current)) {
      break
    }
    $current = $parent
  }
}
function Get-FlyEnvShellOwnerSid([string]$Owner, [string]$Path) {
  try {
    return ([System.Security.Principal.NTAccount]::new($Owner)).Translate([System.Security.Principal.SecurityIdentifier]).Value
  }
  catch {
    throw "failed to resolve owner SID for $Path"
  }
}
function Assert-FlyEnvAllowedRootsObjectSecurity([string]$Path) {
  try {
    $acl = Get-Acl -LiteralPath $Path -ErrorAction Stop
    $ownerSid = Get-FlyEnvShellOwnerSid ([string]$acl.Owner) $Path
  }
  catch {
    throw "failed to inspect allowed roots ACL: $Path"
  }
  if ($ownerSid -ne 'S-1-5-18' -and $ownerSid -ne 'S-1-5-32-544') {
    throw "allowed roots owner must be Administrators or SYSTEM: $Path"
  }
  try {
    $rules = @($acl.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier]))
  }
  catch {
    throw "failed to read allowed roots access rules: $Path"
  }
  [uint32]$writeMask = 0x500D0116
  foreach ($rule in $rules) {
    if ($null -eq $rule.IdentityReference) {
      throw "allowed roots ACL has an invalid identity: $Path"
    }
    if ($rule.AccessControlType -ne [System.Security.AccessControl.AccessControlType]::Allow) {
      continue
    }
    $sid = [string]$rule.IdentityReference.Value
    if ([string]::IsNullOrWhiteSpace($sid)) {
      throw "allowed roots ACL has an invalid SID: $Path"
    }
    [uint32]$rights = [uint32]([int64]$rule.FileSystemRights)
    if (($rights -band $writeMask) -ne 0 -and $sid -ne 'S-1-5-18' -and $sid -ne 'S-1-5-32-544') {
      throw "untrusted SID has write access to allowed roots: $sid"
    }
  }
}
function Assert-FlyEnvAllowedRootsSecurity([string]$AllowedRootsFile) {
  $parent = Split-Path -Parent $AllowedRootsFile
  if ([string]::IsNullOrWhiteSpace($parent)) {
    throw 'FlyEnv runtime script roots parent is unavailable'
  }
  Assert-FlyEnvShellNoReparsePoint $parent
  Assert-FlyEnvShellNoReparsePoint $AllowedRootsFile
  Assert-FlyEnvAllowedRootsObjectSecurity $parent
  Assert-FlyEnvAllowedRootsObjectSecurity $AllowedRootsFile
}
function Assert-FlyEnvPowerShellIntegrationPayload($Request) {
  $scriptPath = Normalize-FlyEnvShellPath ([string]$Request.scriptPath) 'runtime script path'
  Assert-FlyEnvShellNoReparsePoint $scriptPath
  ${
    options.runtimeRoots
      ? `$allowedRootValues = @(${options.runtimeRoots.map(powerShellString).join(', ')})`
      : `$allowedRootsFile = Normalize-FlyEnvShellPath ${powerShellString(options.allowedRootsPath ?? allowedRootsFilePath())} 'allowed roots path'
  if (-not (Test-Path -LiteralPath $allowedRootsFile -PathType Leaf)) {
    throw 'FlyEnv runtime script roots are unavailable'
  }
  if ([IO.FileInfo]::new($allowedRootsFile).Length -gt 65536) {
    throw 'FlyEnv runtime script roots are too large'
  }
  Assert-FlyEnvAllowedRootsSecurity $allowedRootsFile
  $allowedRootValues = @(Get-Content -LiteralPath $allowedRootsFile -Encoding UTF8)`
  }
  $allowed = $false
  foreach ($rawRoot in $allowedRootValues) {
    $root = [string]$rawRoot
    if ([string]::IsNullOrWhiteSpace($root) -or $root.TrimStart().StartsWith('#')) {
      continue
    }
    $expectedScript = Join-Path (Normalize-FlyEnvShellPath $root 'allowed FlyEnv root') 'bin\\flyenv.ps1'
    if (Test-FlyEnvShellPathEqual $scriptPath $expectedScript) {
      $allowed = $true
      break
    }
  }
  if (-not $allowed) {
    throw "unexpected FlyEnv runtime script path: $scriptPath"
  }
  try {
    [byte[]]$scriptBytes = [Convert]::FromBase64String([string]$Request.scriptBase64)
  }
  catch {
    throw 'invalid FlyEnv runtime script content'
  }
  if ($scriptBytes.Length -eq 0 -or $scriptBytes.Length -gt 1048576) {
    throw 'invalid FlyEnv runtime script content'
  }
  $seen = @{}
  $profiles = @()
  foreach ($profile in @($Request.profiles)) {
    $edition = [string]$profile.edition
    if ($edition -ne 'windows-powershell' -and $edition -ne 'pwsh') {
      throw "unsupported PowerShell edition: $edition"
    }
    if ($seen.ContainsKey($edition)) {
      throw "duplicate PowerShell profile edition: $edition"
    }
    if ($edition -eq 'windows-powershell') {
      $expectedProfileDirectory = 'WindowsPowerShell'
      $expectedProfileFileName = 'Microsoft.PowerShell_profile.ps1'
    }
    else {
      $expectedProfileDirectory = 'PowerShell'
      $expectedProfileFileName = 'Profile.ps1'
    }
    $profilePath = Normalize-FlyEnvShellPath ([string]$profile.path) "$edition profile path"
    if (
      -not [string]::Equals([IO.Path]::GetFileName($profilePath), $expectedProfileFileName, [StringComparison]::OrdinalIgnoreCase) -or
      -not [string]::Equals([IO.Path]::GetFileName([IO.Path]::GetDirectoryName($profilePath)), $expectedProfileDirectory, [StringComparison]::OrdinalIgnoreCase)
    ) {
      throw "unexpected $edition profile path: $profilePath"
    }
    # Documents 来自原用户已知目录，跨账户 UAC 仍写该 profile；允许标准 Cloud 标签。
    Assert-FlyEnvShellNoReparsePoint $profilePath $true
    # The app supplies profiles from Electron app.getPath('documents'). That
    # known-folder path is authoritative; redirected Documents ancestors are
    # not required to be owned by the target SID.
    $seen[$edition] = $true
    $profiles += [PSCustomObject]@{ edition = $edition; path = $profilePath }
  }
  if ($profiles.Count -eq 0) {
    throw 'FlyEnv PowerShell integration requires at least one profile'
  }
  return [PSCustomObject]@{ scriptPath = $scriptPath; scriptBase64 = [string]$Request.scriptBase64; profiles = $profiles }
}
$payload = Assert-FlyEnvPowerShellIntegrationPayload $payload
function Get-FlyEnvProfileDocument([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) {
    return [PSCustomObject]@{ Text = ''; Encoding = 'utf8' }
  }
  [byte[]]$bytes = [IO.File]::ReadAllBytes($Path)
  if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xef -and $bytes[1] -eq 0xbb -and $bytes[2] -eq 0xbf) {
    return [PSCustomObject]@{ Text = [Text.Encoding]::UTF8.GetString($bytes, 3, $bytes.Length - 3); Encoding = 'utf8bom' }
  }
  if ($bytes.Length -ge 2 -and $bytes[0] -eq 0xff -and $bytes[1] -eq 0xfe) {
    return [PSCustomObject]@{ Text = [Text.Encoding]::Unicode.GetString($bytes, 2, $bytes.Length - 2); Encoding = 'utf16le' }
  }
  if ($bytes.Length -ge 2 -and $bytes[0] -eq 0xfe -and $bytes[1] -eq 0xff) {
    return [PSCustomObject]@{ Text = [Text.Encoding]::BigEndianUnicode.GetString($bytes, 2, $bytes.Length - 2); Encoding = 'utf16be' }
  }
  return [PSCustomObject]@{ Text = [Text.Encoding]::UTF8.GetString($bytes); Encoding = 'utf8' }
}
function ConvertTo-FlyEnvProfileBytes([string]$Text, [string]$EncodingName) {
  switch ($EncodingName) {
    'utf8bom' {
      [byte[]]$body = [Text.Encoding]::UTF8.GetBytes($Text)
      [byte[]]$result = New-Object byte[] (3 + $body.Length)
      $result[0] = 0xef; $result[1] = 0xbb; $result[2] = 0xbf
      [Array]::Copy($body, 0, $result, 3, $body.Length)
      return ,$result
    }
    'utf16le' {
      [byte[]]$body = [Text.Encoding]::Unicode.GetBytes($Text)
      [byte[]]$result = New-Object byte[] (2 + $body.Length)
      $result[0] = 0xff; $result[1] = 0xfe
      [Array]::Copy($body, 0, $result, 2, $body.Length)
      return ,$result
    }
    'utf16be' {
      [byte[]]$body = [Text.Encoding]::BigEndianUnicode.GetBytes($Text)
      [byte[]]$result = New-Object byte[] (2 + $body.Length)
      $result[0] = 0xfe; $result[1] = 0xff
      [Array]::Copy($body, 0, $result, 2, $body.Length)
      return ,$result
    }
    default { return ,[Text.Encoding]::UTF8.GetBytes($Text) }
  }
}
function Write-FlyEnvAtomically([string]$Path, [byte[]]$Bytes) {
  $directory = Split-Path -Parent $Path
  [IO.Directory]::CreateDirectory($directory) | Out-Null
  $temporary = Join-Path $directory ('.flyenv-shell-' + [Guid]::NewGuid().ToString('N') + '.tmp')
  # .NET File.WriteAllBytes cannot create files in some redirected OneDrive
  # profile folders even when the PowerShell provider can write them. Use the
  # provider for the byte-preserving write, then keep the existing atomic move.
  Set-Content -LiteralPath $temporary -Value $Bytes -Encoding Byte -Force
  try {
    if (Test-Path -LiteralPath $Path) {
      try {
        [IO.File]::Replace($temporary, $Path, $null, $true)
      }
      catch {
        Move-Item -LiteralPath $temporary -Destination $Path -Force -ErrorAction Stop
      }
    }
    else {
      Move-Item -LiteralPath $temporary -Destination $Path -ErrorAction Stop
    }
  }
  finally {
    if (Test-Path -LiteralPath $temporary) {
      Remove-Item -LiteralPath $temporary -Force -ErrorAction SilentlyContinue
    }
  }
}
$scriptPath = [string]$payload.scriptPath
[byte[]]$scriptBytes = [Convert]::FromBase64String([string]$payload.scriptBase64)
$existingScript = if (Test-Path -LiteralPath $scriptPath) { [IO.File]::ReadAllBytes($scriptPath) } else { $null }
$scriptState = if ($null -ne $existingScript -and [Linq.Enumerable]::SequenceEqual([byte[]]$existingScript, [byte[]]$scriptBytes)) { 'unchanged' } else { 'updated' }
if ($scriptState -eq 'updated') {
  Write-FlyEnvAtomically $scriptPath $scriptBytes
}
$profileResults = @()
foreach ($profile in @($payload.profiles)) {
  $profilePath = [string]$profile.path
  $document = Get-FlyEnvProfileDocument $profilePath
  $source = [regex]::Replace(
    $document.Text,
    '(?im)^[\\t ]*# FlyEnv Auto-Load\\r?\\n[\\t ]*\\.[\\t ]+["''][^"''\\r\\n]*[\\\\/]bin[\\\\/]flyenv\\.ps1["''][\\t ]*(?:\\r?\\n)?',
    ''
  )
  $beginCount = [regex]::Matches($source, [regex]::Escape('# >>> FlyEnv shell integration >>>')).Count
  $endCount = [regex]::Matches($source, [regex]::Escape('# <<< FlyEnv shell integration <<<')).Count
  if ($beginCount -ne $endCount -or $beginCount -gt 1) {
    throw "ambiguous FlyEnv PowerShell profile marker blocks: $profilePath"
  }
  $newline = if ($source.Contains("\`r\`n")) { "\`r\`n" } else { "\`n" }
  $profileLine = [string]::Concat(
    '$flyenvScript = ',
    [char]39,
    $scriptPath.Replace("'", "''"),
    [char]39
  )
  $block = @(
    '# >>> FlyEnv shell integration >>>',
    $profileLine,
    'if (Test-Path -LiteralPath $flyenvScript) {',
    '  . $flyenvScript',
    '}',
    '# <<< FlyEnv shell integration <<<'
  ) -join $newline
  $start = $source.IndexOf('# >>> FlyEnv shell integration >>>')
  $end = $source.IndexOf('# <<< FlyEnv shell integration <<<')
  if (($start -lt 0) -xor ($end -lt 0) -or ($end -ge 0 -and $end -lt $start)) {
    throw "incomplete FlyEnv PowerShell profile marker block: $profilePath"
  }
  if ($start -ge 0) {
    $next = $source.Substring(0, $start) + $block + $source.Substring($end + '# <<< FlyEnv shell integration <<<'.Length)
  }
  elseif ([string]::IsNullOrWhiteSpace($source)) {
    $next = $block + $newline
  }
  else {
    $next = $source + $newline + $newline + $block + $newline
  }
  $state = if ($next -ceq $document.Text) { 'unchanged' } else { 'updated' }
  if ($state -eq 'updated') {
    [byte[]]$profileBytes = ConvertTo-FlyEnvProfileBytes $next ([string]$document.Encoding)
    Write-FlyEnvAtomically $profilePath $profileBytes
  }
  $profileResults += [PSCustomObject]@{ edition = [string]$profile.edition; path = $profilePath; state = $state }
}
$flyEnvResult = [PSCustomObject]@{ scriptState = $scriptState; profiles = $profileResults }
${resultEnd}`
}

/** 删除失败必须停止脚本并形成失败结果；SilentlyContinue 会把未删除误判成功。 */
function buildRmScript(targetPath: string): string {
  return `${buildPowerShellPreamble()}
$targetPath = ${powerShellString(targetPath)}
if (Test-Path -LiteralPath $targetPath) {
  Remove-Item -LiteralPath $targetPath -Recurse -Force -ErrorAction Stop
}`
}

/**
 * 所有授权方式共用相同的原值校验、注册表写入和配套变量处理，不注入临时阶段日志。
 * 诊断由外层执行器拥有；脚本自身仍传播真实冲突/写入异常，不能因删日志吞掉失败。
 */
function buildSetSystemPathScript(args: ValidatedSetSystemPathArgs, tempFilePath?: string): string {
  const runtimeSetup = tempFilePath
    ? `$payload = Get-Content -LiteralPath ${powerShellString(tempFilePath)} -Raw -Encoding UTF8 | ConvertFrom-Json
$paths = @($payload.paths)
$otherVars = @{}
if ($payload.otherVars) {
  foreach ($property in $payload.otherVars.PSObject.Properties) {
    $otherVars[[string]$property.Name] = [string]$property.Value
  }
}
$expectedPath = if ($null -eq $payload.expectedPath) { $null } else { [string]$payload.expectedPath }`
    : (() => {
        const pathsArray = args.paths.map((entry) => powerShellString(entry)).join(', ')
        const otherVarsBody = Object.entries(args.otherVars)
          .map(([key, value]) => `${powerShellString(key)} = ${powerShellString(value)}`)
          .join('; ')
        return `$paths = @(${pathsArray})
$otherVars = ${otherVarsBody ? `@{ ${otherVarsBody} }` : '@{}'}
$expectedPath = ${args.expectedPath === undefined ? '$null' : powerShellString(args.expectedPath)}`
      })()
  return `${buildPowerShellPreamble()}
${runtimeSetup}
$pathValue = [string]::Join(';', [string[]]$paths)
if ($null -ne $expectedPath) {
  $readRegistryKey = [Microsoft.Win32.Registry]::LocalMachine.OpenSubKey('SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment', $false)
  if ($null -eq $readRegistryKey) {
    throw 'failed to read system PATH'
  }
  try {
    $currentPath = $readRegistryKey.GetValue('Path', $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
  }
  finally {
    $readRegistryKey.Dispose()
  }
  if ($null -eq $currentPath -or [string]$currentPath -cne $expectedPath) {
    throw 'system_path_changed'
  }
}
$writeRegistryKey = [Microsoft.Win32.Registry]::LocalMachine.OpenSubKey('SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment', $true)
if ($null -eq $writeRegistryKey) {
  throw 'failed to write system PATH'
}
try {
  $writeRegistryKey.SetValue('Path', $pathValue, [Microsoft.Win32.RegistryValueKind]::ExpandString)
}
finally {
  $writeRegistryKey.Dispose()
}
foreach ($entry in $otherVars.GetEnumerator()) {
  $name = [string]$entry.Key
  $value = [string]$entry.Value
  if ($value.Contains('%')) {
    New-ItemProperty -LiteralPath ${powerShellString(MACHINE_ENV_REGISTRY_PATH)} -Name $name -Value $value -PropertyType ExpandString -Force | Out-Null
  }
  else {
    New-ItemProperty -LiteralPath ${powerShellString(MACHINE_ENV_REGISTRY_PATH)} -Name $name -Value $value -PropertyType String -Force | Out-Null
    Set-ItemProperty -LiteralPath ${powerShellString(MACHINE_ENV_REGISTRY_PATH)} -Name $name -Value $value
  }
}
New-ItemProperty -LiteralPath ${powerShellString(MACHINE_ENV_REGISTRY_PATH)} -Name 'FLYENV_ENV_FLUSH' -Value '0' -PropertyType String -Force | Out-Null
Set-ItemProperty -LiteralPath ${powerShellString(MACHINE_ENV_REGISTRY_PATH)} -Name 'FLYENV_ENV_FLUSH' -Value '0'`
}

function buildSetSystemEnvScript(args: ValidatedSetSystemEnvArgs, tempFilePath?: string): string {
  const runtimeSetup = tempFilePath
    ? `$payload = Get-Content -LiteralPath ${powerShellString(tempFilePath)} -Raw | ConvertFrom-Json
$key = [string]$payload.key
$value = [string]$payload.value`
    : `$key = ${powerShellString(args.key)}
$value = ${powerShellString(args.value)}`
  const writeValue =
    tempFilePath || args.value.includes('%')
      ? `if ($value.Contains('%')) {
  New-ItemProperty -LiteralPath ${powerShellString(MACHINE_ENV_REGISTRY_PATH)} -Name $key -Value $value -PropertyType ExpandString -Force | Out-Null
}
else {
  New-ItemProperty -LiteralPath ${powerShellString(MACHINE_ENV_REGISTRY_PATH)} -Name $key -Value $value -PropertyType String -Force | Out-Null
  Set-ItemProperty -LiteralPath ${powerShellString(MACHINE_ENV_REGISTRY_PATH)} -Name $key -Value $value
}`
      : `New-ItemProperty -LiteralPath ${powerShellString(MACHINE_ENV_REGISTRY_PATH)} -Name $key -Value $value -PropertyType String -Force | Out-Null
Set-ItemProperty -LiteralPath ${powerShellString(MACHINE_ENV_REGISTRY_PATH)} -Name $key -Value $value`
  return `${buildPowerShellPreamble()}
${runtimeSetup}
${writeValue}`
}

function buildResolveWindowsSystemExeScript(variableName: string, exeName: string): string {
  const exeFileName = exeName.toLowerCase().endsWith('.exe') ? exeName : `${exeName}.exe`
  // 在实际执行账户内通过系统 API 取 System32；不信 PATH/SystemRoot 用户覆盖值，
  // 不回退到裸命令。缺失时在执行任何业务修改之前明确报错。
  return `$${variableName} = [IO.Path]::Combine([Environment]::SystemDirectory, '${exeFileName}')
if (-not (Test-Path -LiteralPath $${variableName} -PathType Leaf)) { throw 'Windows system executable is unavailable: ${exeFileName}' }`
}

function buildSetAutoStartScript(
  args: ValidatedSetAutoStartArgs,
  tempFilePath?: string,
  targetUserSid?: string
): string {
  if (
    args.taskName !== 'FlyEnvStartup' ||
    !targetUserSid ||
    !WINDOWS_SID_PATTERN.test(targetUserSid)
  ) {
    helperExecutionFailed('Helper tasks are installer-owned; app startup requires target SID')
  }
  const runtimeSetup = tempFilePath
    ? `$payload = Get-Content -LiteralPath ${powerShellString(tempFilePath)} -Raw | ConvertFrom-Json
$enabled = [bool]$payload.enabled
$taskName = [string]$payload.taskName
$exePath = [string]$payload.exePath`
    : `$enabled = ${args.enabled ? '$true' : '$false'}
$taskName = ${powerShellString(args.taskName)}
$exePath = ${powerShellString(args.exePath)}`
  return `${buildPowerShellPreamble()}
${runtimeSetup}
${buildResolveWindowsSystemExeScript('schtasksExe', 'schtasks')}
if ($enabled) {
  $targetSid = ${powerShellString(targetUserSid)}
  $scheduler = New-Object -ComObject 'Schedule.Service'
  $scheduler.Connect()
  $definition = $scheduler.NewTask(0)
  $definition.Settings.ExecutionTimeLimit = 'PT0S'
  $definition.Settings.DisallowStartIfOnBatteries = $false
  $definition.Settings.StopIfGoingOnBatteries = $false
  $trigger = $definition.Triggers.Create(9)
  $trigger.UserId = $targetSid
  $action = $definition.Actions.Create(0)
  $action.Path = $exePath
  $definition.Principal.UserId = $targetSid
  $definition.Principal.LogonType = 3
  $definition.Principal.RunLevel = 0
  $scheduler.GetFolder('\\').RegisterTaskDefinition($taskName, $definition, 6, $targetSid, $null, 3) | Out-Null
}
else {
  & $schtasksExe /delete /tn $taskName /f | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "$schtasksExe /delete failed with exit code $LASTEXITCODE"
  }
}`
}

function buildSslAddTrustedCertScript(args: ValidatedSslAddTrustedCertArgs): string {
  return `${buildPowerShellPreamble()}
${buildResolveWindowsSystemExeScript('certutilExe', 'certutil')}
# 证书也使用完整路径，避免改变工作目录后从业务目录/PATH 启动同名 certutil。
$caFile = ${powerShellString(path.win32.join(args.cwd, args.caName))}
& $certutilExe -addstore root $caFile | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "certutil -addstore failed with exit code $LASTEXITCODE"
}`
}

function buildFlyEnvDataDirectoryRecoveryScript(dataDirectory: string, userSid: string): string {
  const dataDirectoryBase64 = Buffer.from(dataDirectory, 'utf8').toString('base64')
  const userSidBase64 = Buffer.from(userSid, 'utf8').toString('base64')
  return `${buildPowerShellPreamble()}
$dataPath = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String(${powerShellString(dataDirectoryBase64)}))
$userSid = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String(${powerShellString(userSidBase64)}))
if ([string]::IsNullOrWhiteSpace($dataPath) -or [string]::IsNullOrWhiteSpace($userSid)) {
  throw 'FlyEnv data-directory recovery arguments are invalid'
}
if (Test-Path -LiteralPath $dataPath) {
  $item = Get-Item -LiteralPath $dataPath -Force -ErrorAction Stop
  if (-not $item.PSIsContainer) {
    throw 'FlyEnv data-directory recovery target is not a directory'
  }
  if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw 'FlyEnv data-directory recovery target is a reparse point'
  }
}
else {
  [System.IO.Directory]::CreateDirectory($dataPath) | Out-Null
}
$item = Get-Item -LiteralPath $dataPath -Force -ErrorAction Stop
if (-not $item.PSIsContainer -or ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
  throw 'FlyEnv data-directory recovery target is invalid after creation'
}
$acl = Get-Acl -LiteralPath $dataPath -ErrorAction Stop
$userIdentity = New-Object System.Security.Principal.SecurityIdentifier($userSid)
$rule = New-Object System.Security.AccessControl.FileSystemAccessRule($userIdentity, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
$acl.SetAccessRule($rule)
Set-Acl -LiteralPath $dataPath -AclObject $acl -ErrorAction Stop`
}

function createPlan(
  script: string,
  tempFileKind?: WindowsHelperFallbackTempFileKind,
  tempFileContent?: string,
  tempFilePath?: string
): WindowsHelperFallbackPlan {
  return {
    mode: tempFilePath ? 'data-file' : 'inline',
    // 兼容计划也固定系统路径；新业务链只使用 script，并经一次性管道传输。
    command: buildPowerShellEncodedCommand(script, windowsPowerShellPath()),
    script,
    tempFileKind,
    tempFileContent,
    tempFilePath
  }
}

export function buildFlyEnvDataDirectoryRecoveryUacPlan(
  dataDirectory: string,
  userSid: string
): WindowsHelperFallbackPlan {
  if (!WINDOWS_SID_PATTERN.test(userSid)) {
    helperExecutionFailed('FlyEnv data-directory recovery user SID is invalid')
  }
  const scope: WindowsActionScope = { targetUserSid: userSid }
  const validatedDirectory = validateFlyEnvDataDirectoryRecoveryRoot(dataDirectory, scope)
  return createPlan(buildFlyEnvDataDirectoryRecoveryScript(validatedDirectory, userSid))
}

/** 业务脚本与旧传输适配分离；数据文件内容只在旧入口明确选中该运输时求值。 */
type WindowsActionPayload = {
  script: string
  dataFile?: {
    kind: WindowsHelperFallbackTempFileKind
    content: () => string
    buildScript: (tempFilePath?: string) => string
  }
}

/**
 * 同一验证结果生成业务脚本，并提供旧入口可选的数据文件适配。现代 UAC 只读
 * script，不编码 shell 命令、不生成临时文件名，也不序列化未使用的数据文件内容。
 */
function buildWindowsDataAction(
  buildScript: (tempFilePath?: string) => string,
  kind: WindowsHelperFallbackTempFileKind,
  content: () => string
): WindowsActionPayload {
  return { script: buildScript(), dataFile: { kind, content, buildScript } }
}

function buildCompressedPowerShellCommand(script: string): string {
  const compressed = deflateRawSync(Buffer.from(script, 'utf16le')).toString('base64')
  return `$compressed = [Convert]::FromBase64String(${powerShellString(compressed)})
$compressedStream = [IO.MemoryStream]::new([byte[]]$compressed, $false)
try {
  $inflater = [IO.Compression.DeflateStream]::new($compressedStream, [IO.Compression.CompressionMode]::Decompress)
  try {
    $output = [IO.MemoryStream]::new()
    try {
      $inflater.CopyTo($output)
      $decodedScript = [Text.Encoding]::Unicode.GetString($output.ToArray())
    }
    finally {
      $output.Dispose()
    }
  }
  finally {
    $inflater.Dispose()
  }
}
finally {
  $compressedStream.Dispose()
}
& ([ScriptBlock]::Create($decodedScript))`
}

export function buildFlyEnvPowerShellIntegrationUacPlan(
  args: unknown[],
  options: FlyEnvPowerShellIntegrationUacPlanOptions = {}
): FlyEnvPowerShellIntegrationUacPlan {
  // 旧计划入口沿用 SID 校验，但无需额外 with-roots 包装或共享状态切换。
  if (options.targetUserSid) allowedRootsFilePath(options.targetUserSid)
  const scope: WindowsActionScope = { targetUserSid: options.targetUserSid }
  const validated = validateFlyEnvPowerShellIntegrationArgs(args, scope)
  // 纯计划允许注入完整路径；真实执行入口只注入经过存在检查的系统程序。
  const powershellPath = cleanAbsPath(
    options.powershellPath ?? windowsPowerShellPath(),
    'PowerShell executable'
  )
  const resultPath = cleanAbsPath(
    options.resultPath ?? path.join(os.tmpdir(), `flyenv-shell-uac-${randomUUID()}.json`),
    'UAC result path'
  )
  const nonce = options.nonce ?? randomUUID()
  if (!nonce || nonce.length > 128 || CONTROL_CHAR_PATTERN.test(nonce)) {
    helperExecutionFailed('UAC result nonce is invalid')
  }

  const childScript = buildInstallFlyEnvPowerShellIntegrationScript(validated, {
    resultPath,
    nonce,
    allowedRootsPath: allowedRootsFilePath(options.targetUserSid)
  })
  const childCommand = buildCompressedPowerShellCommand(childScript)
  const launcherScript = `${buildPowerShellPreamble()}
try {
  $process = Start-Process -FilePath ${powerShellString(powershellPath)} -ArgumentList @(
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-NonInteractive',
    '-Command',
    ${powerShellString(childCommand)}
  ) -Verb RunAs -WindowStyle Hidden -Wait -PassThru
  if ($null -eq $process) {
    throw 'elevated PowerShell did not start'
  }
}
catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
}`
  const launcherArgs = [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-NonInteractive',
    '-Command',
    launcherScript
  ]
  const commandLength =
    powershellPath.length + launcherArgs.reduce((total, arg) => total + arg.length + 3, 0)
  if (commandLength >= MAX_DIRECT_UAC_COMMAND_LENGTH) {
    helperExecutionFailed('FlyEnv PowerShell integration is too large for direct UAC invocation')
  }
  return {
    powershellPath,
    args: launcherArgs,
    childCommand,
    childScript,
    resultPath,
    nonce,
    commandLength
  }
}

function buildWindowsActionPayload(
  module: string,
  fn: string,
  args: unknown[],
  scope: WindowsActionScope
): WindowsActionPayload {
  if (!isWindowsHelperFallbackAllowed(module, fn)) {
    fallbackNotSupported(module, fn)
  }

  if (module === 'tools' && fn === 'writeFileByRoot') {
    const validated = validateWriteFileArgs(args, scope)
    return buildWindowsDataAction(
      (tempFilePath) => buildWriteFileScript(validated, tempFilePath),
      'text',
      () => validated.content
    )
  }

  if (module === 'tools' && fn === 'writeBufferBase64ByRoot') {
    const validated = validateWriteBufferArgs(args, scope)
    return buildWindowsDataAction(
      (tempFilePath) => buildWriteBufferScript(validated, tempFilePath),
      'base64',
      () => validated.base64Content
    )
  }

  if (module === 'tools' && fn === 'rm') {
    return { script: buildRmScript(validateRmArgs(args, scope)) }
  }

  if (module === 'tools' && fn === 'setSystemPath') {
    const validated = validateSetSystemPathArgs(args)
    return buildWindowsDataAction(
      (tempFilePath) => buildSetSystemPathScript(validated, tempFilePath),
      'text',
      () => JSON.stringify(validated)
    )
  }

  if (module === 'tools' && fn === 'setSystemEnv') {
    const validated = validateSetSystemEnvArgs(args)
    return buildWindowsDataAction(
      (tempFilePath) => buildSetSystemEnvScript(validated, tempFilePath),
      'text',
      () => JSON.stringify(validated)
    )
  }

  if (module === 'tools' && fn === 'setAutoStartWin') {
    const validated = validateSetAutoStartArgs(args, scope)
    return buildWindowsDataAction(
      (tempFilePath) => buildSetAutoStartScript(validated, tempFilePath, scope.targetUserSid),
      'text',
      () => JSON.stringify(validated)
    )
  }

  if (module === 'host' && fn === 'sslAddTrustedCert') {
    return { script: buildSslAddTrustedCertScript(validateSslAddTrustedCertArgs(args, scope)) }
  }

  fallbackNotSupported(module, fn)
}

export function buildWindowsHelperFallbackPlan(
  module: string,
  fn: string,
  args: unknown[],
  inlineLimit = DEFAULT_INLINE_LIMIT,
  targetUserSid?: string
): WindowsHelperFallbackPlan {
  // 仅无 provider 的兼容入口包装命令并选择 TEMP；现代构造不经过本函数。
  if (targetUserSid) allowedRootsFilePath(targetUserSid)
  const payload = buildWindowsActionPayload(module, fn, args, { targetUserSid })
  const inlinePlan = createPlan(payload.script)
  if (!payload.dataFile || inlinePlan.command.length <= inlineLimit) return inlinePlan
  const data = payload.dataFile
  const tempFilePath = buildTempFilePath(data.kind)
  return createPlan(data.buildScript(tempFilePath), data.kind, data.content(), tempFilePath)
}

export function parseFlyEnvPowerShellIntegrationFallbackResult(
  stdout: string
): FlyEnvPowerShellIntegrationFallbackResult {
  let result: unknown
  try {
    result = JSON.parse(stdout)
  } catch {
    helperExecutionFailed('FlyEnv PowerShell integration fallback returned invalid JSON')
  }
  if (typeof result !== 'object' || result === null || Array.isArray(result)) {
    helperExecutionFailed('FlyEnv PowerShell integration fallback returned an invalid result')
  }
  const data = result as Record<string, unknown>
  if (data.scriptState !== 'updated' && data.scriptState !== 'unchanged') {
    helperExecutionFailed('FlyEnv PowerShell integration fallback returned an invalid script state')
  }
  if (!Array.isArray(data.profiles)) {
    helperExecutionFailed('FlyEnv PowerShell integration fallback returned invalid profiles')
  }
  const profiles = data.profiles.map((profile, index) => {
    if (typeof profile !== 'object' || profile === null || Array.isArray(profile)) {
      helperExecutionFailed(`FlyEnv PowerShell integration fallback profile ${index} is invalid`)
    }
    const item = profile as Record<string, unknown>
    if (item.edition !== 'windows-powershell' && item.edition !== 'pwsh') {
      helperExecutionFailed(
        `FlyEnv PowerShell integration fallback profile ${index} has an invalid edition`
      )
    }
    if (typeof item.path !== 'string' || (item.state !== 'updated' && item.state !== 'unchanged')) {
      helperExecutionFailed(`FlyEnv PowerShell integration fallback profile ${index} is invalid`)
    }
    const edition =
      item.edition as FlyEnvPowerShellIntegrationFallbackResult['profiles'][number]['edition']
    const state =
      item.state as FlyEnvPowerShellIntegrationFallbackResult['profiles'][number]['state']
    return { edition, path: item.path as string, state }
  })
  return { scriptState: data.scriptState, profiles }
}

function parseFlyEnvPowerShellIntegrationUacResult(
  stdout: string,
  nonce: string
): FlyEnvPowerShellIntegrationFallbackResult {
  let envelope: unknown
  try {
    envelope = JSON.parse(stdout)
  } catch {
    helperExecutionFailed('FlyEnv PowerShell integration UAC fallback returned invalid JSON')
  }
  if (typeof envelope !== 'object' || envelope === null || Array.isArray(envelope)) {
    helperExecutionFailed('FlyEnv PowerShell integration UAC fallback returned an invalid result')
  }
  const data = envelope as Record<string, unknown>
  if (data.nonce !== nonce) {
    helperExecutionFailed('FlyEnv PowerShell integration UAC fallback returned an invalid nonce')
  }
  if (typeof data.error === 'string' && data.error.trim()) {
    helperExecutionFailed(data.error)
  }
  if (!Object.hasOwn(data, 'result')) {
    helperExecutionFailed('FlyEnv PowerShell integration UAC fallback returned no result')
  }
  return parseFlyEnvPowerShellIntegrationFallbackResult(JSON.stringify(data.result))
}

async function runFlyEnvPowerShellIntegrationUacFallback(
  args: unknown[]
): Promise<FlyEnvPowerShellIntegrationFallbackResult> {
  // 环境同步及旧 Sudo 错误分类仅归兼容执行入口，不应随现代脚本构造初始化。
  const { default: EnvSync } = await import('./EnvSync')
  await EnvSync.sync().catch(() => undefined)
  const plan = buildFlyEnvPowerShellIntegrationUacPlan(args, {
    powershellPath: resolveWindowsPowerShellPath(),
    targetUserSid: (await getWindowsHelperIdentity()).sid
  })
  try {
    await fs.rm(plan.resultPath, { force: true }).catch(() => {})
    try {
      await execFileAsync(plan.powershellPath, plan.args, {
        windowsHide: true,
        maxBuffer: 64 * 1024
      })
    } catch (error) {
      const { classifyWindowsElevationError } = await import('./Sudo')
      throw classifyWindowsElevationError(error)
    }
    let stdout: string
    try {
      stdout = await fs.readFile(plan.resultPath, 'utf8')
    } catch {
      helperExecutionFailed('FlyEnv PowerShell integration UAC fallback returned no result')
    }
    return parseFlyEnvPowerShellIntegrationUacResult(stdout, plan.nonce)
  } finally {
    await fs.rm(plan.resultPath, { force: true }).catch(() => {})
  }
}

export async function runWindowsHelperFallback(
  module: string,
  fn: string,
  args: unknown[]
): Promise<true | FlyEnvPowerShellIntegrationFallbackResult> {
  if (process.platform !== 'win32') {
    fallbackNotSupported(module, fn)
  }
  if (module === 'tools' && fn === 'installFlyEnvPowerShellIntegration') {
    return await runFlyEnvPowerShellIntegrationUacFallback(args)
  }
  // 标准业务路由使用 runWindowsAction；只有实际进入无 provider 的兼容执行
  // 分支时才加载旧 Sudo。保留外部/独立入口能力，不给现代路径增加旧初始化依赖。
  const { exec: Sudo } = await import('./Sudo')
  if (module === 'tools' && fn === 'ensureFlyEnvDataDirectory') {
    ensureArgCount(args, 1, 'ensureFlyEnvDataDirectory')
    const dataDirectory = ensureString(args[0], 'ensureFlyEnvDataDirectory arg[0] (dataDirectory)')
    let userSid: string
    try {
      userSid = (await getWindowsHelperIdentity()).sid
    } catch {
      helperExecutionFailed('failed to determine the FlyEnv user SID')
    }
    const plan = buildFlyEnvDataDirectoryRecoveryUacPlan(dataDirectory, userSid)
    await Sudo(plan.command, { name: 'FlyEnv' })
    return true
  }
  const { default: EnvSync } = await import('./EnvSync')
  await EnvSync.sync()
  const targetUserSid = (await getWindowsHelperIdentity()).sid
  const plan = buildWindowsHelperFallbackPlan(module, fn, args, DEFAULT_INLINE_LIMIT, targetUserSid)

  try {
    if (plan.tempFilePath && plan.tempFileContent !== undefined) {
      await fs.writeFile(plan.tempFilePath, plan.tempFileContent, 'utf8')
    }
    await Sudo(plan.command, { name: 'FlyEnv' })
    // 仅返回脚本执行结果；实际环境业务处理 clean，并在自身 resolve/reject 后通知。
    // 独立 fallback 不能提前启动广播，否则会抢占后续列表刷新的 worker。
    return true
  } finally {
    if (plan.tempFilePath) {
      await fs.rm(plan.tempFilePath, { force: true }).catch(() => {})
    }
  }
}

/** main 路径及原用户身份快照；进程启动身份只用于拒绝等待期间的 PID/端口复用。 */
export type WindowsPrivilegeActionContext = {
  roots: string[]
  userDocuments: string
  userSid?: string
  /** created 为完整精度的 Process.StartTime UTC invariant 字符串，两阶段共用同一格式。 */
  processes?: Array<{
    pid: number
    created: string
    source: 'startTime' | 'cim' | 'cim-descendant'
    path?: string
  }>
}

// 运行时动作必须能在尚未安装 Helper 时工作；可信根目录来自 main 提供的应用路径，
// 不依赖 Helper 私有配置文件。
export function buildWindowsPrivilegeAction(
  module: string,
  fn: string,
  args: unknown[],
  context: WindowsPrivilegeActionContext
): string {
  // main 的可信根作为本次调用的不可共享上下文；校验失败不改变其他并发动作。
  const scope: WindowsActionScope = {
    roots: context.roots.map((root) => cleanAbsPath(root, 'runtime root')),
    targetUserSid: context.userSid
  }
  const preamble = buildPowerShellPreamble()
  if (module === 'tools' && fn === 'installFlyEnvPowerShellIntegration') {
    const request = validateFlyEnvPowerShellIntegrationArgs(args, scope)
    for (const profile of request.profiles) {
      if (!pathInDir(profile.path, cleanAbsPath(context.userDocuments, 'user Documents'))) {
        helperExecutionFailed('PowerShell profile is outside the original user Documents directory')
      }
    }
    return buildInstallFlyEnvPowerShellIntegrationScript(request, {
      runtimeRoots: scope.roots
    }).replace(
      '$flyEnvResult | ConvertTo-Json -Compress',
      '$global:FlyEnvActionResult = $flyEnvResult'
    )
  }
  // 仅恢复 FlyEnv 的精确业务根目录 ACL，拒绝系统目录、Helper 安装目录及其祖先。
  if (module === 'tools' && fn === 'ensureFlyEnvDataDirectory') {
    ensureArgCount(args, 1, fn)
    const root = cleanAbsPath(ensureString(args[0], 'data directory'), 'data directory')
    if (
      !context.roots.some((allowed) => pathEqual(root, allowed)) ||
      pathHasSymlinkComponent(root)
    ) {
      helperExecutionFailed(
        'FlyEnv data-directory recovery target is outside the application roots'
      )
    }
    validateFlyEnvDataDirectoryRecoveryRoot(root, scope)
    if (pathInDir(root, windowsSystemRoot()) || pathInDir(windowsSystemRoot(), root)) {
      helperExecutionFailed('Cannot grant user write access to Windows system directories')
    }
    if (!context.userSid || !WINDOWS_SID_PATTERN.test(context.userSid))
      helperExecutionFailed('Original user SID is required')
    return buildFlyEnvDataDirectoryRecoveryScript(root, context.userSid)
  }
  if (module === 'tools' && fn === 'readFileByRoot') {
    ensureArgCount(args, 1, fn)
    const file = validatePathForRead(ensureString(args[0], 'file'), 'file', scope)
    return `${preamble}\n$global:FlyEnvActionResult = [IO.File]::ReadAllText(${powerShellString(file)}, [Text.Encoding]::UTF8)`
  }
  if (module === 'tools' && fn === 'getSystemPath') {
    ensureArgCount(args, 0, fn)
    return `${preamble}\n$global:FlyEnvActionResult = [string][Environment]::GetEnvironmentVariable('Path', 'Machine')`
  }
  if (module === 'tools' && (fn === 'processListWin' || fn === 'getPortPids')) {
    ensureArgCount(args, fn === 'processListWin' ? 0 : 1, fn)
    if (fn === 'processListWin') {
      return `${preamble}\n$global:FlyEnvActionResult = ConvertTo-Json -InputObject @(Get-CimInstance Win32_Process | Select-Object CommandLine,ExecutablePath,ProcessId,ParentProcessId,CreationClassName) -Compress`
    }
    const port = Number(args[0])
    if (!Number.isInteger(port) || port < 1 || port > 65535) helperExecutionFailed('Invalid port')
    // 通用 getPortPids 保留所有 TCP 状态，不误当成 Listen 专用查询；TIME_WAIT
    // 可能报告 OwningProcess=0，这不是进程目标，跳过即可。其他 TCP/CIM 查询失败
    // 必须传播，不能伪装成空快照。
    return `${preamble}\n${windowsTcpConnectionLookup}
$global:FlyEnvActionResult = @(Get-FlyEnvTcpConnections ${port} | Where-Object { [int]$_.OwningProcess -gt 0 } | ForEach-Object { $p = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $_.OwningProcess) -ErrorAction Stop; if ($null -ne $p) { @{ PID=[string]$_.OwningProcess; PPID=[string]$p.ParentProcessId; COMMAND=[string]$p.CommandLine; USER='' } } })`
  }
  // 有限数字白名单阻止命令注入；在执行进程中再次核对创建时间，不以 PID 单独授权。
  if (module === 'tools' && (fn === 'kill' || fn === 'killPorts')) {
    // 可选第三个布尔值表示服务有序集合；沿用 RPC 位置，不再使用 /T 扩树。
    if (fn === 'kill' && args.length === 3) {
      if (typeof args[2] !== 'boolean') helperExecutionFailed('Invalid process tree mode')
    } else ensureArgCount(args, fn === 'kill' ? 2 : 1, fn)
    const tree = fn === 'kill' && args[2] === true
    const values = fn === 'kill' ? args[1] : args[0]
    if (!Array.isArray(values) || values.length > (tree ? 4096 : 256))
      helperExecutionFailed('Invalid process targets')
    // 两类请求统一去重，不因重复 PID 产生重复快照或错误的身份比较。
    const ids = [
      ...new Set(
        values.map((value) => {
          const id = Number(value)
          if (
            !Number.isInteger(id) ||
            id <= (fn === 'kill' ? 4 : 0) ||
            id > (fn === 'kill' ? 0x7fffffff : 65535)
          )
            helperExecutionFailed('Invalid process target')
          return id
        })
      )
    ]
    const targets =
      fn === 'kill'
        ? `$targetPids = @(${ids.join(', ')})`
        : // 提升执行时重新读取监听者；读取错误须失败，不能当作端口已空。
          `$targetPids = @(@(${ids.join(', ')}) | ForEach-Object { Get-FlyEnvStopListenerPids ([int]$_) } | Sort-Object -Unique)`
    const expected = context.processes
      ? `$expectedProcesses = @(${context.processes.map((item) => `@{ pid=${item.pid}; created=${powerShellString(item.created)}; source=${powerShellString(item.source ?? 'startTime')}; path=${powerShellString(item.path ?? '')} }`).join(', ')})`
      : '$expectedProcesses = $null'
    if (!tree && context.processes?.some((item) => item.source === 'cim-descendant'))
      helperExecutionFailed('Descendant identities require ordered service mode')
    // 所有按 PID 停止共用一次批量命令；端口工具保留自己的监听者复核语义。
    if (fn === 'kill') return buildWindowsOrderedServiceStopAction(preamble, targets, expected)
    // 普通进程工具保持独立 PID/端口语义：预检后再次复核身份，再结束目标。
    // 服务模式已在上方返回；此处不会接受后代来源绕过普通工具的路径授权。
    return `${preamble}\n${targets}
${expected}
${windowsStopProcessLookup}${windowsStopListenerLookup}${windowsStopIdentityLookup}
# 事件通过 WindowsElevation 的认证终态回传，记录实际结束请求和对象结果。
# 日志函数只保存固定 PID/阶段/身份字段，不决定权限或改变原停止异常传播。
${buildPerformanceProcessStopPrelude()}
# 在任何停止动作前预检普通工具的全部独立 PID。
if ($null -ne $expectedProcesses -and '${fn}' -eq 'killPorts') {
$expectedPids = @($expectedProcesses | ForEach-Object { [int]$_.pid } | Sort-Object -Unique)
$currentPids = @($targetPids | ForEach-Object { [int]$_ } | Sort-Object -Unique)
if (@($currentPids | Where-Object { $expectedPids -notcontains $_ }).Count -gt 0) { throw 'Windows port owner changed; refresh and retry' }
}
$targets = @(foreach ($targetPid in $targetPids) {
Add-FlyEnvProcessStopEvent 'preflight-request' $targetPid
$target = Get-FlyEnvStopTarget $targetPid
if ($null -eq $target) { Add-FlyEnvProcessStopEvent 'preflight-skipped-missing' $targetPid; continue }
try {
  # 先取得并保留原进程句柄，再读取创建身份；该句柄覆盖整个预检，finally 保证
  # 即使权限/身份查询失败或目标已退出也释放句柄。
  $targetHandle = $target.Handle
  ${windowsProcessSafetyGuard('$target')}
  if ($null -ne $expectedProcesses) {
    $expected = @($expectedProcesses | Where-Object { $_.pid -eq $target.Id })
    if ($expected.Count -ne 1) {
      throw ('Process identity changed; PID=' + $target.Id + '; stage=preflight; expectedCount=' + $expected.Count + '; refresh and retry')
    }
    $actual = Get-FlyEnvStopIdentity $target.Id $expected[0].source
    if ($null -eq $actual) { Add-FlyEnvProcessStopEvent 'preflight-skipped-exited' $target.Id; continue }
    Add-FlyEnvProcessStopEvent 'preflight-identity' $target.Id @{ expectedCreated=$expected[0].created; actualCreated=$actual.created; executable=$actual.path }
    if ($actual.created -cne $expected[0].created -or ($expected[0].source -eq 'cim' -and -not [string]::Equals([IO.Path]::GetFullPath($actual.path), [IO.Path]::GetFullPath($expected[0].path), [StringComparison]::OrdinalIgnoreCase))) {
      throw ('Process identity changed; PID=' + $target.Id + '; stage=preflight; refresh and retry')
    }
    $created = $actual.created
    $source = $expected[0].source
    $path = $actual.path
  } else {
    $created = ${windowsProcessStartIdentity}
    $source = 'startTime'
    $path = ''
  }
  @{ pid=$target.Id; created=$created; source=$source; path=$path }
} catch {
  Add-FlyEnvProcessStopEvent 'preflight-failed' $targetPid @{ error=$_.Exception.Message }
  throw
} finally {
  $target.Dispose()
}
})
foreach ($snapshot in $targets) {
Add-FlyEnvProcessStopEvent 'before-stop-request' $snapshot.pid
$target = Get-FlyEnvStopTarget $snapshot.pid
if ($null -eq $target) { Add-FlyEnvProcessStopEvent 'before-stop-skipped-missing' $snapshot.pid; continue }
try {
  # 普通进程工具固定本轮目标的原生句柄，再重查身份；服务有序集合走上方专用分支。
  # 不靠 PID 数字跨过“复核→Stop-Process”间隙，所有返回都在 finally 释放。
  $targetHandle = $target.Handle
  $actual = Get-FlyEnvStopIdentity $snapshot.pid $snapshot.source
  if ($null -eq $actual) { Add-FlyEnvProcessStopEvent 'before-stop-skipped-exited' $snapshot.pid; continue }
  Add-FlyEnvProcessStopEvent 'before-stop-identity' $snapshot.pid @{ expectedCreated=$snapshot.created; actualCreated=$actual.created; executable=$actual.path }
  if ($actual.created -cne $snapshot.created -or ($snapshot.source -eq 'cim' -and -not [string]::Equals([IO.Path]::GetFullPath($actual.path), [IO.Path]::GetFullPath($snapshot.path), [StringComparison]::OrdinalIgnoreCase))) {
    throw ('Process identity changed; PID=' + $snapshot.pid + '; stage=before-stop; refresh and retry')
  }
  # 属性可能在身份核对后消失；仅确认目标已自行退出时才幂等跳过。
  ${windowsProcessSafetyGuard('$target')}
  Add-FlyEnvProcessStopEvent 'stop-process-request' $target.Id
  Stop-Process -InputObject $target -Force -ErrorAction Stop
  if (-not $target.WaitForExit(10000)) { throw ('Process is still running after the stop request; PID=' + $target.Id) }
  Add-FlyEnvProcessStopEvent 'root-exited' $target.Id
} catch {
  Add-FlyEnvProcessStopEvent 'stop-error' $snapshot.pid @{ error=$_.Exception.Message }
  # 普通工具只负责显式 PID；原对象已经自然退出时允许幂等完成。
  if ($target.HasExited) { continue }
  throw
} finally {
  $target.Dispose()
}
}`
  }
  if (module === 'host' && fn === 'dnsRefresh') {
    ensureArgCount(args, 0, fn)
    return `${preamble}\nClear-DnsClientCache -ErrorAction Stop`
  }
  // 读取 LocalMachine Root 无需管理员；存在本地证书时按 Thumbprint 核对实际证书，而非仅凭同名 CN。
  if (module === 'host' && fn === 'sslFindCertificate') {
    if (args.length < 1 || args.length > 2) helperExecutionFailed('Invalid certificate query')
    const directory = validatePathForRead(
      ensureString(args[0], 'certificate directory'),
      'certificate directory',
      scope
    )
    const name =
      args[1] === undefined ? 'FlyEnv-Root-CA' : ensureString(args[1], 'certificate name')
    if (!/^[A-Za-z0-9_. -]{1,128}$/.test(name)) helperExecutionFailed('Invalid certificate name')
    const certificatePath = validatePathForRead(
      path.win32.join(directory, `${name}.crt`),
      'certificate file',
      scope
    )
    return `${preamble}
$reference = $null
$certificatePath = ${powerShellString(certificatePath)}
if (Test-Path -LiteralPath $certificatePath -PathType Leaf) {
$text = [IO.File]::ReadAllText($certificatePath)
$pem = [regex]::Match($text, '(?s)-----BEGIN CERTIFICATE-----(.*?)-----END CERTIFICATE-----')
$bytes = if ($pem.Success) { [Convert]::FromBase64String($pem.Groups[1].Value) } else { [IO.File]::ReadAllBytes($certificatePath) }
$reference = [Security.Cryptography.X509Certificates.X509Certificate2]::new([byte[]]$bytes)
}
try {
$certs = @(Get-ChildItem Cert:\\LocalMachine\\Root | Where-Object { $_.Subject -eq ${powerShellString(`CN=${name}`)} -and ($null -eq $reference -or $_.Thumbprint -eq $reference.Thumbprint) })
$global:FlyEnvActionResult = @{ stdout=($certs | Format-List | Out-String); stderr='' }
} finally { if ($null -ne $reference) { $reference.Dispose() } }`
  }
  // 直接消费统一验证后的业务脚本。命令编码、大小阈值和 TEMP 仅归旧适配入口，
  // 不再用 Number.MAX_SAFE_INTEGER 伪装 inline 计划来取得现代动作。
  return buildWindowsActionPayload(module, fn, args, scope).script
}

/** UAC 等待后再次拒绝路径链中的 junction/symlink；不能只依赖构造时的路径验证。 */
export const buildWindowsActionPathGuard = (paths: string[]): string => `
$ErrorActionPreference = 'Stop'
foreach ($actionPath in @(${paths.map(powerShellString).join(', ')})) {
  $checkedPath = [IO.Path]::GetFullPath($actionPath)
  while (-not [string]::IsNullOrWhiteSpace($checkedPath)) {
    if (Test-Path -LiteralPath $checkedPath) {
      $checkedItem = Get-Item -LiteralPath $checkedPath -Force -ErrorAction Stop
      if (($checkedItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Refusing a reparse point in the Windows action path' }
    }
    $parentPath = [IO.Path]::GetDirectoryName($checkedPath)
    if ($parentPath -eq $checkedPath) { break }
    $checkedPath = $parentPath
  }
}
`
