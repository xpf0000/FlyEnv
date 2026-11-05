import { open, rename, unlink } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { basename, dirname, join } from 'node:path'

type Handle = {
  writeFile(bytes: string | Uint8Array): Promise<void>
  sync(): Promise<void>
  close(): Promise<void>
}
export type AtomicFileIO = {
  open(path: string, flags: string, mode?: number): Promise<Handle>
  rename(from: string, to: string): Promise<void>
  unlink(path: string): Promise<void>
}
export class AtomicWriteFailure extends Error {
  constructor(readonly outcome: 'failed' | 'unknown') {
    super(outcome === 'unknown' ? 'commit_unknown' : 'write_failed')
  }
}
export class AtomicFile {
  constructor(
    private readonly io: AtomicFileIO = { open, rename, unlink },
    private readonly syncDirectories = process.platform !== 'win32'
  ) {}

  async replace(path: string, bytes: string | Uint8Array): Promise<'committed'> {
    const directory = dirname(path)
    const temporary = join(directory, `.memory-${basename(path)}-${randomUUID()}.tmp`)
    let handle: Handle | undefined
    let committed = false
    try {
      handle = await this.io.open(temporary, 'wx', 0o600)
      await handle.writeFile(bytes)
      await handle.sync()
      await handle.close()
      handle = undefined
      await this.io.rename(temporary, path)
      committed = true
      if (this.syncDirectories) {
        handle = await this.io.open(directory, 'r')
        await handle.sync()
        await handle.close()
        handle = undefined
      }
      return 'committed'
    } catch {
      // Never expose raw IO exceptions (they may contain user data) or erase the committed path.
      throw new AtomicWriteFailure(committed ? 'unknown' : 'failed')
    } finally {
      await handle?.close().catch(() => {})
      if (!committed) await this.io.unlink(temporary).catch(() => {})
    }
  }
}
