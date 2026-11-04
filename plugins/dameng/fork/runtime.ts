import { spawn } from 'node:child_process'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, basename, join } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { createInflateRaw } from 'node:zlib'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { Readable } from 'node:stream'

export const redact = (value: string, secrets: string[] = []) =>
  secrets.filter(Boolean).reduce((text, secret) => text.replaceAll(secret, '[redacted]'), value)
export type CommandOptions = {
  cwd?: string
  env?: NodeJS.ProcessEnv
  input?: string
  timeoutMs?: number
  secrets?: string[]
  acceptedExitCodes?: number[]
}

/** Always waits for actual close. Timeout never kills an entire external service tree. */
export function runCommand(
  bin: string,
  args: string[],
  options: CommandOptions = {}
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    })
    let output = '',
      diagnostics = '',
      settled = false,
      timedOut = false
    let cleanupTimer: ReturnType<typeof setTimeout> | undefined
    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (cleanupTimer) clearTimeout(cleanupTimer)
      if (error) reject(error)
      else resolve(redact(output, options.secrets))
    }
    const timer = setTimeout(() => {
      timedOut = true
      cleanupTimer = setTimeout(
        () =>
          finish(new Error('DAMENG_OUTCOME_UNKNOWN: command did not confirm exit after timeout.')),
        10_000
      )
      try {
        child.kill('SIGTERM')
      } catch {
        finish(new Error('DAMENG_OUTCOME_UNKNOWN: command timeout cleanup could not be confirmed.'))
      }
    }, options.timeoutMs ?? 60_000)
    child.stdout.on('data', (bytes: Buffer) => {
      output = (output + bytes.toString()).slice(-128 * 1024)
    })
    child.stderr.on('data', (bytes: Buffer) => {
      diagnostics = (diagnostics + bytes.toString()).slice(-16 * 1024)
    })
    child.stdin.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code !== 'EPIPE') finish(new Error(redact(error.message, options.secrets)))
    })
    child.once('error', (error) => finish(new Error(redact(error.message, options.secrets))))
    child.once('close', (code, signal) =>
      finish(
        timedOut
          ? new Error(
              'DAMENG_OUTCOME_UNKNOWN: external command timed out; inspect its process tree and partial results before retrying.'
            )
          : (options.acceptedExitCodes ?? [0]).includes(code ?? -1)
            ? undefined
            : new Error(
                redact(
                  `DM command ${basename(bin)} exited ${code ?? signal}: ${diagnostics || output}`,
                  options.secrets
                )
              )
      )
    )
    child.stdin.end(options.input ?? '')
  })
}

/** Atomic mkdir is shared across every Fork, not merely one singleton's Promise map. */
export async function withOperationLock<T>(
  root: string,
  key: string,
  work: () => Promise<T>
): Promise<T> {
  if (!/^[A-Za-z0-9_]+$/.test(key)) throw new Error('Invalid DM operation lock.')
  await mkdir(root, { recursive: true })
  const directory = join(root, `${key}.lock`)
  try {
    await mkdir(directory)
  } catch (error: any) {
    if (error.code === 'EEXIST')
      throw new Error(
        'DM operation is in progress or its previous outcome is unknown. Inspect the existing operation before retrying.'
      )
    throw error
  }
  let unknown = false
  try {
    await writeFile(
      join(directory, 'owner.json'),
      JSON.stringify({ pid: process.pid, createdAt: Date.now() }),
      { mode: 0o600 }
    )
    return await work()
  } catch (error) {
    unknown = /DAMENG_OUTCOME_UNKNOWN/.test(String(error))
    throw error
  } finally {
    if (!unknown)
      await rm(directory, { recursive: true }).catch((error) =>
        console.warn('[dameng] lock cleanup failed', String(error))
      )
  }
}

export async function writeJsonAtomic(file: string, value: unknown) {
  await mkdir(dirname(file), { recursive: true })
  const partial = `${file}.${randomUUID()}.tmp`
  try {
    await writeFile(partial, JSON.stringify(value, null, 2), { flag: 'wx', mode: 0o600 })
    await rename(partial, file)
  } finally {
    await rm(partial, { force: true }).catch(() => {})
  }
}

