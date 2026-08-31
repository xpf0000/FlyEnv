import type { Stats } from 'node:fs'
import { lstat } from 'node:fs/promises'
import { join } from 'node:path'
import { moveDirToDir, readdir, remove, rename } from '../../Fn'

export async function moveProjectDirContents(stagingDir: string, destinationDir: string) {
  const entries = await readdir(stagingDir, { withFileTypes: true })

  for (const entry of entries) {
    const sourcePath = join(stagingDir, entry.name)
    const destinationPath = join(destinationDir, entry.name)
    let destinationStat: Stats | undefined

    try {
      destinationStat = await lstat(destinationPath)
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }
    }

    if (!destinationStat) {
      await rename(sourcePath, destinationPath)
    } else if (entry.isDirectory() && destinationStat.isDirectory()) {
      await moveDirToDir(sourcePath, destinationPath)
      await remove(sourcePath)
    } else {
      const error = new Error(`Project entry already exists: ${destinationPath}`)
      Object.assign(error, { code: 'EEXIST' })
      throw error
    }
  }
}
