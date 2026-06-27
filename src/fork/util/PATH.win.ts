import { join, isAbsolute } from 'path'
import { ForkPromise } from '@shared/ForkPromise'
import { appDebugLog } from '@shared/utils'
import Helper from '../Helper'
import EnvSync from '@shared/EnvSync'
import { powerShellInlineArgs } from '@shared/PowerShellCommand'
import { spawnPromiseWithEnv } from '@shared/child-process'

type FetchRawPATHDeps = {
  readSystemPathDirect: () => Promise<string>
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
  const match = output.match(/^\s*Path\s+REG_[A-Z_]+\s+(.*)$/im)
  const value = match?.[1]?.trim()
  if (!value) {
    throw new Error('Failed to parse machine PATH from reg.exe output')
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
          windowsHide: true
        }
      )
      return res.stdout.toString().trim()
    } catch (error) {
      powerShellError = error
      appDebugLog('[readSystemPathDirect][powershell][error]', `${error}`).catch()
    }

    try {
      const res = await runtime.readWithSpawn(
        runtime.getRegistryToolPath(),
        ['query', MACHINE_ENV_REGISTRY_KEY, '/v', 'Path'],
        {
          windowsHide: true
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
      throw (registryError instanceof Error
        ? registryError
        : new Error(`${registryError}`))
    }
  }
}

export const readSystemPathDirect = createReadSystemPathDirect()

const parsePathString = (str: string): string[] => {
  str = str.replace(new RegExp(`\r\n`, 'g'), '').replace(new RegExp(`\n`, 'g'), '')
  if (!str.includes(':\\') && !str.includes('%')) {
    return []
  }
  return Array.from(new Set(str.split(';') ?? []))
    .filter((s: string) => !!s.trim())
    .map((s: string) => s.trim())
}

const defaultFetchRawPATHDeps: FetchRawPATHDeps = {
  readSystemPathDirect
}

export const createFetchRawPATH = (deps: Partial<FetchRawPATHDeps> = {}) => {
  const runtime = {
    ...defaultFetchRawPATHDeps,
    ...deps
  }

  return (useHelper = false): ForkPromise<string[]> => {
    return new ForkPromise(async (resolve, reject) => {
      console.log('fetchRawPATH !!!!!!')
      try {
        const str = await runtime.readSystemPathDirect()
        console.log('fetchRawPATH str: ', { str })
        resolve(parsePathString(str))
      } catch (directError) {
        console.log('fetchRawPATH direct read error: ', directError, useHelper)
        appDebugLog('[_fetchRawPATH][direct-error]', `${directError}`).catch()
        reject(directError instanceof Error ? directError : new Error(`${directError}`))
      }
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

export const writePath = async (path: string[], otherVars: Record<string, string> = {}) => {
  console.log('writePath paths: ', path)
  try {
    await Helper.send('tools', 'setSystemPath', path, otherVars)
  } catch (e) {
    console.log('writePath error: ', e)
    await appDebugLog('[writePath][error]', `${e}`)
    throw e
  }
}

export const addPath = async (dir: string) => {
  let allPath: string[] = []
  try {
    allPath = await fetchRawPATH(true)
  } catch {
    return
  }
  const index = allPath.indexOf(dir)
  if (index === 0) {
    return
  }
  if (index > 0) {
    allPath.splice(index, 1)
  }
  allPath.unshift(dir)
  const savePath = handleWinPathArr(allPath)
  try {
    await writePath(savePath)
  } catch {}
}
