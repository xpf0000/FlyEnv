import { startPerformanceConsoleTimer, endPerformanceConsoleTimer } from './PerformanceDiagnostics'
import { appDebugLog, isWindows } from '@shared/utils'
import { shellEnv } from 'shell-env'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { win32, join } from 'node:path'
import * as process from 'node:process'
import JSON5 from 'json5'
import { powerShellInlineArgs } from './PowerShellCommand'
import {
  resolveWindowsPowerShellPath,
  resolveWindowsSystemExecutable,
  windowsPowerShellPath,
  windowsSystemDirectory
} from './WindowsSystemPaths'

const execFilePromise = promisify(execFile)

const WINDOWS_ENV_FETCH_TIMEOUT_MS = 60_000

export const WINDOWS_ENV_SCRIPT = `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$userVars = [Environment]::GetEnvironmentVariables('User')
$machineVars = [Environment]::GetEnvironmentVariables('Machine')

$result = @{}
foreach ($key in $machineVars.Keys) { $result[$key] = $machineVars[$key] }
foreach ($key in $userVars.Keys) { $result[$key] = $userVars[$key] }

$mPath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
$uPath = [Environment]::GetEnvironmentVariable('Path', 'User')
$mPaths = if ($mPath) { $mPath.Split(';') } else { @() }
$uPaths = if ($uPath) { $uPath.Split(';') } else { @() }
$combinedPath = ($mPaths + $uPaths) | Where-Object { $_ } | Select-Object -Unique
$rawPath = $combinedPath -join ';'

foreach ($key in @($result.Keys)) {
  $value = $result[$key]
  if ($value -is [string]) {
    [Environment]::SetEnvironmentVariable($key, $value, 'Process')
  }
}

$result['PATH'] = $rawPath

foreach ($key in @($result.Keys)) {
  $value = $result[$key]
  if ($value -is [string] -and $value -match '%[^%]+%') {
    $expandedValue = [Environment]::ExpandEnvironmentVariables($value)
    $result[$key] = $expandedValue
    [Environment]::SetEnvironmentVariable($key, $expandedValue, 'Process')
  }
}

$result | ConvertTo-Json -Compress`

export type EnvSyncLocalResult = {
  env: Record<string, string>
  cmdPath?: string
  powerShellPath?: string
  systemPath?: string
}

const stringEnv = (value: NodeJS.ProcessEnv | Record<string, unknown>) => {
  const result: Record<string, string> = {}
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined) result[key] = String(item)
  }
  return result
}

export const buildUnixPath = (currentPath: string, home?: string) => {
  const paths = [
    ...currentPath.split(':'),
    '/opt/podman/bin',
    '/home/linuxbrew/.linuxbrew/bin',
    ...(home ? [join(home, '.linuxbrew/bin')] : []),
    '/opt',
    '/opt/homebrew/bin',
    '/opt/homebrew/sbin',
    '/usr/local/Homebrew/bin',
    '/opt/local/bin',
    '/opt/local/sbin',
    '/usr/local/bin',
    '/usr/bin',
    '/usr/sbin'
  ]
  const expanded = paths.map((item) => {
    const path = item.trim()
    return home ? path.replace(/^\$(?:HOME|\{HOME\})(?=\/|$)/, home) : path
  })
  return Array.from(new Set(expanded.filter((item) => item.length > 0))).join(':')
}

export const buildWindowsSyncedPath = (registryPath: string, bootstrapEntries: readonly string[]) =>
  [...bootstrapEntries, registryPath].join(';')

class EnvSyncLocalLoader {
  private cmdPath?: string
  private powerShellPath?: string
  private systemPath?: string

  private findEnv(env: Record<string, string>, key: string): string | undefined {
    const lowKey = key.toLowerCase()
    for (const [envKey, value] of Object.entries(env)) {
      if (envKey.toLowerCase() === lowKey) return value
    }
    return undefined
  }

  private async getWindowsAllEnv(): Promise<Record<string, string>> {
    let stdout = ''
    // 环境同步是权限操作的间接前置：定位程序本身不能依赖待同步的 PATH，
    // 也不能让用户注册表中的 ComSpec/SystemRoot 改变实际系统目录。
    this.systemPath = windowsSystemDirectory()

    try {
      const result: any = await execFilePromise(
        resolveWindowsPowerShellPath(),
        powerShellInlineArgs(WINDOWS_ENV_SCRIPT),
        {
          encoding: 'utf8',
          windowsHide: true,
          // 环境同步自身使用内置模块，避免继承的 PSModulePath 覆盖系统命令。
          env: {
            ...process.env,
            PSModulePath: win32.join(win32.dirname(windowsPowerShellPath()), 'Modules')
          },
          timeout: WINDOWS_ENV_FETCH_TIMEOUT_MS,
          maxBuffer: 10 * 1024 * 1024
        }
      )
      stdout = `${result?.stdout ?? ''}`.trim()
    } catch (error) {
      console.error('[EnvSync] Failed to fetch Windows env from inline PowerShell:', error)
      appDebugLog('[EnvSync][getWindowsAllEnv][error]', `${error}`).catch()
      return stringEnv(process.env)
    }
    if (!stdout) return stringEnv(process.env)

    try {
      return stringEnv(JSON5.parse(stdout))
    } catch {}
    try {
      return stringEnv(JSON.parse(stdout))
    } catch {
      appDebugLog(
        '[EnvSync][getWindowsAllEnv][parse][error]',
        'PowerShell output was not valid JSON'
      ).catch()
      return stringEnv(process.env)
    }
  }

  private fetchWinPaths() {
    // 缺失保留 undefined：纯 Node 操作仍可用，真正需要系统程序的入口明确失败。
    // 不把不存在的文件、PowerShell 7 或 PATH 中的同名程序冒充系统 Windows PowerShell。
    try {
      this.cmdPath = resolveWindowsSystemExecutable('cmd.exe')
    } catch {}
    try {
      this.powerShellPath = resolveWindowsPowerShellPath()
    } catch {}
  }

  private async fetchWindows(): Promise<EnvSyncLocalResult> {
    startPerformanceConsoleTimer('EnvSync getWindowsAllEnv')
    let lastEnv: Record<string, string> = {}
    try {
      lastEnv = await this.getWindowsAllEnv()
    } catch {}
    endPerformanceConsoleTimer('EnvSync getWindowsAllEnv')

    const path = buildWindowsSyncedPath(this.findEnv(lastEnv, 'PATH') ?? '', [
      this.systemPath ?? windowsSystemDirectory(),
      win32.dirname(windowsPowerShellPath()),
      'C:\\Program Files\\RedHat\\Podman'
    ])

    const env = stringEnv({ ...process.env, ...lastEnv, PATH: path, Path: path })
    this.fetchWinPaths()
    return {
      env,
      cmdPath: this.cmdPath,
      powerShellPath: this.powerShellPath,
      systemPath: this.systemPath
    }
  }

  async fetch(): Promise<EnvSyncLocalResult> {
    if (isWindows()) return this.fetchWindows()
    const env = stringEnv(await shellEnv())
    const home = env.HOME ?? process.env.HOME
    env.PATH = buildUnixPath(env.PATH ?? '', home)
    return { env }
  }
}

export const fetchEnvSyncLocal = () => new EnvSyncLocalLoader().fetch()
