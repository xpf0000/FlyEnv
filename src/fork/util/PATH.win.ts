import { join, isAbsolute, win32 } from 'path'
import { ForkPromise } from '@shared/ForkPromise'
import { appDebugLog } from '@shared/utils'
import Helper from '../Helper'
import EnvSync from '@shared/EnvSync'
import { powerShellInlineArgs } from '@shared/PowerShellCommand'
import { spawnPromiseWithEnv } from '@shared/child-process'

type FetchRawPATHDeps = {
  readSystemPathDirect: () => Promise<string>
}

export interface WindowsPathSnapshot {
  rawPath: string
  entries: string[]
}

type ReadSystemPathDirectDeps = {
  syncEnv: typeof EnvSync.sync
  getPowerShellPath: () => string
  getRegistryToolPath: () => string
  readWithSpawn: typeof spawnPromiseWithEnv
}

const MACHINE_ENV_REGISTRY_KEY =
  'HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment'

const readSystemPathPowerShellScript = `$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
$registryKey = [Microsoft.Win32.Registry]::LocalMachine.OpenSubKey('SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment')
try {
  [string]$registryKey.GetValue('Path', '', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
}
finally {
  if ($registryKey) {
    $registryKey.Close()
  }
}`

const getDefaultSystemPath = () => {
  return EnvSync.SystemPath || join(process.env.SystemRoot || 'C:\\Windows', 'System32')
}

const getDefaultPowerShellPath = () => {
  return (
    EnvSync.PowerShellPath ||
    join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe')
  )
}

const getDefaultRegistryToolPath = () => {
  return join(getDefaultSystemPath(), 'reg.exe')
}

const parseRegistryPathQueryOutput = (output: string): string => {
  const match = output.match(/^\s*Path\s+REG_[A-Z_]+(?: {4}|\t+)(.*)$/im)
  if (!match) {
    throw new Error('Failed to parse machine PATH from reg.exe output')
  }
  return match[1]
}

const removePowerShellFinalNewline = (value: string): string => {
  if (value.endsWith('\r\n')) {
    return value.slice(0, -2)
  }
  if (value.endsWith('\n')) {
    return value.slice(0, -1)
  }
  return value
}

const defaultReadSystemPathDirectDeps: ReadSystemPathDirectDeps = {
  syncEnv: EnvSync.sync.bind(EnvSync),
  getPowerShellPath: getDefaultPowerShellPath,
  getRegistryToolPath: getDefaultRegistryToolPath,
  readWithSpawn: spawnPromiseWithEnv
}

export const createReadSystemPathDirect = (deps: Partial<ReadSystemPathDirectDeps> = {}) => {
  const runtime = {
    ...defaultReadSystemPathDirectDeps,
    ...deps
  }

  return async (): Promise<string> => {
    await runtime.syncEnv().catch(() => undefined)

    let powerShellError: unknown
    try {
      const res = await runtime.readWithSpawn(
        runtime.getPowerShellPath(),
        powerShellInlineArgs(readSystemPathPowerShellScript),
        {
          windowsHide: true,
          trimOutput: false
        }
      )
      return removePowerShellFinalNewline(res.stdout.toString())
    } catch (error) {
      powerShellError = error
      appDebugLog('[readSystemPathDirect][powershell][error]', `${error}`).catch()
    }

    try {
      const res = await runtime.readWithSpawn(
        runtime.getRegistryToolPath(),
        ['query', MACHINE_ENV_REGISTRY_KEY, '/v', 'Path'],
        {
          windowsHide: true,
          trimOutput: false
        }
      )
      return parseRegistryPathQueryOutput(res.stdout.toString())
    } catch (registryError) {
      appDebugLog(
        '[readSystemPathDirect][registry][error]',
        `${JSON.stringify({
          powerShellError: `${powerShellError}`,
          registryError: `${registryError}`
        })}`
      ).catch()
      throw registryError instanceof Error ? registryError : new Error(`${registryError}`)
    }
  }
}

export const readSystemPathDirect = createReadSystemPathDirect()

export const splitWindowsPathEntries = (rawPath: string): string[] => rawPath.split(';')

export const joinWindowsPathEntries = (entries: string[]): string => entries.join(';')

const getWindowsPathEntryIdentity = (entry: string): string => {
  if (!entry) {
    return entry
  }
  const normalized = win32.normalize(entry)
  const root = win32.parse(normalized).root
  return (normalized === root ? normalized : normalized.replace(/[\\/]+$/, '')).toLowerCase()
}

