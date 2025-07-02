import { join } from 'node:path'
import { readdir, mkdirp, rename, remove } from '../Fn'
import path from 'path'
import { statSync, existsSync, realpathSync } from 'fs'
/**
 * move dir's file and sub dir to other dir
 * @param src
 * @param dest
 */
export async function moveDirToDir(src: string, dest: string) {
  // 读取源目录
  const entries = await readdir(src, { withFileTypes: true })

  for (const entry of entries) {
    const srcPath = join(src, entry.name)
    const destPath = join(dest, entry.name)

    if (entry.isDirectory()) {
      await mkdirp(destPath)
      // 递归移动子文件夹
      await moveDirToDir(srcPath, destPath)
    } else {
      // 移动文件
      await rename(srcPath, destPath)
    }
  }
}

export async function moveChildDirToParent(dir: string) {
  const sub = await readdir(dir, { withFileTypes: true })
  for (const s of sub) {
    if (s.isDirectory()) {
      const sdir = join(dir, s.name)
      await moveDirToDir(sdir, dir)
      await remove(sdir)
    }
  }
}

export const getAllFileAsync = async (
  dirPath: string,
  fullpath = true,
  basePath: Array<string> = []
): Promise<string[]> => {
  if (!existsSync(dirPath)) {
    return []
  }
  const list: Array<string> = []
  const files = await readdir(dirPath, { withFileTypes: true })
  for (const file of files) {
    const arr = [...basePath]
    arr.push(file.name)
    const childPath = path.join(dirPath, file.name)
    if (file.isDirectory()) {
      const sub = await getAllFileAsync(childPath, fullpath, arr)
      list.push(...sub)
    } else if (file.isFile()) {
      const name = fullpath ? childPath : arr.join('/')
      list.push(name)
    }
  }
  return list
}

export const getSubDirAsync = async (dirPath: string, fullpath = true): Promise<string[]> => {
  if (!existsSync(dirPath)) {
    return []
  }
  const list: Array<string> = []
  const files = await readdir(dirPath, { withFileTypes: true })
  for (const file of files) {
    const childPath = path.join(dirPath, file.name)
    if (!existsSync(childPath)) {
      continue
    }
    if (
      file.isDirectory() ||
      (file.isSymbolicLink() && statSync(realpathSync(childPath)).isDirectory())
    ) {
      const name = fullpath ? childPath : file.name
      list.push(name)
    }
  }
  return Array.from(new Set(list))
}
