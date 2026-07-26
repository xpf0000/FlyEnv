import { lstatSync, statSync, type Stats } from 'fs'
import {
  execPromise,
  fetchRawPATH,
  isNTFS,
  uuid,
  existsSync,
  mkdirp,
  readdir,
  realpathSync,
  removeByRoot,
  writeFile
} from '../../Fn'
import { ForkPromise } from '@shared/ForkPromise'
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
    const pathArr = await fetchRawPATH()
    const allPath = pathArr
      .filter((f) => existsSync(f))
      .map((f) => realpathSync(f))
      .filter((f) => existsSync(f) && statSync(f).isDirectory())
    res.allPath = Array.from(new Set(allPath))

    const dir = join(dirname(global.Server.AppDir!), 'env')
    if (existsSync(dir)) {
      let allFile = await readdir(dir)
      allFile = allFile
        .filter((f) => existsSync(join(dir, f)))
        .map((f) => realpathSync(join(dir, f)))
        .filter((f) => existsSync(f) && statSync(f).isDirectory())
      res.appPath = Array.from(new Set(allFile))
    }
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
    const snapshot = await fetchRawPATHSnapshot(true)
    const entries = await rebuild(snapshot)
    try {
      await writePath(entries, otherVars, snapshot.rawPath)
      return
    } catch (error) {
      if (attempt === 0 && isSystemPathChangedError(error)) {
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
        const expandedPath = (await execPromise(`echo ${entry}`))?.stdout?.trim()
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
    const f = join(global.Server.Cache!, `${uuid()}.ps1`)
    await writeFile(
      f,
      `New-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\FileSystem" -Name "LongPathsEnabled" -Value 1 -PropertyType DWORD -Force`
    )
    process.chdir(global.Server.Cache!)
    try {
      await execPromise(
        `powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Unblock-File -LiteralPath '${f}'; & '${f}'"`
      )
    } catch {}
    await removeByRoot(f)
  }
  return otherVars
}

export function removePATH(item: SoftInstalled, typeFlag: string) {
  return new ForkPromise(async (resolve, reject) => {
    try {
      const envDir = join(dirname(global.Server.AppDir!), 'env')
      const flagDir = join(envDir, typeFlag)
      const previousJunctions = await readFlyEnvJunctions(envDir)
      const selectedJunction = findJunctionByName(previousJunctions, typeFlag)
      const managedRoots = getManagedRoots(selectedJunction ? [selectedJunction] : [], [item.path])

      if (selectedJunction) {
        await removeByRoot(flagDir)
      }

      await writeRebuiltSystemPath((snapshot) =>
        removeProvenManagedEntries(snapshot.entries, managedRoots)
      )

      resolve(await fetchPATH())
    } catch (error) {
      reject(error)
    }
  })
}

export function updatePATH(item: SoftInstalled, typeFlag: string) {
  return new ForkPromise(async (resolve, reject) => {
    try {
      const envDir = join(dirname(global.Server.AppDir!), 'env')
      if (!existsSync(envDir)) {
        await mkdirp(envDir)
      }

      const flagDir = join(envDir, typeFlag)
      const previousJunctions = await readFlyEnvJunctions(envDir)
      const previousSelectedJunction = findJunctionByName(previousJunctions, typeFlag)
      if (previousSelectedJunction) {
        await removeByRoot(flagDir)
      }

      const junctionExpected = (await isNTFS(envDir)) && (await isNTFS(item.path))
      let selectedJunction = findJunctionByName(await readFlyEnvJunctions(envDir), typeFlag)

      if (selectedJunction && !junctionResolvesToInstalledRoot(selectedJunction, item.path)) {
        throw new Error(`Failed to replace FlyEnv junction "${flagDir}"`)
      }

      if (junctionExpected && !selectedJunction) {
        let junctionCreationError: unknown
        try {
          await execPromise(`mklink /J "${flagDir}" "${item.path}"`)
        } catch (error) {
          junctionCreationError = error
        }

        selectedJunction = findJunctionByName(await readFlyEnvJunctions(envDir), typeFlag)
        if (!junctionResolvesToInstalledRoot(selectedJunction, item.path)) {
          const reason =
            junctionCreationError instanceof Error ? `: ${junctionCreationError.message}` : ''
          throw new Error(`Failed to create FlyEnv junction "${flagDir}"${reason}`)
        }
      }

      if (typeFlag === 'composer') {
        await ensureComposerLaunchers(item)
      }
      const composerVendorBinEntry =
        typeFlag === 'composer' ? await resolveComposerVendorBinEntry() : undefined

      const otherVars = await buildOtherVars(typeFlag, flagDir)
      await writeRebuiltSystemPath(async (snapshot) => {
        const currentJunctions = await readFlyEnvJunctions(envDir)
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

      if (typeFlag === 'php') {
        const phpModule = (await import('../Php.win')).default
        try {
          await phpModule.getIniPath(item)
        } catch {}
      }

      resolve(await fetchPATH())
    } catch (error) {
      reject(error)
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

const defaultEnvPathListingDeps: EnvPathListingDeps = {
  isAbsolute,
  realpath: realpathSync,
  exists: existsSync,
  expand: async (path) => (await execPromise(`echo ${path}`))?.stdout?.trim() ?? ''
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
    resolve(await buildEnvPathListing(snapshot))
  })
}

export function envPathUpdate(arr: string[], expectedPath: string) {
  return new ForkPromise(async (resolve, reject) => {
    try {
      await writePath(arr, {}, expectedPath)
    } catch (e) {
      console.log('envPathUpdate err: ', e)
      return reject(e)
    }
    resolve(true)
  })
}