/**
 * Moves only the paths requested by the caller to the front. Every unrelated
 * entry retains its original value, order, duplicates, and empty segments.
 */
export const mergeWindowsPathPriority = (
  currentEntries: string[],
  priorityEntries: string[]
): string[] => {
  const priorityKeys = new Set<string>()
  const prioritized: string[] = []

  for (const entry of priorityEntries) {
    const key = getWindowsPathEntryIdentity(entry)
    if (priorityKeys.has(key)) {
      continue
    }
    priorityKeys.add(key)
    prioritized.push(entry)
  }

  return [
    ...prioritized,
    ...currentEntries.filter((entry) => !priorityKeys.has(getWindowsPathEntryIdentity(entry)))
  ]
}

export const isSystemPathChangedError = (error: unknown): boolean => {
  if (error === 'system_path_changed') {
    return true
  }
  if (!error || typeof error !== 'object') {
    return false
  }

  const { code, message } = error as { code?: unknown; message?: unknown }
  return code === 'system_path_changed' || message === 'system_path_changed'
}

const defaultFetchRawPATHDeps: FetchRawPATHDeps = {
  readSystemPathDirect
}

export const createFetchRawPATHSnapshot = (deps: Partial<FetchRawPATHDeps> = {}) => {
  const runtime = {
    ...defaultFetchRawPATHDeps,
    ...deps
  }

  return (useHelper = false): ForkPromise<WindowsPathSnapshot> => {
    return new ForkPromise(async (resolve, reject) => {
      console.log('fetchRawPATH !!!!!!')
      try {
        const rawPath = await runtime.readSystemPathDirect()
        console.log('fetchRawPATH str: ', { rawPath })
        resolve({
          rawPath,
          entries: splitWindowsPathEntries(rawPath)
        })
      } catch (directError) {
        console.log('fetchRawPATH direct read error: ', directError, useHelper)
        appDebugLog('[_fetchRawPATH][direct-error]', `${directError}`).catch()
        reject(directError instanceof Error ? directError : new Error(`${directError}`))
      }
    })
  }
}

export const fetchRawPATHSnapshot = createFetchRawPATHSnapshot()

export const createFetchRawPATH = (deps: Partial<FetchRawPATHDeps> = {}) => {
  const fetchSnapshot = createFetchRawPATHSnapshot(deps)

  return (useHelper = false): ForkPromise<string[]> => {
    return new ForkPromise((resolve, reject) => {
      fetchSnapshot(useHelper).then(
        (snapshot) => resolve(snapshot.entries),
        (error) => reject(error)
      )
    })
  }
}

export const fetchRawPATH = createFetchRawPATH()

export const handleWinPathArr = (paths: string[]) => {
  return Array.from(new Set(paths))
    .map((p) => {
      return p.trim()
    })
    .filter((p) => {
      if (!p) {
        return false
      }
      return isAbsolute(p) || p.includes('%')
    })
    .sort((a, b) => {
      // 判断a的类型
      const aType = isAbsolute(a) ? 1 : a.startsWith('%SystemRoot%') ? 2 : a.includes('%') ? 3 : 4
      // 判断b的类型
      const bType = isAbsolute(b) ? 1 : b.startsWith('%SystemRoot%') ? 2 : b.includes('%') ? 3 : 4
      // 比较优先级
      return aType - bType
    })
}

export const writePath = async (
  path: string[],
  otherVars: Record<string, string> = {},
  expectedRawPath?: string
) => {
  console.log('writePath paths: ', path)
  try {
    if (expectedRawPath === undefined) {
      await Helper.send('tools', 'setSystemPath', path, otherVars)
    } else {
      await Helper.send('tools', 'setSystemPath', path, otherVars, expectedRawPath)
    }
  } catch (e) {
    console.log('writePath error: ', e)
    await appDebugLog('[writePath][error]', `${e}`)
    throw e
  }
}

export const addPath = async (dir: string) => {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const snapshot = await fetchRawPATHSnapshot(true)
    const savePath = mergeWindowsPathPriority(snapshot.entries, [dir])

    if (
      savePath.length === snapshot.entries.length &&
      savePath.every((entry, index) => entry === snapshot.entries[index])
    ) {
      return
    }

    try {
      await writePath(savePath, {}, snapshot.rawPath)
      return
    } catch (error) {
      if (attempt === 0 && isSystemPathChangedError(error)) {
        continue
      }
      throw error
    }
  }
}
