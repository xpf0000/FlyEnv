import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { lstatSync, readFileSync, statSync } from 'node:fs'
import * as fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'
import { deflateRawSync } from 'node:zlib'
import EnvSync from './EnvSync'
import { buildPowerShellEncodedCommand } from './PowerShellCommand'
import { classifyWindowsElevationError, exec as Sudo } from './Sudo'
import { getWindowsHelperIdentity } from './WindowsHelperIdentity'
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
  callerHome: string
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
  callerHome?: string
  powershellPath?: string
  resultPath?: string
  nonce?: string
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
  return EnvSync.SystemPath || 'C:\\Windows\\System32'
}

function windowsSystemRoot(): string {
  return path.win32.dirname(windowsSystemPath())
}

function windowsHostsPathCandidates(): string[] {
  const systemRoot = windowsSystemRoot()
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

function validateFlyEnvDataDirectoryRecoveryRoot(value: string): string {
  const targetPath = cleanAbsPath(value, 'ensureFlyEnvDataDirectory data directory')
  if (isSensitiveSystemPath(targetPath)) {
    helperExecutionFailed(`sensitive system path is not allowed: ${value}`)
  }
  if (pathHasSymlinkComponent(targetPath)) {
    helperExecutionFailed(`ensureFlyEnvDataDirectory data directory contains a reparse point`)
  }
  const configured = readConfiguredAllowedRoots()
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

function validateFlyEnvPowerShellProfileTarget(
  value: unknown,
  index: number,
  callerHome: string
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
    !pathInDir(targetPath, callerHome) ||
    pathEqual(targetPath, callerHome) ||
    path.win32.basename(path.win32.dirname(targetPath)).toLowerCase() !==
      expectedDirectory.toLowerCase() ||
    path.win32.basename(targetPath).toLowerCase() !== expectedFileName.toLowerCase()
  ) {
    helperExecutionFailed(`unexpected ${edition} profile path: ${targetPath}`)
  }
  return { edition, path: targetPath }
}

function validateFlyEnvPowerShellScriptPath(value: string): string {
  const scriptPath = validatePathForWrite(value, 'installFlyEnvPowerShellIntegration scriptPath')
  if (
    path.win32.basename(scriptPath).toLowerCase() !== 'flyenv.ps1' ||
    path.win32.basename(path.win32.dirname(scriptPath)).toLowerCase() !== 'bin'
  ) {
    helperExecutionFailed(`invalid FlyEnv runtime script path: ${scriptPath}`)
  }
  const configured = readConfiguredAllowedRoots()
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
  callerHomeValue = process.env.USERPROFILE
): ValidatedFlyEnvPowerShellIntegrationArgs {
  ensureArgCount(args, 1, 'installFlyEnvPowerShellIntegration')
  if (typeof args[0] !== 'object' || args[0] === null || Array.isArray(args[0])) {
    helperExecutionFailed('installFlyEnvPowerShellIntegration request must be an object')
  }
  const request = args[0] as Record<string, unknown>
  const callerHome = cleanAbsPath(callerHomeValue ?? '', 'current user home')
  const scriptPath = validateFlyEnvPowerShellScriptPath(
    ensureString(request.scriptPath, 'installFlyEnvPowerShellIntegration scriptPath')
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
    const target = validateFlyEnvPowerShellProfileTarget(profile, index, callerHome)
    if (seen.has(target.edition)) {
      helperExecutionFailed(`duplicate PowerShell profile edition: ${target.edition}`)
    }
    seen.add(target.edition)
    return target
  })
  return { callerHome, scriptPath, scriptBase64, profiles }
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

function buildInstallFlyEnvPowerShellIntegrationScript(
  args: ValidatedFlyEnvPowerShellIntegrationArgs,
  options: {
    resultPath?: string
    nonce?: string
  } = {}
): string {
  const runtimeSetup = `$payloadJson = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String(${powerShellString(Buffer.from(JSON.stringify(args), 'utf8').toString('base64'))}))
$payload = $payloadJson | ConvertFrom-Json
$callerHome = ${powerShellString(args.callerHome)}`
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
function Test-FlyEnvShellPathInDirectory([string]$Path, [string]$Directory) {
  if (Test-FlyEnvShellPathEqual $Path $Directory) {
    return $true
  }
  $prefix = $Directory.TrimEnd([char[]]@('\\', '/')) + '\\'
  return $Path.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)
}
function Assert-FlyEnvShellNoReparsePoint([string]$Path) {
  $current = [IO.Path]::GetFullPath($Path)
  while ($true) {
    if (Test-Path -LiteralPath $current) {
      $item = Get-Item -LiteralPath $current -Force
      if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "FlyEnv shell path contains a reparse point: $Path"
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
function Assert-FlyEnvPowerShellIntegrationPayload($Request, [string]$CallerHome) {
  $scriptPath = Normalize-FlyEnvShellPath ([string]$Request.scriptPath) 'runtime script path'
  Assert-FlyEnvShellNoReparsePoint $scriptPath
  $programData = Normalize-FlyEnvShellPath ([string]$env:ProgramData) 'ProgramData path'
  $allowedRootsFile = Join-Path $programData 'FlyEnv\\flyenv.allowed-roots'
  if (-not (Test-Path -LiteralPath $allowedRootsFile -PathType Leaf)) {
    throw 'FlyEnv runtime script roots are unavailable'
  }
  if ([IO.FileInfo]::new($allowedRootsFile).Length -gt 65536) {
    throw 'FlyEnv runtime script roots are too large'
  }
  Assert-FlyEnvAllowedRootsSecurity $allowedRootsFile
  $allowed = $false
  foreach ($rawRoot in @(Get-Content -LiteralPath $allowedRootsFile -Encoding UTF8)) {
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
  $userHome = Normalize-FlyEnvShellPath $CallerHome 'current user home'
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
      -not (Test-FlyEnvShellPathInDirectory $profilePath $userHome) -or
      -not [string]::Equals([IO.Path]::GetFileName($profilePath), $expectedProfileFileName, [StringComparison]::OrdinalIgnoreCase) -or
      -not [string]::Equals([IO.Path]::GetFileName([IO.Path]::GetDirectoryName($profilePath)), $expectedProfileDirectory, [StringComparison]::OrdinalIgnoreCase)
    ) {
      throw "unexpected $edition profile path: $profilePath"
    }
    Assert-FlyEnvShellNoReparsePoint $profilePath
    $seen[$edition] = $true
    $profiles += [PSCustomObject]@{ edition = $edition; path = $profilePath }
  }
  if ($profiles.Count -eq 0) {
    throw 'FlyEnv PowerShell integration requires at least one profile'
  }
  return [PSCustomObject]@{ scriptPath = $scriptPath; scriptBase64 = [string]$Request.scriptBase64; profiles = $profiles }
}
$payload = Assert-FlyEnvPowerShellIntegrationPayload $payload $callerHome
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

function buildRmScript(targetPath: string): string {
  return `${buildPowerShellPreamble()}
$targetPath = ${powerShellString(targetPath)}
if (Test-Path -LiteralPath $targetPath) {
  Remove-Item -LiteralPath $targetPath -Recurse -Force -ErrorAction SilentlyContinue
}`
}

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
  const systemPath = windowsSystemPath()
  const systemRoot = path.win32.dirname(systemPath)
  return `$${variableName} = $null
$systemRoot = ${powerShellString(systemRoot)}
foreach ($candidate in @(
  [IO.Path]::Combine($systemRoot, 'Sysnative', '${exeFileName}'),
  [IO.Path]::Combine(${powerShellString(systemPath)}, '${exeFileName}')
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
  const runLevel = args.taskName === 'FlyEnvStartup' ? 'limited' : 'highest'
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
  & $schtasksExe /create /tn $taskName /tr ('"' + $exePath + '"') /sc onlogon /rl ${runLevel} /f | Out-Null
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
    command: buildPowerShellEncodedCommand(script, EnvSync.PowerShellPath || 'powershell.exe'),
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
  const validatedDirectory = validateFlyEnvDataDirectoryRecoveryRoot(dataDirectory)
  if (!WINDOWS_SID_PATTERN.test(userSid)) {
    helperExecutionFailed('FlyEnv data-directory recovery user SID is invalid')
  }
  return createPlan(buildFlyEnvDataDirectoryRecoveryScript(validatedDirectory, userSid))
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
  const validated = validateFlyEnvPowerShellIntegrationArgs(args, options.callerHome)
  const powershellPath = options.powershellPath ?? 'powershell.exe'
  if (!powershellPath || CONTROL_CHAR_PATTERN.test(powershellPath)) {
    helperExecutionFailed('PowerShell executable path is invalid')
  }
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
    nonce
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
  await EnvSync.sync().catch(() => undefined)
  const plan = buildFlyEnvPowerShellIntegrationUacPlan(args, {
    powershellPath: EnvSync.PowerShellPath || 'powershell.exe'
  })
  try {
    await fs.rm(plan.resultPath, { force: true }).catch(() => {})
    try {
      await execFileAsync(plan.powershellPath, plan.args, {
        windowsHide: true,
        maxBuffer: 64 * 1024
      })
    } catch (error) {
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
