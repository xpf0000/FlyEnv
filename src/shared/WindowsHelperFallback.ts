import { randomUUID } from 'node:crypto'
import { accessSync, constants } from 'node:fs'
import * as fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import EnvSync from './EnvSync'
import { buildPowerShellEncodedCommand } from './PowerShellCommand'
import { exec as Sudo } from './Sudo'
import {
  AppHelperError,
  isWindowsHelperFallbackAllowed
} from './WindowsHelperState'

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
const CONTROL_CHAR_PATTERN = /[\x00\r\n]/u
const INVALID_WIN_PATH_CHAR_PATTERN = /[<>"|?*\x00\r\n]/u
const ENV_KEY_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/
const CERT_NAME_PATTERN = /^[A-Za-z0-9_.-]{1,128}\.crt$/
const ENV_PATH_PATTERN = /^%[A-Za-z0-9_]+%(?:[\\/][^<>"|?*\x00\r\n;]*)?$/

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

function hasPathTraversal(value: string): boolean {
  return value
    .split(/[\\/]/)
    .map((part) => part.trim())
    .some((part) => part === '..')
}

function validateAbsoluteWindowsPath(value: string, label: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    helperExecutionFailed(`${label} must not be empty`)
  }
  if (CONTROL_CHAR_PATTERN.test(trimmed)) {
    helperExecutionFailed(`${label} contains control characters`)
  }
  if (INVALID_WIN_PATH_CHAR_PATTERN.test(trimmed)) {
    helperExecutionFailed(`${label} contains invalid Windows path characters`)
  }
  if (hasPathTraversal(trimmed)) {
    helperExecutionFailed(`${label} contains path traversal`)
  }

  const normalized = path.win32.normalize(trimmed)
  if (!path.win32.isAbsolute(normalized)) {
    helperExecutionFailed(`${label} must be an absolute path`)
  }

  const root = path.win32.parse(normalized).root
  if (normalized === root) {
    helperExecutionFailed(`${label} must not be a root path`)
  }

  return normalized
}

function validatePathLikeEnvEntry(value: string, label: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    helperExecutionFailed(`${label} must not be empty`)
  }
  if (CONTROL_CHAR_PATTERN.test(trimmed) || /[;"']/u.test(trimmed)) {
    helperExecutionFailed(`${label} contains invalid characters`)
  }
  if (/\$env:/iu.test(trimmed)) {
    helperExecutionFailed(`${label} must not use PowerShell env syntax`)
  }
  if (hasPathTraversal(trimmed)) {
    helperExecutionFailed(`${label} contains path traversal`)
  }
  if (trimmed.includes('%')) {
    if (!ENV_PATH_PATTERN.test(trimmed)) {
      helperExecutionFailed(`${label} must be an absolute path or %ENVVAR%-style path`)
    }
    return trimmed
  }
  return validateAbsoluteWindowsPath(trimmed, label)
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
    return validateAbsoluteWindowsPath(value, `environment variable value for ${key}`)
  }
  if (/[\\/]/u.test(value)) {
    helperExecutionFailed(`environment variable value must be an allowed path: ${key}`)
  }
  return value
}

function validateBase64(value: string, label: string): string {
  if (!value || /\s/u.test(value) || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
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
  const targetPath = validateAbsoluteWindowsPath(
    ensureString(args[0], 'writeFileByRoot arg[0] (targetPath)'),
    'writeFileByRoot targetPath'
  )
  const content = ensureString(args[1], 'writeFileByRoot arg[1] (content)')
  if (!content || CONTROL_CHAR_PATTERN.test(content)) {
    helperExecutionFailed('writeFileByRoot content must be a non-empty single-line string')
  }
  return { targetPath, content }
}

function validateWriteBufferArgs(args: unknown[]): ValidatedWriteBufferArgs {
  ensureArgCount(args, 2, 'writeBufferBase64ByRoot')
  const targetPath = validateAbsoluteWindowsPath(
    ensureString(args[0], 'writeBufferBase64ByRoot arg[0] (targetPath)'),
    'writeBufferBase64ByRoot targetPath'
  )
  const base64Content = validateBase64(
    ensureString(args[1], 'writeBufferBase64ByRoot arg[1] (base64Content)'),
    'writeBufferBase64ByRoot base64Content'
  )
  return { targetPath, base64Content }
}

function validateRmArgs(args: unknown[]): string {
  ensureArgCount(args, 1, 'rm')
  return validateAbsoluteWindowsPath(ensureString(args[0], 'rm arg[0] (targetPath)'), 'rm targetPath')
}

function validateSetSystemPathArgs(args: unknown[]): ValidatedSetSystemPathArgs {
  ensureArgCount(args, 2, 'setSystemPath')
  if (!Array.isArray(args[0])) {
    helperExecutionFailed('setSystemPath arg[0] (paths) must be a string array')
  }
  const paths = args[0].map((entry, index) =>
    validatePathLikeEnvEntry(ensureString(entry, `setSystemPath paths[${index}]`), `setSystemPath paths[${index}]`)
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
  const value = validateSystemEnvValue(
    key,
    ensureString(args[1], 'setSystemEnv arg[1] (value)')
  )
  return { key, value }
}

function validateSetAutoStartArgs(args: unknown[]): ValidatedSetAutoStartArgs {
  ensureArgCount(args, 3, 'setAutoStartWin')
  if (typeof args[0] !== 'boolean') {
    helperExecutionFailed(`setAutoStartWin arg[0] (enabled) must be a boolean, got ${typeof args[0]}`)
  }
  const taskName = ensureString(args[1], 'setAutoStartWin arg[1] (taskName)')
  if (!ALLOWED_AUTO_START_TASKS.has(taskName)) {
    helperExecutionFailed(`invalid auto-start task name: ${taskName}`)
  }
  const exePath = validateAbsoluteWindowsPath(
    ensureString(args[2], 'setAutoStartWin arg[2] (exePath)'),
    'setAutoStartWin exePath'
  )
  const exeBasename = path.win32.basename(exePath).toLowerCase()
  if (!ALLOWED_AUTO_START_BASENAMES.has(exeBasename)) {
    helperExecutionFailed(`invalid auto-start executable: ${exeBasename}`)
  }
  return { enabled: args[0], taskName, exePath }
}

function validateSslAddTrustedCertArgs(args: unknown[]): ValidatedSslAddTrustedCertArgs {
  ensureArgCount(args, 2, 'sslAddTrustedCert')
  const cwd = validateAbsoluteWindowsPath(
    ensureString(args[0], 'sslAddTrustedCert arg[0] (cwd)'),
    'sslAddTrustedCert cwd'
  )
  try {
    accessSync(cwd, constants.R_OK)
  } catch {
    helperExecutionFailed(`sslAddTrustedCert cwd is not readable: ${cwd}`)
  }
  const caName = ensureString(args[1], 'sslAddTrustedCert arg[1] (caName)').trim()
  if (path.win32.basename(caName) !== caName || path.posix.basename(caName) !== caName) {
    helperExecutionFailed('sslAddTrustedCert caName must be a basename')
  }
  if (!CERT_NAME_PATTERN.test(caName)) {
    helperExecutionFailed(`invalid certificate name: ${caName}`)
  }
  return { cwd, caName }
}

function buildWriteFileScript(
  args: ValidatedWriteFileArgs,
  tempFilePath?: string
): string {
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

function buildWriteBufferScript(
  args: ValidatedWriteBufferArgs,
  tempFilePath?: string
): string {
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
  Remove-Item -LiteralPath $targetPath -Recurse -Force
}`
}

function buildSetSystemPathScript(args: ValidatedSetSystemPathArgs): string {
  const pathValue = `${args.paths.join(';')};`
  const otherVarLines = Object.entries(args.otherVars).map(([key, value]) => {
    if (value.includes('%')) {
      return `New-ItemProperty -LiteralPath ${powerShellString(MACHINE_ENV_REGISTRY_PATH)} -Name ${powerShellString(
        key
      )} -Value ${powerShellString(value)} -PropertyType ExpandString -Force | Out-Null`
    }
    return `New-ItemProperty -LiteralPath ${powerShellString(MACHINE_ENV_REGISTRY_PATH)} -Name ${powerShellString(
      key
    )} -Value ${powerShellString(value)} -PropertyType String -Force | Out-Null
Set-ItemProperty -LiteralPath ${powerShellString(MACHINE_ENV_REGISTRY_PATH)} -Name ${powerShellString(
      key
    )} -Value ${powerShellString(value)}`
  })
  return `${buildPowerShellPreamble()}
New-ItemProperty -LiteralPath ${powerShellString(MACHINE_ENV_REGISTRY_PATH)} -Name 'Path' -Value ${powerShellString(
    pathValue
  )} -PropertyType ExpandString -Force | Out-Null
${otherVarLines.join('\n')}
New-ItemProperty -LiteralPath ${powerShellString(MACHINE_ENV_REGISTRY_PATH)} -Name 'FLYENV_ENV_FLUSH' -Value '0' -PropertyType String -Force | Out-Null
Set-ItemProperty -LiteralPath ${powerShellString(MACHINE_ENV_REGISTRY_PATH)} -Name 'FLYENV_ENV_FLUSH' -Value '0'
${buildNotifyEnvironmentChangedScript()}`
}

function buildSetSystemEnvScript(args: ValidatedSetSystemEnvArgs): string {
  const writeValue = args.value.includes('%')
    ? `New-ItemProperty -LiteralPath ${powerShellString(MACHINE_ENV_REGISTRY_PATH)} -Name ${powerShellString(
        args.key
      )} -Value ${powerShellString(args.value)} -PropertyType ExpandString -Force | Out-Null`
    : `New-ItemProperty -LiteralPath ${powerShellString(MACHINE_ENV_REGISTRY_PATH)} -Name ${powerShellString(
        args.key
      )} -Value ${powerShellString(args.value)} -PropertyType String -Force | Out-Null
Set-ItemProperty -LiteralPath ${powerShellString(MACHINE_ENV_REGISTRY_PATH)} -Name ${powerShellString(
        args.key
      )} -Value ${powerShellString(args.value)}`
  return `${buildPowerShellPreamble()}
${writeValue}
${buildNotifyEnvironmentChangedScript()}`
}

function buildSetAutoStartScript(args: ValidatedSetAutoStartArgs): string {
  return `${buildPowerShellPreamble()}
$enabled = ${args.enabled ? '$true' : '$false'}
$taskName = ${powerShellString(args.taskName)}
$exePath = ${powerShellString(args.exePath)}
if ($enabled) {
  & schtasks.exe /create /tn $taskName /tr ('"' + $exePath + '"') /sc onlogon /rl highest /f | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "schtasks.exe /create failed with exit code $LASTEXITCODE"
  }
}
else {
  & schtasks.exe /delete /tn $taskName /f | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "schtasks.exe /delete failed with exit code $LASTEXITCODE"
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

function buildPlanFromScript(
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
    if (validated.content.length > inlineLimit) {
      const tempFilePath = buildTempFilePath('text')
      return buildPlanFromScript(
        buildWriteFileScript(validated, tempFilePath),
        'text',
        validated.content,
        tempFilePath
      )
    }
    return buildPlanFromScript(buildWriteFileScript(validated))
  }

  if (module === 'tools' && fn === 'writeBufferBase64ByRoot') {
    const validated = validateWriteBufferArgs(args)
    if (validated.base64Content.length > inlineLimit) {
      const tempFilePath = buildTempFilePath('base64')
      return buildPlanFromScript(
        buildWriteBufferScript(validated, tempFilePath),
        'base64',
        validated.base64Content,
        tempFilePath
      )
    }
    return buildPlanFromScript(buildWriteBufferScript(validated))
  }

  if (module === 'tools' && fn === 'rm') {
    return buildPlanFromScript(buildRmScript(validateRmArgs(args)))
  }

  if (module === 'tools' && fn === 'setSystemPath') {
    return buildPlanFromScript(buildSetSystemPathScript(validateSetSystemPathArgs(args)))
  }

  if (module === 'tools' && fn === 'setSystemEnv') {
    return buildPlanFromScript(buildSetSystemEnvScript(validateSetSystemEnvArgs(args)))
  }

  if (module === 'tools' && fn === 'setAutoStartWin') {
    return buildPlanFromScript(buildSetAutoStartScript(validateSetAutoStartArgs(args)))
  }

  if (module === 'host' && fn === 'sslAddTrustedCert') {
    return buildPlanFromScript(buildSslAddTrustedCertScript(validateSslAddTrustedCertArgs(args)))
  }

  fallbackNotSupported(module, fn)
}

export async function runWindowsHelperFallback(
  module: string,
  fn: string,
  args: unknown[]
): Promise<true> {
  await EnvSync.sync()
  const plan = buildWindowsHelperFallbackPlan(module, fn, args)

  try {
    if (plan.tempFilePath && plan.tempFileContent !== undefined) {
      await fs.writeFile(plan.tempFilePath, plan.tempFileContent, 'utf8')
    }
    await Sudo(plan.command, { name: 'FlyEnv' })
    return true
  } finally {
    if (plan.tempFilePath) {
      await fs.rm(plan.tempFilePath, { force: true }).catch(() => {})
    }
  }
}
