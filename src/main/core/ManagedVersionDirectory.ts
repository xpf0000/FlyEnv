import { lstat, realpath, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import {
  FORCE_DELETE_CONFIRMATION,
  type ManagedVersionDirectory,
  type VersionDeleteTarget
} from '@shared/VersionDelete'

// A separator-aware comparison is required: app-other must not belong to app.
export function isStrictDescendant(
  root: string,
  target: string,
  windows = process.platform === 'win32'
) {
  const paths = windows ? path.win32 : path.posix
  if (!paths.isAbsolute(root) || !paths.isAbsolute(target)) return false
  const relative = paths.relative(root, target)
  return (
    !!relative &&
    relative !== '..' &&
    !relative.startsWith(`..${paths.sep}`) &&
    !paths.isAbsolute(relative)
  )
}

export async function inspectManagedVersionDirectory(
  appDirectory: string | undefined,
  target: VersionDeleteTarget
): Promise<ManagedVersionDirectory> {
  if (
    !appDirectory ||
    !target ||
    typeof target.path !== 'string' ||
    typeof target.bin !== 'string'
  ) {
    throw new Error('Invalid version directory')
  }
  const root = await realpath(appDirectory)
  const logicalRoot = isStrictDescendant(appDirectory, target.path)
    ? path.resolve(appDirectory)
    : root
  if (
    !isStrictDescendant(logicalRoot, target.path) ||
    !isStrictDescendant(target.path, target.bin)
  ) {
    throw new Error('The version directory is not managed by FlyEnv')
  }

  const directory = path.resolve(target.path)
  const relative = path.relative(logicalRoot, directory)
  let component = logicalRoot
  // Never let a junction inside app redirect recursive deletion into another installation.
  for (const part of relative.split(path.sep)) {
    component = path.join(component, part)
    const info = await lstat(component)
    if (!info.isDirectory() || info.isSymbolicLink()) {
      throw new Error('The version directory contains a symbolic link or junction')
    }
  }
  const resolved = await realpath(directory)
  const bin = await realpath(target.bin)
  if (!isStrictDescendant(root, resolved) || !isStrictDescendant(resolved, bin)) {
    throw new Error('The version directory is not managed by FlyEnv')
  }
  const [rootInfo, directoryInfo, binInfo] = await Promise.all([
    stat(root),
    stat(resolved),
    stat(bin)
  ])
  if (!binInfo.isFile()) throw new Error('The version executable is not a file')
  return {
    path: resolved,
    bin,
    identity: JSON.stringify([
      root,
      rootInfo.dev,
      rootInfo.ino,
      resolved,
      directoryInfo.dev,
      directoryInfo.ino
    ])
  }
}

export async function removeManagedVersionDirectory(
  appDirectory: string | undefined,
  expected: ManagedVersionDirectory,
  confirmation: string
) {
  if (confirmation !== FORCE_DELETE_CONFIRMATION) throw new Error('Type Force Delete to confirm')
  const current = await inspectManagedVersionDirectory(appDirectory, expected)
  if (current.identity !== expected.identity) {
    throw new Error('The version directory changed. Please reopen the deletion dialog')
  }
  // Permission and filesystem errors must propagate; never report a failed deletion as success.
  await rm(current.path, { recursive: true })
}
