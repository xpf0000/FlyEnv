import { access, stat } from 'node:fs/promises'
import { constants } from 'node:fs'
import { isAbsolute } from 'node:path'
import type { LocalModelFileStatus } from '../shared/types'

export const inspectLocalModelFiles = async (
  paths: string[],
  deps: {
    stat?: (path: string) => Promise<{ isFile(): boolean }>
    access?: (path: string, mode: number) => Promise<void>
  } = {}
): Promise<LocalModelFileStatus[]> =>
  Promise.all(
    [...new Set(paths)].map(async (path): Promise<LocalModelFileStatus> => {
      if (typeof path !== 'string' || !isAbsolute(path))
        return { path, status: 'unverified', reason: 'Invalid local model path' }
      try {
        const info = await (deps.stat ?? stat)(path)
        if (!info.isFile()) return { path, status: 'missing', reason: 'Not a regular file' }
        await (deps.access ?? access)(path, constants.R_OK)
        return { path, status: 'available' }
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code
        return {
          path,
          status: code === 'ENOENT' || code === 'ENOTDIR' ? 'missing' : 'unverified',
          reason: error instanceof Error ? error.message : String(error)
        }
      }
    })
  )
