import { lstatSync, statSync, type Stats } from 'fs'
import { symlink } from 'node:fs/promises'
import EnvSync from '@shared/EnvSync'
import {
  fetchRawPATH,
  existsSync,
  mkdirp,
  readdir,
  realpathSync,
  removeByRoot,
  writeFile
} from '../../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { resolveWindowsPowerShellPath, windowsPowerShellEnv } from '@shared/WindowsSystemPaths'
import { encodePowerShellCommand } from '@shared/PowerShellCommand'
import { timeOperation, timeOperationSync } from '@shared/OperationTiming'
import { logWindowsPath } from '@shared/WindowsPathDiagnostics'
import { notifyWindowsEnvironmentChanged } from '@shared/WindowsEnvironmentBroadcast'
import { dirname, isAbsolute, join, win32 } from 'path'
import type { SoftInstalled } from '@shared/app'
import {
  fetchRawPATHSnapshot,
  isSystemPathChangedError,
  mergeWindowsPathPriority,
  writePath,
  type WindowsPathSnapshot
} from '../../util/PATH.win'

const isWindowsPathContainedBy = (candidate: string, root: string): boolean => {
  const normalizedCandidate = win32.resolve(candidate).toLowerCase()
  const normalizedRoot = win32.resolve(root).toLowerCase()
  const relative = win32.relative(normalizedRoot, normalizedCandidate)

  if (relative === '') {
    return true
  }

  const firstSegment = relative.split(/[\\/]/u)[0]
  return firstSegment !== '..' && !win32.isAbsolute(relative)
}

/**
 * Returns whether an absolute PATH entry belongs to a FlyEnv-managed root.
 * Existing paths are resolved together so junction targets are compared only
 * when both sides can be resolved safely.
 */
export const isFlyEnvManagedPathEntry = (entry: string, root: string): boolean => {
  if (!win32.isAbsolute(entry) || !win32.isAbsolute(root)) {
    return false
  }

  if (existsSync(entry) && existsSync(root)) {
    try {
      return isWindowsPathContainedBy(realpathSync(entry), realpathSync(root))
    } catch {}
  }

  return isWindowsPathContainedBy(entry, root)
}

/**
 * On Windows, lstat marks both directory junctions and symbolic links as
 * symbolic links. Plain directories under FlyEnv's env directory are not
 * FlyEnv-managed PATH roots.
 */
export const isWindowsJunctionOrSymlink = (
  stats: Pick<Stats, 'isSymbolicLink'>,
  platform: string = process.platform
): boolean => {
  return platform === 'win32' && stats.isSymbolicLink()
}

export function fetchPATH(): ForkPromise<any> {
  return new ForkPromise(async (resolve) => {
    const res: any = {
      allPath: [],
      appPath: []
    }
    const pathArr = await timeOperation('path.list-read-system-path', () => fetchRawPATH())
    // 同步文件系统扫描也可能等待慢盘；单独测量，不能全部归到注册表查询。
    const allPath = timeOperationSync('path.list-resolve-system-entries', () =>
      pathArr
        .filter((f) => existsSync(f))
        .map((f) => realpathSync(f))
        .filter((f) => existsSync(f) && statSync(f).isDirectory())
    )
    res.allPath = Array.from(new Set(allPath))

    const dir = join(dirname(global.Server.AppDir!), 'env')
    if (existsSync(dir)) {
      let allFile = await timeOperation('path.list-read-env-directory', () => readdir(dir))
      allFile = timeOperationSync('path.list-resolve-app-entries', () =>
        allFile
          .filter((f) => existsSync(join(dir, f)))
          .map((f) => realpathSync(join(dir, f)))
          .filter((f) => existsSync(f) && statSync(f).isDirectory())
      )
      res.appPath = Array.from(new Set(allFile))
    }
    logWindowsPath('path.list-completed', {
      systemCount: res.allPath.length,
      appCount: res.appPath.length
    })
    resolve(res)
  })
}

