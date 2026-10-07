import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'

const ROOT_NAME = 'opensearch-dashboards'
const COORDINATION_NAME = '.coordination'
const UNKNOWN_OWNER_WAIT_MS = 5000
const POLL_INTERVAL_MS = 75
const OBSERVE_INTERVAL_MS = 350
const WINDOWS_RENAME_RETRY_MS = 2500
const WINDOWS_RENAME_RETRY_DELAY_MS = 25

type LockOwner = { pid: number; token: string }

const errno = (error: unknown) => (error as NodeJS.ErrnoException | undefined)?.code
const isWithin = (root: string, candidate: string) => {
  const absoluteRoot = resolve(root)
  const absoluteCandidate = resolve(candidate)
  return absoluteCandidate === absoluteRoot || absoluteCandidate.startsWith(`${absoluteRoot}${sep}`)
}
const validateName = (name: string) => {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(name)) {
    throw new Error('Invalid OpenSearch Dashboards coordination lock name')
  }
}
const validateOwner = (value: unknown): LockOwner | undefined => {
  const owner = value as Partial<LockOwner> | null
  if (
    !owner ||
    !Number.isSafeInteger(owner.pid) ||
    Number(owner.pid) < 1 ||
    typeof owner.token !== 'string' ||
    !/^[\da-f]{8}-[\da-f-]{27,}$/i.test(owner.token)
  )
    return undefined
  return { pid: Number(owner.pid), token: owner.token }
}
const sameOwner = (left: LockOwner | undefined, right: LockOwner) =>
  !!left && left.pid === right.pid && left.token === right.token
const renameWithWindowsSharingRetry = async (
  source: string,
  destination: string,
  validate?: () => Promise<void>
) => {
  const deadline = Date.now() + WINDOWS_RENAME_RETRY_MS
  while (true) {
    await validate?.()
    try {
      await rename(source, destination)
      return
    } catch (error) {
      const code = errno(error)
      if (
        process.platform !== 'win32' ||
        !['EPERM', 'EACCES', 'EBUSY'].includes(code ?? '') ||
        Date.now() >= deadline
      ) {
        throw error
      }
      await new Promise<void>((resolveWait) =>
        setTimeout(resolveWait, WINDOWS_RENAME_RETRY_DELAY_MS)
      )
    }
  }
}
const processIsAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    const code = errno(error)
    if (code === 'ESRCH') return false
    if (code === 'EPERM' || code === 'EACCES') return true
    throw error
  }
}
const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolveWait, rejectWait) => {
    if (signal?.aborted)
      return rejectWait(signal.reason ?? new Error('Coordination wait cancelled'))
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort)
      resolveWait()
    }, ms)
    const abort = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      rejectWait(signal?.reason ?? new Error('Coordination wait cancelled'))
    }
    signal?.addEventListener('abort', abort, { once: true })
  })

export class OpenSearchDashboardsCoordination {
  readonly root: string
  readonly coordinationRoot: string
  readonly lockRoot: string
  readonly generationPath: string

  constructor(baseRoot: string) {
    const root = resolve(baseRoot, ROOT_NAME)
    this.root = root
    this.coordinationRoot = resolve(root, COORDINATION_NAME)
    this.lockRoot = resolve(this.coordinationRoot, 'locks')
    this.generationPath = resolve(this.coordinationRoot, 'generation')
    if (!isWithin(resolve(baseRoot), root) || !isWithin(root, this.coordinationRoot)) {
      throw new Error('Invalid OpenSearch Dashboards coordination root')
    }
  }

  async readGeneration(): Promise<string> {
    try {
      return await readFile(this.generationPath, 'utf8')
    } catch (error) {
      if (errno(error) === 'ENOENT') return ''
      throw error
    }
  }

  async invalidate(): Promise<string> {
    const release = await this.acquire('generation', undefined, 5000)
    try {
      await mkdir(this.coordinationRoot, { recursive: true })
      const generation = randomUUID()
      const temporary = resolve(this.coordinationRoot, `.generation-${generation}.tmp`)
      if (!isWithin(this.coordinationRoot, temporary)) throw new Error('Invalid generation path')
      await writeFile(temporary, generation, { flag: 'wx' })
      try {
        await renameWithWindowsSharingRetry(temporary, this.generationPath)
      } catch (error) {
        await rm(temporary, { force: true }).catch(() => {})
        throw error
      }
      return generation
    } finally {
      await release()
    }
  }

