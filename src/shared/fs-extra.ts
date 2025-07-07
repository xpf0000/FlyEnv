import { createWriteStream, watch, existsSync, unlinkSync } from 'node:fs'
import {
  stat,
  chmod,
  copyFile,
  unlink,
  readdir,
  writeFile,
  realpath,
  readFile,
  appendFile,
  rename,
  mkdir,
  rm,
  lstat,
  readlink,
  symlink,
  cp
} from 'node:fs/promises'

import { join } from 'node:path'
import path from 'path'

// 类型定义
interface CopyOptions {
  dereference?: boolean
  overwrite?: boolean
}

interface RemoveOptions {
  recursive?: boolean
  force?: boolean
}

const checkPath = (pth: string) => {
  if (process.platform === 'win32') {
    const pathHasInvalidWinCharacters = /[<>:"|?*]/.test(pth.replace(path.parse(pth).root, ''))

    if (pathHasInvalidWinCharacters) {
      const error: any = new Error(`Path contains invalid characters: ${pth}`)
      error.code = 'EINVAL'
      throw error
    }
  }
}

const getMode = (options?: { mode: string | number } | number) => {
  const defaults = { mode: 0o777 }
  if (typeof options === 'number') return options
  return { ...defaults, ...options }.mode
}

export async function mkdirp(dir: string, options?: { mode: string | number }): Promise<void> {
  checkPath(dir)
  try {
    await mkdir(dir, { recursive: true, mode: getMode(options) })
  } catch (err: any) {
    if (err.code !== 'EEXIST') throw err
  }
}

export async function remove(path: string, options: RemoveOptions = {}): Promise<void> {
  await rm(path, {
    recursive: options.recursive ?? true,
    force: options.force ?? true
  })
}

export async function copy(src: string, dest: string, options: CopyOptions = {}): Promise<void> {
  const { dereference = false, overwrite = true } = options
  const stats = await lstat(src)

  // 处理符号链接（非解引用）
  if (stats.isSymbolicLink() && !dereference) {
    const linkPath = await readlink(src)
    await symlink(linkPath, dest)
    return
  }

  // 处理目录（递归保留子链接）
  if (stats.isDirectory() && !dereference) {
    await mkdirp(dest)
    const entries = await readdir(src, { withFileTypes: true })
    for (const entry of entries) {
      await copy(join(src, entry.name), join(dest, entry.name), { ...options, dereference: false })
    }
    return
  }

  // 其他情况（文件或强制解引用）
  await cp(src, dest, {
    recursive: dereference, // 仅解引用时递归
    force: overwrite
  })
}

export {
  createWriteStream,
  stat,
  watch,
  chmod,
  copyFile,
  unlink,
  readdir,
  writeFile,
  realpath,
  readFile,
  existsSync,
  appendFile,
  rename,
  unlinkSync
}