type FlyEnvJunction = {
  name: string
  root: string
  isJunction: true
  resolvedRoot?: string
}

export type FlyEnvPreferredRoot = {
  name: string
  root: string
  isJunction: boolean
  resolvedRoot?: string
}

const compareRootNames = (a: FlyEnvPreferredRoot, b: FlyEnvPreferredRoot): number => {
  const aName = a.name.toLowerCase()
  const bName = b.name.toLowerCase()
  if (aName < bName) {
    return -1
  }
  if (aName > bName) {
    return 1
  }
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0
}

export const readFlyEnvJunctions = async (
  envDir: string,
  platform: string = process.platform
): Promise<FlyEnvJunction[]> => {
  if (!existsSync(envDir)) {
    return []
  }

  const names = await readdir(envDir)
  const junctions: FlyEnvJunction[] = []

  for (const name of names) {
    const root = join(envDir, name)
    try {
      if (!isWindowsJunctionOrSymlink(lstatSync(root), platform)) {
        continue
      }
    } catch {
      continue
    }

    let resolvedRoot: string | undefined
    try {
      const resolvedCandidate = realpathSync(root)
      if (existsSync(resolvedCandidate) && statSync(resolvedCandidate).isDirectory()) {
        resolvedRoot = resolvedCandidate
      }
    } catch {}

    if (resolvedRoot) {
      junctions.push({ name, root, isJunction: true, resolvedRoot })
    } else {
      junctions.push({ name, root, isJunction: true })
    }
  }

  return junctions.sort(compareRootNames)
}

const getManagedRoots = (junctions: FlyEnvJunction[], installedRoots: string[]): string[] => {
  return [
    ...junctions.flatMap((junction) => [junction.root, junction.resolvedRoot]),
    ...installedRoots
  ].filter((root): root is string => !!root)
}

const findJunctionByName = (
  junctions: FlyEnvJunction[],
  typeFlag: string
): FlyEnvJunction | undefined => {
  return junctions.find((junction) => junction.name.toLowerCase() === typeFlag.toLowerCase())
}

export const selectFlyEnvPreferredRoots = (
  currentRoots: FlyEnvPreferredRoot[],
  typeFlag: string,
  itemPath: string,
  junctionExpected: boolean
): FlyEnvPreferredRoot[] => {
  const selectedRoot = currentRoots.find(
    (root) => root.name.toLowerCase() === typeFlag.toLowerCase()
  )
  if (selectedRoot) {
    return currentRoots
  }
  if (junctionExpected) {
    throw new Error(`FlyEnv junction "${typeFlag}" is missing`)
  }

  // FAT/exFAT cannot host a junction. Promote only this selected installed
  // root; it remains a fallback path, not a junction.
  return [...currentRoots, { name: typeFlag, root: itemPath, isJunction: false }].sort(
    compareRootNames
  )
}

const normalizeWindowsPath = (value: string): string => {
  return win32.resolve(value).toLowerCase()
}

const junctionResolvesToInstalledRoot = (
  junction: FlyEnvJunction | undefined,
  installedRoot: string
): boolean => {
  if (!junction?.resolvedRoot || !existsSync(installedRoot)) {
    return false
  }
  try {
    return (
      win32.relative(
        normalizeWindowsPath(realpathSync(installedRoot)),
        normalizeWindowsPath(junction.resolvedRoot)
      ) === ''
    )
  } catch {
    return false
  }
}

const removeProvenManagedEntries = (entries: string[], managedRoots: string[]): string[] => {
  return entries.filter(
    (entry) => !managedRoots.some((managedRoot) => isFlyEnvManagedPathEntry(entry, managedRoot))
  )
}

/**
 * Builds only explicit FlyEnv priorities. Unresolved junctions stay eligible
 * for cleanup but are never promoted into PATH.
 */
