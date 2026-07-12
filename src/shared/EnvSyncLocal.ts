import { appDebugLog, isWindows } from '@shared/utils'
import { shellEnv } from 'shell-env'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { dirname, isAbsolute, join } from 'node:path'
import { existsSync } from 'node:fs'
import * as process from 'node:process'
import JSON5 from 'json5'
import { powerShellInlineArgs } from './PowerShellCommand'

const execFilePromise = promisify(execFile)

export const WINDOWS_ENV_SCRIPT = `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$userVars = [Environment]::GetEnvironmentVariables('User')
$machineVars = [Environment]::GetEnvironmentVariables('Machine')

$result = @{}
foreach ($key in $machineVars.Keys) { $result[$key] = $machineVars[$key] }
foreach ($key in $userVars.Keys) { $result[$key] = $userVars[$key] }

$mPath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
$uPath = [Environment]::GetEnvironmentVariable('Path', 'User')
$combinedPath = ($mPath.Split(';') + $uPath.Split(';')) | Where-Object { $_ } | Select-Object -Unique
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

class EnvSyncLocalLoader {
  private cmdPath?: string
  private powerShellPath?: string
  private systemPath?: string

  private findProcessEnv(key: string): string | undefined {
    const lowKey = key.toLowerCase()
    for (const [envKey, value] of Object.entries(process.env)) {
      if (envKey.toLowerCase() === lowKey) return value
    }
    return undefined
  }

  private async getWindowsAllEnv(): Promise<Record<string, string>> {
    let stdout = ''
    const cmdDefault = 'C:\\Windows\\System32\\cmd.exe'
    const comSpec = this.findProcessEnv('ComSpec')
    const systemRoot = this.findProcessEnv('SystemRoot')
    if (comSpec) {
      this.systemPath = dirname(comSpec)
    } else if (systemRoot) {
      this.systemPath = join(systemRoot, 'System32')
    } else if (existsSync(cmdDefault)) {
      this.systemPath = dirname(cmdDefault)
    } else {
      this.systemPath = 'C:\\Windows\\System32'
    }

    const powershellDefault = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
    let powershell = 'powershell.exe'
    if (systemRoot) {
      powershell = join(systemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe')
    } else if (existsSync(powershellDefault)) {
      powershell = powershellDefault
    }

    try {
      const result: any = await execFilePromise(
        powershell,
        powerShellInlineArgs(WINDOWS_ENV_SCRIPT),
        {
          encoding: 'utf8',
          windowsHide: true,
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

  private fetchWinPaths(env: Record<string, string>) {
    const cmdPath = 'C:\\Windows\\System32\\cmd.exe'
    if (existsSync(cmdPath)) {
      this.cmdPath = cmdPath
    } else if (env.ComSpec && existsSync(env.ComSpec)) {
      this.cmdPath = env.ComSpec
    } else if (env.SystemRoot && existsSync(env.SystemRoot)) {
      this.cmdPath = join(env.SystemRoot, 'System32/cmd.exe')
    } else {
      for (const [key, value] of Object.entries(env)) {
        const lowKey = key.toLowerCase()
        if (lowKey === 'comspec' && existsSync(value)) {
          this.cmdPath = value
          break
        }
        if (lowKey === 'systemroot' && existsSync(value)) {
          this.cmdPath = join(value, 'System32/cmd.exe')
          break
        }
      }
    }

    const powershellPath = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
    if (existsSync(powershellPath)) {
      this.powerShellPath = powershellPath
      return
    }
    for (const [key, value] of Object.entries(env)) {
      const lowKey = key.toLowerCase()
      if (lowKey === 'systemroot' && existsSync(value)) {
        this.powerShellPath = join(value, 'System32/WindowsPowerShell/v1.0/powershell.exe')
        return
      }
      if (lowKey === 'programfiles' && existsSync(value)) {
        this.powerShellPath = join(value, 'PowerShell/7/pwsh.exe')
        return
      }
      if (lowKey === 'programfiles(x86)' && existsSync(value)) {
        this.powerShellPath = join(value, 'PowerShell/7/pwsh.exe')
        return
      }
    }
  }

  private async fetchWindows(): Promise<EnvSyncLocalResult> {
    console.time('EnvSync getWindowsAllEnv')
    let lastEnv: Record<string, string> = {}
    try {
      lastEnv = await this.getWindowsAllEnv()
    } catch {}
    console.timeEnd('EnvSync getWindowsAllEnv')

    const keys = ['PATH', 'Path', 'path']
    const paths: string[] = []
    for (const key of keys) {
      lastEnv[key]?.split(';').forEach((item) => {
        const path = item.trim()
        if (path) paths.push(path)
      })
    }
    for (const key of keys) {
      process.env[key]?.split(';').forEach((item) => {
        const path = item.trim()
        if (path) paths.push(path)
      })
    }

    const extent = `C:\\Program Files\\RedHat\\Podman;C:\\Windows\\System32\\WindowsPowerShell\\v1.0;${this.systemPath ?? 'C:\\Windows\\System32'}`
    extent.split(';').forEach((item) => {
      const path = item.trim()
      if (path) paths.unshift(path)
    })

    const path = Array.from(new Set(paths))
      .map((item) => item.trim())
      .filter((item) => {
        if (!item) return false
        if (/%[^%]+%/.test(item) || item.includes('$env:')) return true
        return isAbsolute(item)
      })
      .join(';')

    const env = stringEnv({ ...process.env, ...lastEnv, PATH: path, Path: path })
    this.fetchWinPaths(env)
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
    const PATH = `${env.PATH ?? ''}:/opt/podman/bin:/home/linuxbrew/.linuxbrew/bin:$HOME/.linuxbrew/bin:/opt:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/Homebrew/bin:/opt/local/bin:/opt/local/sbin:/usr/local/bin:/usr/bin:/usr/sbin`
    env.PATH = Array.from(new Set(PATH.split(':'))).join(':')
    return { env }
  }
}

export const fetchEnvSyncLocal = () => new EnvSyncLocalLoader().fetch()
