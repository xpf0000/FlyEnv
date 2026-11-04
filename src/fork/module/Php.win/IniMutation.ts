import { win32 } from 'node:path'
import { randomUUID } from 'node:crypto'
import { readFile, rename, unlink, writeFile } from 'node:fs/promises'

const pending = new Map<string, Promise<unknown>>()

export async function withPhpIniMutation<T>(
  ini: string,
  operation: () => PromiseLike<T>
): Promise<T> {
  const key = win32.resolve(ini).toLowerCase()
  const previous = pending.get(key) ?? Promise.resolve()
  const current = previous.catch(() => undefined).then(operation)
  pending.set(key, current)
  try {
    return await current
  } finally {
    if (pending.get(key) === current) pending.delete(key)
  }
}

export async function replaceIniIfUnchanged(path: string, expected: Buffer, next: Buffer) {
  const temporary = `${path}.flyenv-${randomUUID()}.tmp`
  try {
    await writeFile(temporary, next, { flag: 'wx' })
    if (!(await readFile(path)).equals(expected))
      throw new Error('php.ini changed during the operation; the newer configuration was preserved')
    await rename(temporary, path)
  } finally {
    // Temporary-file cleanup is supplementary to a completed rename.
    await unlink(temporary).catch(() => undefined)
  }
}