  async assertCurrent(generation: string): Promise<void> {
    const current = await this.readGeneration()
    if (current !== generation) {
      const error = new Error('OpenSearch Dashboards operation generation changed')
      error.name = 'OpenSearchDashboardsGenerationChangedError'
      throw error
    }
  }

  observe(controller: AbortController, generation: string): () => void {
    let closed = false
    let timer: NodeJS.Timeout | undefined
    const poll = async () => {
      if (closed || controller.signal.aborted) return
      try {
        await this.assertCurrent(generation)
      } catch (error) {
        if (!closed && !controller.signal.aborted) controller.abort(error)
        return
      }
      if (!closed && !controller.signal.aborted)
        timer = setTimeout(() => void poll(), OBSERVE_INTERVAL_MS)
    }
    timer = setTimeout(() => void poll(), OBSERVE_INTERVAL_MS)
    return () => {
      closed = true
      if (timer) clearTimeout(timer)
    }
  }

  async acquire(
    name: string,
    signal?: AbortSignal,
    timeoutMs = 300_000
  ): Promise<() => Promise<void>> {
    validateName(name)
    if (!Number.isFinite(timeoutMs) || timeoutMs < 0)
      throw new Error('Invalid coordination lock timeout')
    await mkdir(this.lockRoot, { recursive: true })
    const lockPath = resolve(this.lockRoot, name)
    if (!isWithin(this.lockRoot, lockPath)) throw new Error('Invalid coordination lock path')
    const deadline = Date.now() + timeoutMs
    let unknownSince = 0

    while (true) {
      if (signal?.aborted)
        throw signal.reason ?? new Error('Coordination lock acquisition cancelled')
      try {
        await mkdir(lockPath)
        const owner: LockOwner = { pid: process.pid, token: randomUUID() }
        try {
          await this.writeOwner(lockPath, owner)
        } catch (error) {
          await rm(lockPath, { recursive: true, force: true }).catch(() => {})
          throw error
        }
        return () => this.release(lockPath, owner)
      } catch (error) {
        if (errno(error) !== 'EEXIST') throw error
      }

      let owner: LockOwner | undefined
      try {
        owner = validateOwner(JSON.parse(await readFile(join(lockPath, 'owner.json'), 'utf8')))
      } catch (error) {
        if (errno(error) !== 'ENOENT' && !(error instanceof SyntaxError)) throw error
      }
      if (!owner) {
        unknownSince ||= Date.now()
        if (Date.now() - unknownSince >= UNKNOWN_OWNER_WAIT_MS) {
          throw new Error(`OpenSearch Dashboards lock owner is unverifiable: ${name}`)
        }
      } else {
        unknownSince = 0
        if (!processIsAlive(owner.pid)) {
          const reaped = await this.reapDeadOwner(name, lockPath, owner, signal)
          if (reaped) continue
        }
      }

      if (Date.now() >= deadline)
        throw new Error(`Timed out waiting for OpenSearch Dashboards lock: ${name}`)
      await wait(Math.min(POLL_INTERVAL_MS, Math.max(1, deadline - Date.now())), signal)
    }
  }

  private async writeOwner(directory: string, owner: LockOwner): Promise<void> {
    const target = join(directory, 'owner.json')
    if (!isWithin(this.lockRoot, target)) throw new Error('Invalid coordination owner path')
    const temporary = join(directory, `.owner-${owner.token}.tmp`)
    await writeFile(temporary, JSON.stringify(owner), { flag: 'wx' })
    await renameWithWindowsSharingRetry(temporary, target)
  }

  private async readOwner(directory: string): Promise<LockOwner | undefined> {
    try {
      return validateOwner(JSON.parse(await readFile(join(directory, 'owner.json'), 'utf8')))
    } catch (error) {
      if (errno(error) === 'ENOENT' || error instanceof SyntaxError) return undefined
      throw error
    }
  }