export const buildFlyEnvPreferredPaths = (
  roots: FlyEnvPreferredRoot[],
  pathExists: (path: string) => boolean = existsSync
): string[] => {
  const preferred: string[] = []

  for (const root of roots) {
    if (root.isJunction && !root.resolvedRoot) {
      continue
    }

    const bin = win32.join(root.root, 'bin')
    const sbin = win32.join(root.root, 'sbin')
    if (pathExists(bin)) {
      preferred.push(bin)
    }
    if (pathExists(sbin)) {
      preferred.push(sbin)
    }
    const python = win32.join(root.root, 'python.exe')
    const pip = win32.join(root.root, 'Scripts', 'pip.exe')
    if (pathExists(python) && pathExists(pip)) {
      preferred.push(win32.join(root.root, 'Scripts'))
    }
    preferred.push(root.root)
  }

  return preferred
}

const writeRebuiltSystemPath = async (
  rebuild: (snapshot: WindowsPathSnapshot) => Promise<string[]> | string[],
  otherVars: Record<string, string> = {}
) => {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    // 冲突重试仍按原 compare-and-set 规则；诊断不额外读取或输出原始 PATH。
    logWindowsPath('path.rebuild-attempt', { attempt: attempt + 1 })
    const snapshot = await timeOperation('path.read-snapshot', () => fetchRawPATHSnapshot(true))
    const entries = await timeOperation('path.rebuild-entries', () => rebuild(snapshot))
    logWindowsPath('path.rebuild-ready', {
      attempt: attempt + 1,
      previousCount: snapshot.entries.length,
      nextCount: entries.length,
      otherVarNames: Object.keys(otherVars)
    })
    try {
      await timeOperation('path.commit-system-path', () =>
        writePath(entries, otherVars, snapshot.rawPath)
      )
      return
    } catch (error) {
      if (attempt === 0 && isSystemPathChangedError(error)) {
        logWindowsPath('path.rebuild-conflict-retry', { attempt: attempt + 1 })
        continue
      }
      throw error
    }
  }
}

const ensureComposerLaunchers = async (item: SoftInstalled) => {
  const binDir = dirname(item.bin)
  const bat = join(binDir, 'composer.bat')
  if (!existsSync(bat)) {
    await writeFile(
      bat,
      `@echo off
php "%~dp0composer.phar" %*`
    )
  }
  const file = join(binDir, 'composer')
  if (!existsSync(file)) {
    await writeFile(
      file,
      `#!/usr/bin/env bash
exec php "$(dirname "\${BASH_SOURCE[0]}")/composer.phar" "$@"`
    )
  }
}

export const COMPOSER_VENDOR_BIN_ENTRIES = [
  '%COMPOSER_HOME%\\vendor\\bin',
  '%APPDATA%\\Composer\\vendor\\bin'
] as const

export const selectComposerVendorBinEntry = (
  expandedEntries: ReadonlyArray<readonly [string, string | undefined]>
): string | undefined => {
  for (const [entry, expandedPath] of expandedEntries) {
    if (expandedPath && win32.isAbsolute(expandedPath)) {
      return entry
    }
  }
  return undefined
}

const resolveComposerVendorBinEntry = async (): Promise<string | undefined> => {
  const expandedEntries = await Promise.all(
    COMPOSER_VENDOR_BIN_ENTRIES.map(async (entry) => {
      try {
        // 环境路径是数据，不能放入 cmd 的 echo 后让 &、% 等参与命令解析。
        const expandedPath = await expandWindowsEnvironmentPath(entry)
        return [entry, expandedPath] as const
      } catch {
        return [entry, undefined] as const
      }
    })
  )
  return selectComposerVendorBinEntry(expandedEntries)
}

