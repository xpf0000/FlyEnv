import { randomUUID } from 'node:crypto'
import { dirname } from 'node:path'
import { mkdir, writeFile, rename, rm } from 'node:fs/promises'
export async function writeAtomic(file: string, content: string) {
  await mkdir(dirname(file), { recursive: true })
  const temp = `${file}.${randomUUID()}.tmp`
  try {
    await writeFile(temp, content, { mode: 0o600, flag: 'wx' })
    await rename(temp, file)
  } finally { await rm(temp, { force: true }).catch(() => undefined) }
}
