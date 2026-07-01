import { randomUUID } from 'node:crypto'
import { lstatSync, readFileSync, statSync } from 'node:fs'
import * as fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import EnvSync from './EnvSync'
import { buildPowerShellEncodedCommand } from './PowerShellCommand'
import { exec as Sudo } from './Sudo'
import { AppHelperError, isWindowsHelperFallbackAllowed } from './WindowsHelperState'

export type WindowsHelperFallbackMode = 'inline' | 'data-file'
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

type ValidatedWriteFileArgs = {
  targetPath: string
  content: string
}

type ValidatedWriteBufferArgs = {
  targetPath: string
  base64Content: string
}

type ValidatedSetSystemPathArgs = {
  paths: string[]
  otherVars: Record<string, string>
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
  const normalized = path.win32.normalize(trimmed)
  if (!path.win32.isAbsolute(normalized)) {
    helperExecutionFailed(`${label} must be an absolute path`)
  }
  if (isRootPath(normalized)) {
    helperExecutionFailed(`${label} must not be a root path`)
  }
  return normalized
}

function windowsHostsPathCandidates(): string[] {
  const systemRoot = process.env.SystemRoot || 'C:\\Windows'
  return [
    path.win32.join(systemRoot, 'System32', 'drivers', 'etc', 'hosts'),
    'C:\\Windows\\System32\\drivers\\etc\\hosts',
    'c:\\windows\\system32\\drivers\\etc\\hosts'
  ]
}

function isExplicitSystemFile(targetPath: string): boolean {
  return windowsHostsPathCandidates().some((candidate) => pathEqual(targetPath, candidate))
}

