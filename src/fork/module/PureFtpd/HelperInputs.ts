import { constants } from 'node:fs'
import { open } from 'node:fs/promises'
import { join } from 'node:path'

const inputLimit = 1024 * 1024

// Read fixed FTP inputs with the fork's ordinary account permissions.
async function readInput(name: string, optional = false): Promise<string> {
  let file
  try {
    file = await open(join(global.Server.FTPDir!, name), constants.O_RDONLY | constants.O_NONBLOCK)
  } catch (error) {
    if (optional && (error as NodeJS.ErrnoException).code === 'ENOENT') return ''
    throw error
  }
  try {
    const stat = await file.stat()
    if (!stat.isFile() || stat.size > inputLimit) throw new Error(`Invalid FTP input: ${name}`)
    const buffer = Buffer.alloc(inputLimit + 1)
    let length = 0
    while (length < buffer.length) {
      const { bytesRead } = await file.read(buffer, length, buffer.length - length, null)
      if (!bytesRead) break
      length += bytesRead
    }
    if (length > inputLimit) throw new Error(`FTP input exceeds size limit: ${name}`)
    return buffer.subarray(0, length).toString('utf8')
  } finally {
    await file.close()
  }
}

export async function readUnixFTPInputs(includeConfig = false) {
  const config = includeConfig ? await readInput('pure-ftpd.conf') : undefined
  const users = await readInput('pureftpd.passwd', true)
  const inputs = { ...(config === undefined ? {} : { config }), users }
  // Leave room for the signed RPC envelope within Helper's existing 1 MiB limit.
  if (Buffer.byteLength(JSON.stringify(inputs)) > inputLimit - 8192) {
    throw new Error('FTP inputs exceed the Helper request size limit')
  }
  return inputs
}