const buildOtherVars = async (
  typeFlag: string,
  flagDir: string
): Promise<Record<string, string>> => {
  const otherVars: Record<string, string> = {}
  if (typeFlag === 'java') {
    otherVars['JAVA_HOME'] = flagDir
  } else if (typeFlag === 'gradle') {
    otherVars['GRADLE_HOME'] = flagDir
  } else if (typeFlag === 'erlang') {
    otherVars['ERLANG_HOME'] = flagDir
    // 这项既有的 Erlang 配套尝试仍按当前权限执行，失败不影响后续 PATH 写入。
    // 固定注册表脚本无需落 TEMP、Unblock-File 或修改 fork 的全局工作目录，
    // 使用完整系统程序和参数数组，消除缓存路径的引号/特殊字符与 PATH 依赖。
    const script = `$ErrorActionPreference = 'Stop'; New-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\FileSystem' -Name 'LongPathsEnabled' -Value 1 -PropertyType DWORD -Force`
    try {
      await promisify(execFile)(
        resolveWindowsPowerShellPath(),
        ['-NoProfile', '-NonInteractive', '-EncodedCommand', encodePowerShellCommand(script)],
        { windowsHide: true, timeout: 60_000, env: windowsPowerShellEnv() }
      )
    } catch {}
  }
  return otherVars
}

export function removePATH(item: SoftInstalled, typeFlag: string) {
  return new ForkPromise(async (resolve, reject) => {
    // 只记录本次明确提交；列表刷新失败时仍应通知实际发生的变更。
    let environmentWritten = false
    try {
      const envDir = join(dirname(global.Server.AppDir!), 'env')
      const flagDir = join(envDir, typeFlag)
      const previousJunctions = await timeOperation('path.read-junctions', () =>
        readFlyEnvJunctions(envDir)
      )
      const selectedJunction = findJunctionByName(previousJunctions, typeFlag)
      const managedRoots = getManagedRoots(selectedJunction ? [selectedJunction] : [], [item.path])

      if (selectedJunction) {
        await timeOperation('path.remove-old-junction', () => removeByRoot(flagDir))
      }

      await writeRebuiltSystemPath((snapshot) =>
        removeProvenManagedEntries(snapshot.entries, managedRoots)
      )
      environmentWritten = true

      resolve(await timeOperation('path.refresh-list', () => fetchPATH()))
    } catch (error) {
      reject(error)
    } finally {
      // resolve/reject 已结算，通知下一轮再启动，不打断本方法的刷新或覆盖其终态。
      if (environmentWritten) notifyWindowsEnvironmentChanged()
    }
  })
}

