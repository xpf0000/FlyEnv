import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, win32 } from 'node:path'

export const DEFAULT_FASTCGI_WORKER_COUNT = 4
export const MIN_FASTCGI_WORKER_COUNT = 1
export const MAX_FASTCGI_WORKER_COUNT = 64

type FastCgiWorkerCounts = Record<string, number>

export const normalizeFastCgiWorkerPath = (versionPath: string) => {
  const normalized = win32.normalize(versionPath.trim()).replace(/\\/g, '/').replace(/\/+$/, '')
  return normalized === '.' ? '' : normalized.toLowerCase()
}

const isValidFastCgiWorkerCount = (count: unknown): count is number => {
  return (
    typeof count === 'number' &&
    Number.isInteger(count) &&
    count >= MIN_FASTCGI_WORKER_COUNT &&
    count <= MAX_FASTCGI_WORKER_COUNT
  )
}

const validateFastCgiWorkerCount = (count: unknown) => {
  if (!isValidFastCgiWorkerCount(count)) {
    throw new Error(
      `FastCGI worker count must be an integer between ${MIN_FASTCGI_WORKER_COUNT} and ${MAX_FASTCGI_WORKER_COUNT}.`
    )
  }
}

const parseFastCgiWorkerCounts = (content: string): FastCgiWorkerCounts => {
  try {
    const value: unknown = JSON.parse(content)
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {}
    }

    return Object.entries(value).reduce<FastCgiWorkerCounts>((counts, [path, count]) => {
      const key = normalizeFastCgiWorkerPath(path)
      if (key && isValidFastCgiWorkerCount(count)) {
        counts[key] = count
      }
      return counts
    }, {})
  } catch {
    return {}
  }
}

export class FastCgiWorkerStore {
  private writeTail: Promise<void> = Promise.resolve()

  constructor(readonly filePath: string) {}

  async get(versionPath: string): Promise<number> {
    const key = normalizeFastCgiWorkerPath(versionPath)
    if (!key) {
      return DEFAULT_FASTCGI_WORKER_COUNT
    }
    const counts = await this.read()
    return counts[key] ?? DEFAULT_FASTCGI_WORKER_COUNT
  }

  async set(versionPath: string, count: number): Promise<number> {
    const key = normalizeFastCgiWorkerPath(versionPath)
    if (!key) {
      throw new Error('PHP installation path is required.')
    }
    validateFastCgiWorkerCount(count)

    const write = async () => {
      const counts = await this.read()
      counts[key] = count
      await this.write(counts)
    }
    const pending = this.writeTail.then(write, write)
    this.writeTail = pending.catch(() => {})
    await pending
    return count
  }

  private async read(): Promise<FastCgiWorkerCounts> {
    try {
      return parseFastCgiWorkerCounts(await readFile(this.filePath, 'utf8'))
    } catch {
      return {}
    }
  }

  private async write(counts: FastCgiWorkerCounts): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true })
    const tempPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`
    try {
      await writeFile(tempPath, `${JSON.stringify(counts, null, 2)}\n`, 'utf8')
      await rename(tempPath, this.filePath)
    } catch (error) {
      await rm(tempPath, { force: true }).catch(() => {})
      throw error
    }
  }
}
