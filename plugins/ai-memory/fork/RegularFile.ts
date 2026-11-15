import { constants } from 'node:fs'
import type { Stats } from 'node:fs'
import { lstat, open, type FileHandle } from 'node:fs/promises'

export type RegularFileIO = {
  lstat(path: string): Promise<Stats>
  open(path: string, flags: number, mode?: number): Promise<FileHandle>
}

export async function openRegularFile(
  path: string,
  flags: number,
  mode: number | undefined,
  invalid: () => never,
  io: RegularFileIO = { lstat, open }
): Promise<FileHandle> {
  let before: Stats | undefined
  try {
    before = await io.lstat(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || !(flags & constants.O_CREAT))
      throw error
  }
  if (before && (!before.isFile() || before.isSymbolicLink())) invalid()
  const handle = await io.open(path, flags | (constants.O_NOFOLLOW ?? 0), mode)
  try {
    const [opened, named] = await Promise.all([handle.stat(), io.lstat(path)])
    if (
      !opened.isFile() ||
      !named.isFile() ||
      named.isSymbolicLink() ||
      opened.dev !== named.dev ||
      opened.ino !== named.ino
    )
      invalid()
    return handle
  } catch (error) {
    await handle.close().catch(() => {})
    throw error
  }
}