export function updatePATH(item: SoftInstalled, typeFlag: string) {
  return new ForkPromise(async (resolve, reject) => {
    // 失败/未知写入不通知；明确提交后附加处理失败，也保留通知已发生变更的能力。
    let environmentWritten = false
    try {
      const envDir = join(dirname(global.Server.AppDir!), 'env')
      // 复用原来这一次存在性读取，诊断本身不再扫描目录。
      const envDirectoryExists = existsSync(envDir)
      logWindowsPath('path.prepare', { typeFlag, envDirectoryExists })
      if (!envDirectoryExists) {
        await timeOperation('path.prepare-env-directory', () => mkdirp(envDir))
      }

      const flagDir = join(envDir, typeFlag)
      // 记录完整 PATH 前置步骤；正常 UI 诊断和原计时脚本复用同一阶段。
      const previousJunctions = await timeOperation('path.read-junctions', () =>
        readFlyEnvJunctions(envDir)
      )
      const previousSelectedJunction = findJunctionByName(previousJunctions, typeFlag)
      if (previousSelectedJunction) {
        await timeOperation('path.remove-old-junction', () => removeByRoot(flagDir))
      }

      // 保持原来的串行/短路行为，避免测量时并行化使结果偏离用户实际体验。
      // 环境目录和安装目录的卷格式在一次系统查询中读取；同盘只查一次。
      // 未就绪、UNC、查询失败或非 NTFS 均沿用真实安装目录的既有回退。
      const { probeWindowsNTFS } = await timeOperation(
        'path.import-volume-probe',
        () => import('@shared/WindowsVolume')
      )
      const volumes = await timeOperation('path.volumes', () =>
        probeWindowsNTFS([envDir, item.path])
      )
      const junctionExpected = volumes.every(Boolean)
      logWindowsPath('path.volume-result', { ntfs: volumes, junctionExpected })
      let selectedJunction = findJunctionByName(
        await timeOperation('path.check-junction-after-removal', () => readFlyEnvJunctions(envDir)),
        typeFlag
      )

      if (selectedJunction && !junctionResolvesToInstalledRoot(selectedJunction, item.path)) {
        throw new Error(`Failed to replace FlyEnv junction "${flagDir}"`)
      }

      if (junctionExpected && !selectedJunction) {
        let junctionCreationError: unknown
        try {
          // Node 直接创建 junction，避免 cmd/mklink 对 %、&、括号和引号的再解析，
          // 也不依赖 PATH/ComSpec。NTFS junction 在可写业务目录内无需管理员。
          await timeOperation('path.create-junction', () => symlink(item.path, flagDir, 'junction'))
        } catch (error) {
          junctionCreationError = error
        }

        selectedJunction = findJunctionByName(
          await timeOperation('path.verify-created-junction', () => readFlyEnvJunctions(envDir)),
          typeFlag
        )
        if (!junctionResolvesToInstalledRoot(selectedJunction, item.path)) {
          const reason =
            junctionCreationError instanceof Error ? `: ${junctionCreationError.message}` : ''
          throw new Error(`Failed to create FlyEnv junction "${flagDir}"${reason}`)
        }
      }

      if (typeFlag === 'composer') {
        await timeOperation('path.composer-launchers', () => ensureComposerLaunchers(item))
      }
      const composerVendorBinEntry =
        typeFlag === 'composer'
          ? await timeOperation('path.composer-vendor-bin', resolveComposerVendorBinEntry)
          : undefined

      // FAT/exFAT 或无法建立 junction 时已采用安装目录 PATH；配套 HOME 变量也
      // 必须指向实际目录，不能写入一个没有创建的 env/java、env/gradle 等路径。
      const otherVars = await timeOperation('path.build-other-vars', () =>
        buildOtherVars(typeFlag, selectedJunction?.root ?? item.path)
      )
      await writeRebuiltSystemPath(async (snapshot) => {
        const currentJunctions = await timeOperation('path.rebuild-read-junctions', () =>
          readFlyEnvJunctions(envDir)
        )
        const currentSelectedJunction = findJunctionByName(currentJunctions, typeFlag)
        if (
          currentSelectedJunction &&
          !junctionResolvesToInstalledRoot(currentSelectedJunction, item.path)
        ) {
          throw new Error(`FlyEnv junction "${flagDir}" no longer resolves to the selected install`)
        }
        const selectedRoots = selectFlyEnvPreferredRoots(
          currentJunctions,
          typeFlag,
          item.path,
          junctionExpected
        )
        const managedRoots = getManagedRoots(
          [...previousJunctions, ...currentJunctions],
          [item.path]
        )
        const legacyEntries = removeProvenManagedEntries(snapshot.entries, managedRoots)
        const preferredEntries = buildFlyEnvPreferredPaths(selectedRoots)
        if (composerVendorBinEntry) {
          preferredEntries.push(composerVendorBinEntry)
        }
        return mergeWindowsPathPriority(legacyEntries, preferredEntries)
      }, otherVars)
      environmentWritten = true

      if (typeFlag === 'php') {
        // 模块冷导入和 ini 配套处理分开计时；原 path.php-ini 未覆盖导入成本。
        const phpModule = (
          await timeOperation('path.import-php-module', () => import('../Php.win'))
        ).default
        try {
          await timeOperation('path.php-ini', () => phpModule.getIniPath(item))
        } catch {}
      }

      resolve(await timeOperation('path.refresh-list', () => fetchPATH()))
    } catch (error) {
      reject(error)
    } finally {
      // 正常返回列表或后续失败均先结算；通知不参与缓存同步、ini 或列表结果。
      if (environmentWritten) notifyWindowsEnvironmentChanged()
    }
  })
}