export async function downloadPackage(
  target: string,
  expectedSize: number,
  request: () => Promise<Readable>,
  progress: (percent: number) => void
) {
  await mkdir(dirname(target), { recursive: true })
  if (
    await stat(target)
      .then((value) => value.size === expectedSize)
      .catch(() => false)
  )
    return
  const partial = `${target}.${randomUUID()}.part`
  let bytes = 0
  try {
    const stream = await request()
    await pipeline(
      stream,
      new Transform({
        transform(chunk, _encoding, callback) {
          bytes += chunk.length
          if (bytes > expectedSize) {
            callback(new Error('Official DM archive exceeds its pinned size.'))
            return
          }
          progress(Math.floor((bytes / expectedSize) * 100))
          callback(null, chunk)
        }
      }),
      createWriteStream(partial, { flags: 'wx', mode: 0o600 })
    )
    if (bytes !== expectedSize) throw new Error('Incomplete official DM archive download.')
    await rename(partial, target)
  } finally {
    await rm(partial, { force: true }).catch(() => {})
  }
}

export type PinnedIso = {
  isoName: string
  localOffset: number
  compressedSize: number
  isoSize: number
  isoSha256: string
}

class InvalidArchiveError extends Error {}

/** Extract only the pinned ISO; other ZIP members (including traversal names) are never written. */
export async function extractPinnedIso(zipFile: string, target: string, entry: PinnedIso) {
  try {
    await extractVerifiedIso(zipFile, target, entry)
  } catch (error) {
    // A subsequent explicit install may download again. Output/read permission or
    // disk failures do not prove archive corruption and must retain the cache.
    if (error instanceof InvalidArchiveError)
      await rm(zipFile, { force: true }).catch((cleanup) =>
        console.warn('[dameng] invalid archive cleanup failed', String(cleanup))
      )
    throw error
  }
}

async function extractVerifiedIso(zipFile: string, target: string, entry: PinnedIso) {
  const input = await open(zipFile, 'r')
  let start: number
  try {
    const header = Buffer.alloc(30)
    if (
      (await input.read(header, 0, 30, entry.localOffset)).bytesRead !== 30 ||
      header.readUInt32LE() !== 0x04034b50 ||
      header.readUInt16LE(8) !== 8 ||
      header.readUInt16LE(6) & 1
    )
      throw new InvalidArchiveError('Invalid official DM ZIP entry header.')
    const name = Buffer.alloc(header.readUInt16LE(26))
    if (
      (await input.read(name, 0, name.length, entry.localOffset + 30)).bytesRead !== name.length ||
      name.toString('utf8') !== entry.isoName ||
      basename(entry.isoName) !== entry.isoName
    )
      throw new InvalidArchiveError('Official DM ISO entry identity changed.')
    start = entry.localOffset + 30 + name.length + header.readUInt16LE(28)
  } finally {
    await input.close()
  }
  await mkdir(dirname(target), { recursive: true })
  const partial = `${target}.${randomUUID()}.part`
  let bytes = 0
  const hash = createHash('sha256')
  try {
    await pipeline(
      createReadStream(zipFile, { start, end: start + entry.compressedSize - 1 }),
      createInflateRaw(),
      new Transform({
        transform(chunk, _encoding, callback) {
          bytes += chunk.length
          if (bytes > entry.isoSize) {
            callback(new InvalidArchiveError('Official DM ISO exceeds its pinned size.'))
            return
          }
          hash.update(chunk)
          callback(null, chunk)
        }
      }),
      createWriteStream(partial, { flags: 'wx', mode: 0o600 })
    )
    if (bytes !== entry.isoSize || hash.digest('hex') !== entry.isoSha256)
      throw new InvalidArchiveError(
        'Official DM ISO checksum mismatch. The package was not executed.'
      )
    await rename(partial, target)
  } catch (error) {
    if (['Z_DATA_ERROR', 'Z_BUF_ERROR'].includes((error as NodeJS.ErrnoException).code ?? ''))
      throw new InvalidArchiveError(
        'Invalid official DM ISO deflate data. The package was not executed.'
      )
    throw error
  } finally {
    await rm(partial, { force: true }).catch(() => {})
  }
}

export const readJson = async <T>(file: string): Promise<T> =>
  JSON.parse(await readFile(file, 'utf8')) as T
