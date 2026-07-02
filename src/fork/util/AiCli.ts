import { existsSync as defaultExistsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, win32 } from 'node:path'
import EnvSync from '../../shared/EnvSync'
import { execPromiseWithEnv as defaultExecPromiseWithEnv } from '../../shared/child-process'
import { isWindows as runtimeIsWindows } from '../../shared/utils'

type ResolveAiCliDeps = {
  isWindows?: boolean
  env?: NodeJS.ProcessEnv
  homeDir?: string
  extraCandidates?: string[]
  existsSync?: (path: string) => boolean
}

type CheckAiCliDeps = ResolveAiCliDeps & {
  cleanEnv?: () => void
  execPromiseWithEnv?: (
    command: string,
    opt?: { [k: string]: any }
  ) => Promise<{
    stdout: string
    stderr: string
  }>
  versionArgs?: string
}

function pushUnique(list: string[], value?: string) {
  const trimmed = value?.trim()
  if (!trimmed || list.includes(trimmed)) {
    return
  }
  list.push(trimmed)
}

function quoteShellCommand(command: string): string {
  if (!/[\\/\s]/.test(command)) {
    return command
  }
  return `"${command.replace(/"/g, '\\"')}"`
}

export function buildAiCliBinCandidates(binName: string, deps: ResolveAiCliDeps = {}): string[] {
  const windows = deps.isWindows ?? runtimeIsWindows()
  const env = deps.env ?? process.env
  const home = deps.homeDir ?? env.HOME ?? env.USERPROFILE ?? homedir()
  const candidates: string[] = []

  if (windows) {
    const userProfile = env.USERPROFILE ?? home
    const appData =
      env.APPDATA ?? (userProfile ? win32.join(userProfile, 'AppData', 'Roaming') : '')
    const localAppData =
      env.LOCALAPPDATA ?? (userProfile ? win32.join(userProfile, 'AppData', 'Local') : '')

    if (appData) {
      pushUnique(candidates, win32.join(appData, 'npm', `${binName}.cmd`))
      pushUnique(candidates, win32.join(appData, 'npm', `${binName}.exe`))
      pushUnique(candidates, win32.join(appData, 'npm', binName))
    }
    if (localAppData) {
      pushUnique(
        candidates,
        win32.join(localAppData, 'Microsoft', 'WinGet', 'Links', `${binName}.exe`)
      )
      pushUnique(
        candidates,
        win32.join(localAppData, 'Microsoft', 'WinGet', 'Links', `${binName}.cmd`)
      )
      pushUnique(candidates, win32.join(localAppData, 'Microsoft', 'WinGet', 'Links', binName))
    }
    if (userProfile) {
      pushUnique(candidates, win32.join(userProfile, '.local', 'bin', `${binName}.exe`))
      pushUnique(candidates, win32.join(userProfile, '.local', 'bin', `${binName}.cmd`))
      pushUnique(candidates, win32.join(userProfile, '.local', 'bin', binName))
    }
  } else {
    pushUnique(candidates, `/usr/local/bin/${binName}`)
    pushUnique(candidates, `/usr/bin/${binName}`)
    pushUnique(candidates, `/opt/homebrew/bin/${binName}`)
    pushUnique(candidates, `/opt/local/bin/${binName}`)
    pushUnique(candidates, join(home, '.local', 'bin', binName))
    pushUnique(candidates, join(home, 'bin', binName))
    pushUnique(candidates, join(home, '.npm-global', 'bin', binName))
    pushUnique(candidates, join(home, '.yarn', 'bin', binName))
    pushUnique(candidates, join(home, '.volta', 'bin', binName))
    pushUnique(candidates, join(home, '.local', 'share', 'pnpm', binName))
    pushUnique(candidates, join(home, 'Library', 'pnpm', binName))
    pushUnique(candidates, join(home, '.bun', 'bin', binName))
  }

  deps.extraCandidates?.forEach((item) => pushUnique(candidates, item))
  return candidates
}

export function resolveAiCliCommand(binName: string, deps: ResolveAiCliDeps = {}): string {
  const existsSync = deps.existsSync ?? defaultExistsSync
  const candidates = buildAiCliBinCandidates(binName, deps)
  const resolved = candidates.find((candidate) => existsSync(candidate)) ?? binName
  return quoteShellCommand(resolved)
}

export function resolveAiCliTerminalCommand(binName: string, deps: ResolveAiCliDeps = {}): string {
  const windows = deps.isWindows ?? runtimeIsWindows()
  const existsSync = deps.existsSync ?? defaultExistsSync
  const candidates = buildAiCliBinCandidates(binName, deps)
  const resolved = candidates.find((candidate) => existsSync(candidate)) ?? binName
  const quoted = quoteShellCommand(resolved)
  if (windows && quoted !== binName) {
    return `& ${quoted}`
  }
  return quoted
}

export async function checkAiCliVersion(binName: string, deps: CheckAiCliDeps = {}): Promise<string> {
  const cleanEnv = deps.cleanEnv ?? (() => EnvSync.clean())
  const execPromiseWithEnv = deps.execPromiseWithEnv ?? defaultExecPromiseWithEnv
  const existsSync = deps.existsSync ?? defaultExistsSync
  const versionArgs = deps.versionArgs ?? '--version'
  const attempts = [binName]

  cleanEnv()

  for (const candidate of buildAiCliBinCandidates(binName, deps)) {
    if (existsSync(candidate)) {
      pushUnique(attempts, quoteShellCommand(candidate))
    }
  }

  for (const candidate of attempts) {
    try {
      const res = await execPromiseWithEnv(`${candidate} ${versionArgs}`, {
        windowsHide: true
      })
      const output = `${res.stdout ?? ''}${res.stderr ?? ''}`.trim()
      if (output) {
        return output
      }
    } catch {}
  }

  return ''
}
