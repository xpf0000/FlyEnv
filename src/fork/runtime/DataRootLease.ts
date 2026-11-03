import { mkdir, realpath, open, lstat } from 'node:fs/promises'
import { constants } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'

export class DataRootLeaseError extends Error {
  constructor(readonly code: 'owner_busy' | 'data_root_unavailable') {
    super(code)
  }
}
export interface Lease {
  readonly dataRoot: string
  release(): Promise<void>
}

export class DataRootLease {
  static async acquire(root: string): Promise<Lease> {
    // Load the native addon only for plugins that declare exclusive data access.
    const native = createRequire(import.meta.url)('fs-native-extensions') as {
      tryLock(fd: number): boolean
      unlock(fd: number): void
    }
    await mkdir(root, { recursive: true, mode: 0o700 })
    const dataRoot = await realpath(root)
    const path = join(dataRoot, '.flyenv-owner.lock')
    const handle = await open(
      path,
      constants.O_CREAT | constants.O_RDWR | (constants.O_NOFOLLOW ?? 0),
      0o600
    )
    try {
      const [opened, named] = await Promise.all([handle.stat(), lstat(path)])
      if (
        !opened.isFile() ||
        !named.isFile() ||
        opened.ino !== named.ino ||
        opened.dev !== named.dev
      )
        throw new DataRootLeaseError('data_root_unavailable')
      if (!native.tryLock(handle.fd)) throw new DataRootLeaseError('owner_busy')
    } catch (error) {
      await handle.close()
      throw error
    }
    let released: Promise<void> | undefined
    return {
      dataRoot,
      release() {
        return (released ??= (async () => {
          try {
            native.unlock(handle.fd)
          } finally {
            await handle.close()
          }
          // The inode must survive release; unlinking it would permit two different lock objects.
        })())
      }
    }
  }
}