function isSensitiveSystemPath(targetPath: string): boolean {
  const systemRoot = process.env.SystemRoot || 'C:\\Windows'
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

function allowedRootsFilePath(): string {
  const programData = process.env.ProgramData || 'C:\\ProgramData'
  return path.win32.join(programData, 'FlyEnv', 'flyenv.allowed-roots')
}

function readConfiguredAllowedRoots(): ConfiguredAllowedRoots {
  const targetPath = allowedRootsFilePath()
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

function isBusinessPathAllowed(targetPath: string): boolean {
  const configured = readConfiguredAllowedRoots()
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

function validatePathAccess(targetPath: string, label: string, forWrite: boolean): string {
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
  if (!isBusinessPathAllowed(clean)) {
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

function validatePathForRead(targetPath: string, label: string): string {
  return validatePathAccess(targetPath, label, false)
}

function validatePathForWrite(targetPath: string, label: string): string {
  return validatePathAccess(targetPath, label, true)
}

function validatePathForRemove(targetPath: string, label: string): string {
  const clean = cleanAbsPath(targetPath, label)
  if (isExplicitSystemFile(clean)) {
    helperExecutionFailed(`refusing to remove protected system file: ${targetPath}`)
  }
  return validatePathAccess(clean, label, true)
}

function validatePathLikeEnvEntry(value: string, label: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    helperExecutionFailed(`${label} must not be empty`)
  }
  if (CONTROL_CHAR_PATTERN.test(trimmed) || /[;"']/u.test(trimmed)) {
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
    return validatePathForWrite(value, `environment variable value for ${key}`)
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

function buildTempFilePath(kind: WindowsHelperFallbackTempFileKind): string {
  const suffix = kind === 'base64' ? '.b64.txt' : '.txt'
  return path.join(os.tmpdir(), `flyenv-helper-fallback-${randomUUID()}${suffix}`)
}

function buildPowerShellPreamble(): string {
  return `$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::InputEncoding = [System.Text.Encoding]::UTF8`
}

function buildNotifyEnvironmentChangedScript(): string {
  return `Add-Type -Namespace FlyEnvFallback -Name NativeMethods -MemberDefinition @'
[System.Runtime.InteropServices.DllImport("user32.dll", CharSet = System.Runtime.InteropServices.CharSet.Unicode, SetLastError = true)]
public static extern System.IntPtr SendMessageTimeout(System.IntPtr hWnd, uint Msg, System.UIntPtr wParam, string lParam, uint fuFlags, uint uTimeout, out System.UIntPtr lpdwResult);
'@
$notifyResult = [System.UIntPtr]::Zero
[FlyEnvFallback.NativeMethods]::SendMessageTimeout(
  [System.IntPtr]0xffff,
  0x001A,
  [System.UIntPtr]::Zero,
  'Environment',
  0x0002,
  5000,
  [ref]$notifyResult
) | Out-Null`
}

function validateWriteFileArgs(args: unknown[]): ValidatedWriteFileArgs {
  ensureArgCount(args, 2, 'writeFileByRoot')
  return {
    targetPath: validatePathForWrite(
      ensureString(args[0], 'writeFileByRoot arg[0] (targetPath)'),
      'writeFileByRoot targetPath'
    ),
    content: ensureString(args[1], 'writeFileByRoot arg[1] (content)')
  }
}

function validateWriteBufferArgs(args: unknown[]): ValidatedWriteBufferArgs {
  ensureArgCount(args, 2, 'writeBufferBase64ByRoot')
  return {
    targetPath: validatePathForWrite(
      ensureString(args[0], 'writeBufferBase64ByRoot arg[0] (targetPath)'),
      'writeBufferBase64ByRoot targetPath'
    ),
    base64Content: validateBase64(
      ensureString(args[1], 'writeBufferBase64ByRoot arg[1] (base64Content)'),
      'writeBufferBase64ByRoot base64Content'
    )
  }
}

function validateRmArgs(args: unknown[]): string {
  ensureArgCount(args, 1, 'rm')
  return validatePathForRemove(ensureString(args[0], 'rm arg[0] (targetPath)'), 'rm targetPath')
}

function validateSetSystemPathArgs(args: unknown[]): ValidatedSetSystemPathArgs {
  ensureArgCount(args, 2, 'setSystemPath')
  if (!Array.isArray(args[0])) {
    helperExecutionFailed('setSystemPath arg[0] (paths) must be a string array')
  }
  const paths = args[0].map((entry, index) =>
    validatePathLikeEnvEntry(
      ensureString(entry, `setSystemPath paths[${index}]`),
      `setSystemPath paths[${index}]`
    )
  )
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
  return { paths, otherVars }
}

function validateSetSystemEnvArgs(args: unknown[]): ValidatedSetSystemEnvArgs {
  ensureArgCount(args, 2, 'setSystemEnv')
  const key = validateSystemEnvKey(ensureString(args[0], 'setSystemEnv arg[0] (key)'), false)
  const value = validateSystemEnvValue(key, ensureString(args[1], 'setSystemEnv arg[1] (value)'))
  return { key, value }
}

function validateSetAutoStartArgs(args: unknown[]): ValidatedSetAutoStartArgs {
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
  if (!isBusinessPathAllowed(exePath) && !isManagedDirectoryByName(exePath)) {
    helperExecutionFailed(`auto-start executable outside FlyEnv allowed scope: ${exePath}`)
  }
  return { enabled, taskName, exePath }
}

function validateSslAddTrustedCertArgs(args: unknown[]): ValidatedSslAddTrustedCertArgs {
  ensureArgCount(args, 2, 'sslAddTrustedCert')
  const cwd = validatePathForRead(
    ensureString(args[0], 'sslAddTrustedCert arg[0] (cwd)'),
    'sslAddTrustedCert cwd'
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

function buildRmScript(targetPath: string): string {
  return `${buildPowerShellPreamble()}
$targetPath = ${powerShellString(targetPath)}
if (Test-Path -LiteralPath $targetPath) {
  Remove-Item -LiteralPath $targetPath -Recurse -Force -ErrorAction SilentlyContinue
}`
}

function buildSetSystemPathScript(args: ValidatedSetSystemPathArgs, tempFilePath?: string): string {
  const runtimeSetup = tempFilePath
    ? `$payload = Get-Content -LiteralPath ${powerShellString(tempFilePath)} -Raw | ConvertFrom-Json
$paths = @($payload.paths)
$otherVars = @{}
if ($payload.otherVars) {
  foreach ($property in $payload.otherVars.PSObject.Properties) {
    $otherVars[[string]$property.Name] = [string]$property.Value
  }
}`
    : (() => {
        const pathsArray = args.paths.map((entry) => powerShellString(entry)).join(', ')
        const otherVarsBody = Object.entries(args.otherVars)
          .map(([key, value]) => `${powerShellString(key)} = ${powerShellString(value)}`)
          .join('; ')
        return `$paths = @(${pathsArray})
$otherVars = ${otherVarsBody ? `@{ ${otherVarsBody} }` : '@{}'}`
      })()
  return `${buildPowerShellPreamble()}
${runtimeSetup}
$pathValue = (($paths | Where-Object { $_ -and $_.ToString().Trim().Length -gt 0 }) -join ';') + ';'
New-ItemProperty -LiteralPath ${powerShellString(MACHINE_ENV_REGISTRY_PATH)} -Name 'Path' -Value $pathValue -PropertyType ExpandString -Force | Out-Null
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
Set-ItemProperty -LiteralPath ${powerShellString(MACHINE_ENV_REGISTRY_PATH)} -Name 'FLYENV_ENV_FLUSH' -Value '0'
${buildNotifyEnvironmentChangedScript()}`
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
${writeValue}
${buildNotifyEnvironmentChangedScript()}`
}

function buildResolveWindowsSystemExeScript(variableName: string, exeName: string): string {
  const exeFileName = exeName.toLowerCase().endsWith('.exe') ? exeName : `${exeName}.exe`
  return `$${variableName} = $null
$systemRoot = $env:SystemRoot
if ([string]::IsNullOrWhiteSpace($systemRoot)) {
  $systemRoot = 'C:\\Windows'
}
foreach ($candidate in @(
  [IO.Path]::Combine($systemRoot, 'Sysnative', '${exeFileName}'),
  [IO.Path]::Combine($systemRoot, 'System32', '${exeFileName}')
)) {
  if (Test-Path -LiteralPath $candidate -PathType Leaf) {
    $${variableName} = $candidate
    break
  }
}
if (-not $${variableName}) {
  $${variableName} = '${exeFileName}'
}`
}

function buildSetAutoStartScript(args: ValidatedSetAutoStartArgs, tempFilePath?: string): string {
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
  & $schtasksExe /create /tn $taskName /tr ('"' + $exePath + '"') /sc onlogon /rl highest /f | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "$schtasksExe /create failed with exit code $LASTEXITCODE"
  }
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
Set-Location -LiteralPath ${powerShellString(args.cwd)}
$caFile = ${powerShellString(args.caName)}
& certutil -addstore root $caFile | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "certutil -addstore failed with exit code $LASTEXITCODE"
}`
}

function createPlan(
  script: string,
  tempFileKind?: WindowsHelperFallbackTempFileKind,
  tempFileContent?: string,
  tempFilePath?: string
): WindowsHelperFallbackPlan {
  return {
    mode: tempFilePath ? 'data-file' : 'inline',
    command: buildPowerShellEncodedCommand(script, EnvSync.PowerShellPath || 'powershell.exe'),
    script,
    tempFileKind,
    tempFileContent,
    tempFilePath
  }
}

function buildInlineOrDataFilePlan(
  buildScript: (tempFilePath?: string) => string,
  tempFileKind: WindowsHelperFallbackTempFileKind,
  tempFileContent: string,
  inlineLimit: number
): WindowsHelperFallbackPlan {
  const inlinePlan = createPlan(buildScript())
  if (inlinePlan.command.length <= inlineLimit) {
    return inlinePlan
  }

  const tempFilePath = buildTempFilePath(tempFileKind)
  return createPlan(buildScript(tempFilePath), tempFileKind, tempFileContent, tempFilePath)
}

export function buildWindowsHelperFallbackPlan(
  module: string,
  fn: string,
  args: unknown[],
  inlineLimit = DEFAULT_INLINE_LIMIT
): WindowsHelperFallbackPlan {
  if (!isWindowsHelperFallbackAllowed(module, fn)) {
    fallbackNotSupported(module, fn)
  }

  if (module === 'tools' && fn === 'writeFileByRoot') {
    const validated = validateWriteFileArgs(args)
    return buildInlineOrDataFilePlan(
      (tempFilePath) => buildWriteFileScript(validated, tempFilePath),
      'text',
      validated.content,
      inlineLimit
    )
  }

  if (module === 'tools' && fn === 'writeBufferBase64ByRoot') {
    const validated = validateWriteBufferArgs(args)
    return buildInlineOrDataFilePlan(
      (tempFilePath) => buildWriteBufferScript(validated, tempFilePath),
      'base64',
      validated.base64Content,
      inlineLimit
    )
  }

  if (module === 'tools' && fn === 'rm') {
    return createPlan(buildRmScript(validateRmArgs(args)))
  }

  if (module === 'tools' && fn === 'setSystemPath') {
    const validated = validateSetSystemPathArgs(args)
    return buildInlineOrDataFilePlan(
      (tempFilePath) => buildSetSystemPathScript(validated, tempFilePath),
      'text',
      JSON.stringify(validated),
      inlineLimit
    )
  }

  if (module === 'tools' && fn === 'setSystemEnv') {
    const validated = validateSetSystemEnvArgs(args)
    return buildInlineOrDataFilePlan(
      (tempFilePath) => buildSetSystemEnvScript(validated, tempFilePath),
      'text',
      JSON.stringify(validated),
      inlineLimit
    )
  }

  if (module === 'tools' && fn === 'setAutoStartWin') {
    const validated = validateSetAutoStartArgs(args)
    return buildInlineOrDataFilePlan(
      (tempFilePath) => buildSetAutoStartScript(validated, tempFilePath),
      'text',
      JSON.stringify(validated),
      inlineLimit
    )
  }

  if (module === 'host' && fn === 'sslAddTrustedCert') {
    return createPlan(buildSslAddTrustedCertScript(validateSslAddTrustedCertArgs(args)))
  }

  fallbackNotSupported(module, fn)
}

export async function runWindowsHelperFallback(
  module: string,
  fn: string,
  args: unknown[]
): Promise<true> {
  if (process.platform !== 'win32') {
    fallbackNotSupported(module, fn)
  }
  await EnvSync.sync()
  const plan = buildWindowsHelperFallbackPlan(module, fn, args)

  try {
    if (plan.tempFilePath && plan.tempFileContent !== undefined) {
      await fs.writeFile(plan.tempFilePath, plan.tempFileContent, 'utf8')
    }
    await Sudo(plan.command, { name: 'FlyEnv' })
    if (module === 'tools' && (fn === 'setSystemEnv' || fn === 'setSystemPath')) {
      EnvSync.clean()
      await EnvSync.sync().catch(() => undefined)
    }
    return true
  } finally {
    if (plan.tempFilePath) {
      await fs.rm(plan.tempFilePath, { force: true }).catch(() => {})
    }
  }
}