  private async reapDeadOwner(
    name: string,
    lockPath: string,
    observed: LockOwner,
    signal?: AbortSignal
  ): Promise<boolean> {
    const reaperPath = `${lockPath}.reaping`
    const reaperOwner: LockOwner = { pid: process.pid, token: randomUUID() }
    try {
      await mkdir(reaperPath)
    } catch (error) {
      if (errno(error) === 'EEXIST') {
        const unknownSince = Date.now()
        while (true) {
          if (signal?.aborted)
            throw signal.reason ?? new Error('Coordination lock acquisition cancelled')
          const existingReaper = await this.readOwner(reaperPath)
          if (existingReaper) {
            if (!processIsAlive(existingReaper.pid)) {
              throw new Error(`OpenSearch Dashboards stale-lock recovery owner is dead: ${name}`)
            }
            return false
          }
          if (Date.now() - unknownSince >= UNKNOWN_OWNER_WAIT_MS) {
            throw new Error(
              `OpenSearch Dashboards stale-lock recovery owner is unverifiable: ${name}`
            )
          }
          await wait(POLL_INTERVAL_MS, signal)
        }
      }
      throw error
    }
    try {
      await this.writeOwner(reaperPath, reaperOwner)
      const current = await this.readOwner(lockPath)
      if (!sameOwner(current, observed) || processIsAlive(current!.pid)) return false

      const quarantine = resolve(
        this.lockRoot,
        `${name}.quarantine-${observed.token}-${randomUUID()}`
      )
      if (!isWithin(this.lockRoot, quarantine))
        throw new Error('Invalid stale lock quarantine path')
      try {
        await renameWithWindowsSharingRetry(lockPath, quarantine, async () => {
          const currentOwner = await this.readOwner(lockPath)
          if (!sameOwner(currentOwner, observed) || processIsAlive(currentOwner!.pid)) {
            throw new Error(`OpenSearch Dashboards stale lock changed during recovery: ${name}`)
          }
        })
      } catch (error) {
        if (errno(error) === 'ENOENT') return false
        throw error
      }
      const quarantinedOwner = await this.readOwner(quarantine)
      if (!sameOwner(quarantinedOwner, observed)) {
        try {
          await renameWithWindowsSharingRetry(quarantine, lockPath)
        } catch {
          throw new Error(`OpenSearch Dashboards lock changed during stale recovery: ${name}`)
        }
        throw new Error(`OpenSearch Dashboards lock changed during stale recovery: ${name}`)
      }
      await rm(quarantine, { recursive: true })
      return true
    } finally {
      const owner = await this.readOwner(reaperPath).catch(() => undefined)
      if (sameOwner(owner, reaperOwner)) await rm(reaperPath, { recursive: true, force: true })
    }
  }

  private async release(lockPath: string, owner: LockOwner): Promise<void> {
    if (!isWithin(this.lockRoot, lockPath)) throw new Error('Invalid coordination release path')
    const current = await this.readOwner(lockPath)
    if (!sameOwner(current, owner)) {
      throw new Error('OpenSearch Dashboards coordination lock ownership changed before release')
    }
    const quarantine = resolve(this.lockRoot, `release-${owner.token}-${randomUUID()}`)
    if (!isWithin(this.lockRoot, quarantine))
      throw new Error('Invalid coordination release quarantine path')
    await renameWithWindowsSharingRetry(lockPath, quarantine, async () => {
      const currentOwner = await this.readOwner(lockPath)
      if (!sameOwner(currentOwner, owner) || !processIsAlive(currentOwner!.pid)) {
        throw new Error('OpenSearch Dashboards coordination lock ownership changed before release')
      }
    })
    const moved = await this.readOwner(quarantine)
    if (!sameOwner(moved, owner)) {
      try {
        await renameWithWindowsSharingRetry(quarantine, lockPath)
      } catch {
        throw new Error('OpenSearch Dashboards coordination lock changed during release')
      }
      throw new Error('OpenSearch Dashboards coordination lock changed during release')
    }
    await rm(quarantine, { recursive: true })
  }
}