export type EnvPathListItem = {
  path: string
  raw: string
  error: boolean
}

export type EnvPathListing = {
  rawPath: string
  list: EnvPathListItem[]
}

type EnvPathListingDeps = {
  isAbsolute: (path: string) => boolean
  realpath: (path: string) => string
  exists: (path: string) => boolean
  expand: (path: string) => Promise<string>
}

/** 只展开环境变量标记，不执行 PATH 项中的命令或 PowerShell 表达式。 */
const expandWindowsEnvironmentPath = async (value: string): Promise<string> => {
  const env = await EnvSync.sync()
  const variables = new Map(Object.entries(env).map(([key, entry]) => [key.toLowerCase(), entry]))
  // 未定义变量保留原文，让展示层标记为不可用；不使用空值掩盖配置问题。
  return value
    .replace(/%([a-z0-9_]+)%/giu, (match, key: string) => variables.get(key.toLowerCase()) ?? match)
    .replace(
      /\$env:([a-z0-9_]+)/giu,
      (match, key: string) => variables.get(key.toLowerCase()) ?? match
    )
}

const defaultEnvPathListingDeps: EnvPathListingDeps = {
  isAbsolute,
  realpath: realpathSync,
  exists: existsSync,
  // PATH 的原始值完全保留；仅生成展示值，禁止通过 echo 求值执行任意内容。
  expand: expandWindowsEnvironmentPath
}

/**
 * Adds display metadata without changing the persisted PATH entries or their
 * order. The raw registry value remains available for a compare-and-set save.
 */
export const buildEnvPathListing = async (
  snapshot: WindowsPathSnapshot,
  deps: EnvPathListingDeps = defaultEnvPathListingDeps
): Promise<EnvPathListing> => {
  const list: EnvPathListItem[] = []
  for (const path of snapshot.entries) {
    let raw = ''
    let error = false
    if (deps.isAbsolute(path)) {
      try {
        raw = deps.realpath(path)
        error = !deps.exists(raw)
      } catch {
        error = true
      }
    } else if (path.includes('%') || path.includes('$env:')) {
      try {
        raw = await deps.expand(path)
        error = !raw || !deps.exists(raw)
      } catch {
        error = true
      }
    }
    list.push({ path, raw, error })
  }
  return { rawPath: snapshot.rawPath, list }
}

export function envPathList() {
  return new ForkPromise(async (resolve, reject) => {
    console.log('envPathList !!!!!')
    let snapshot: WindowsPathSnapshot
    try {
      snapshot = await fetchRawPATHSnapshot(true)
    } catch (error) {
      reject(error instanceof Error ? error : new Error('Fail'))
      return
    }
    resolve(await timeOperation('path.build-env-listing', () => buildEnvPathListing(snapshot)))
  })
}

export function envPathUpdate(arr: string[], expectedPath: string) {
  return new ForkPromise(async (resolve, reject) => {
    let environmentWritten = false
    try {
      // writePath 在其 setSystemPath 调用明确成功后立即 clean，不主动同步环境。
      // UI 后续 envPathList 读取时，sync 会等已登记的失效再重新获取；这里不重复
      // clean，避免同一次写入多次清空共享缓存，也不能先 sync 后才失效。
      await timeOperation('path.commit-system-path', () => writePath(arr, {}, expectedPath))
      environmentWritten = true
      resolve(true)
    } catch (e) {
      console.log('envPathUpdate err: ', e)
      reject(e)
    } finally {
      // 只有成功提交后才通知，且在工具保存的 resolve/reject 之后安排。
      if (environmentWritten) notifyWindowsEnvironmentChanged()
    }
  })
}
