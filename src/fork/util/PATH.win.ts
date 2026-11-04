import { isAbsolute, win32 } from 'path'
import { ForkPromise } from '@shared/ForkPromise'
import { appDebugLog } from '@shared/utils'
import Helper from '../Helper'
import EnvSync from '@shared/EnvSync'
import { powerShellInlineArgs } from '@shared/PowerShellCommand'
import { spawnPromiseWithEnv } from '@shared/child-process'
import {
  resolveWindowsPowerShellPath,
  resolveWindowsSystemExecutable,
  windowsPowerShellEnv
} from '@shared/WindowsSystemPaths'
import { timeOperation } from '@shared/OperationTiming'
import { bindWindowsPathLogger, logWindowsPath } from '@shared/WindowsPathDiagnostics'

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

const getDefaultPowerShellPath = () => {
  // 只读 PATH 快照同样固定系统程序，不依赖刚被用户编辑的 PATH 或同步 shell。
  return resolveWindowsPowerShellPath()
}

const getDefaultRegistryToolPath = () => {
  // PowerShell 缺失/策略失败时保留 reg.exe 回退，但它也必须是完整系统路径。
  return resolveWindowsSystemExecutable('reg.exe')
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
    // 复用 spawnPromiseWithEnv 已有观测回调，区分 Node 启动等待和系统程序运行；不改命令。
    const log = bindWindowsPathLogger()
    const spawnTiming = (tool: string) => ({
      onSpawn: (durationMs: number) => log('path.snapshot-process-spawned', { tool, durationMs }),
      onExit: (details: {
        code: number | null
        durationMs: number
        stdoutBytes: number
        stderrBytes: number
      }) => log('path.snapshot-process-exited', { tool, ...details }),
      onError: (details: { durationMs: number; error: Error }) =>
        log('path.snapshot-process-failed', { tool, durationMs: details.durationMs })
    })
    // 包含缓存命中/实际环境同步；不删除原依赖来人为缩短测试调用链。
    await timeOperation('path.snapshot-env-sync', () => runtime.syncEnv()).catch(() => undefined)

    let powerShellError: unknown
    try {
      const res = await timeOperation('path.snapshot-powershell', () =>
        runtime.readWithSpawn(
          runtime.getPowerShellPath(),
          powerShellInlineArgs(readSystemPathPowerShellScript),
          {
            windowsHide: true,
            env: windowsPowerShellEnv(),
            trimOutput: false,
            timing: spawnTiming('powershell')
          }
        )
      )
      return removePowerShellFinalNewline(res.stdout.toString())
    } catch (error) {
      powerShellError = error
      appDebugLog('[readSystemPathDirect][powershell][error]', `${error}`).catch()
    }

    try {
      const res = await timeOperation('path.snapshot-registry-fallback', () =>
        runtime.readWithSpawn(
          runtime.getRegistryToolPath(),
          ['query', MACHINE_ENV_REGISTRY_KEY, '/v', 'Path'],
          {
            windowsHide: true,
            trimOutput: false,
            timing: spawnTiming('reg')
          }
        )
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
  // 只记录计数、键名和保护条件；新增日志不输出原始 PATH 或环境变量值。
  logWindowsPath('path.write-request', {
    entryCount: path.length,
    otherVarNames: Object.keys(otherVars),
    compareAndSet: expectedRawPath !== undefined
  })
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
  // 只有实际 PATH（及配套环境变量）写入成功后才失效缓存。Helper.send 的成功
  // 边界统一覆盖管理员/UAC/Go Helper/旧 fallback，不在通用 RPC 层判断业务。
  // clean 在调用时立即清本地快照并登记共享失效；不等待回执、不主动 sync，
  // 后续真正读取环境时由 sync 等待内部失效屏障，失败诊断不能重放已完成的写入。
  void timeOperation('path.invalidate-env', () => EnvSync.clean()).catch(() => {})
}

export const addPath = async (dir: string): Promise<boolean> => {
  // 仅第一次 PATH 原值冲突允许继续；第二次尝试一定返回布尔值或抛出原错误。
  // 终止条件由下面的 catch 控制，避免有限 for 循环留下隐式返回 undefined 的路径。
  for (let attempt = 0; ; attempt += 1) {
    const snapshot = await fetchRawPATHSnapshot(true)
    const savePath = mergeWindowsPathPriority(snapshot.entries, [dir])

    if (
      savePath.length === snapshot.entries.length &&
      savePath.every((entry, index) => entry === snapshot.entries[index])
    ) {
      // 区分无需写入与已提交，实际业务调用据此决定结算后是否需要环境通知。
      return false
    }

    try {
      await writePath(savePath, {}, snapshot.rawPath)
      // 不在工具函数提前通知；由 alias/Android 等完整业务结算之后触发。
      return true
    } catch (error) {
      if (attempt === 0 && isSystemPathChangedError(error)) {
        continue
      }
      throw error
    }
  }
}
