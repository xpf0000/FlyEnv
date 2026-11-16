import { constants } from 'node:fs'
import { open, mkdir, readdir, lstat, realpath, rename, rm } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path'
import { AtomicFile } from './AtomicFile'
import { openRegularFile } from './RegularFile'

export type MaintenanceReceipt = {
  path: string
  createdAt: string
  files: number
  bytes: number
  safetyBackupPath?: string
  warnings?: string[]
}
type Entry = { path: string; bytes: number; sha256: string }
type Manifest = {
  format: 'flyenv-ai-memory'
  version: 1
  createdAt: string
  directories: string[]
  files: Entry[]
}
const MAX_FILE = 64 * 1024 * 1024
const MAX_TOTAL = 2 * 1024 * 1024 * 1024
const MAX_ENTRIES = 100_000
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
const fault = (code: string): never => {
  throw new Error(code)
}
const inside = (parent: string, child: string) => {
  const value = relative(parent, child)
  return !value || (!isAbsolute(value) && value !== '..' && !value.startsWith(`..${sep}`))
}
const safeName = (value: unknown): value is string =>
  typeof value === 'string' &&
  !!value &&
  value.length < 8192 &&
  !value.includes('\\') &&
  !value.includes('\0') &&
  !isAbsolute(value) &&
  value.split('/').every((part) => !!part && part !== '.' && part !== '..' && !part.includes(':'))
async function bytesAt(path: string, limit = MAX_FILE) {
  const handle = await openRegularFile(path, constants.O_RDONLY, undefined, () =>
    fault('backup_invalid')
  )
  try {
    const stat = await handle.stat()
    if (!stat.isFile() || stat.size > limit) fault('backup_invalid')
    const bytes = Buffer.alloc(stat.size + 1)
    let offset = 0
    while (offset < bytes.length) {
      const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, offset)
      if (!bytesRead) break
      offset += bytesRead
    }
    if (offset !== stat.size) fault('backup_invalid')
    return bytes.subarray(0, offset)
  } finally {
    await handle.close()
  }
}
async function write(path: string, bytes: Buffer | string) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  const file = await open(path, 'wx', 0o600)
  try {
    await file.writeFile(bytes)
    await file.sync()
  } finally {
    await file.close()
  }
}
async function syncDirectory(path: string) {
  if (process.platform === 'win32') return
  const handle = await open(path, 'r')
  try {
    await handle.sync()
  } finally {
    await handle.close()
  }
}
async function scan(root: string, ignoreOwner = false) {
  const directories: string[] = []
  const files: string[] = []
  if (!(await lstat(root)).isDirectory()) fault('backup_invalid')
  async function visit(directory: string) {
    for (const entry of await readdir(join(root, directory), { withFileTypes: true })) {
      if (!directory && entry.name === '.flyenv-owner.lock') {
        if (ignoreOwner) continue
        fault('backup_invalid')
      }
      const name = directory ? `${directory}/${entry.name}` : entry.name
      if (!safeName(name) || directories.length + files.length >= MAX_ENTRIES)
        fault('backup_invalid')
      if (entry.isSymbolicLink()) fault('backup_symlink')
      if (entry.isDirectory()) {
        directories.push(name)
        await visit(name)
      } else if (entry.isFile()) files.push(name)
      else fault('backup_invalid')
    }
  }
  await visit('')
  return { directories: directories.sort(), files: files.sort() }
}
export async function createMemoryBackup(
  root: string,
  parent: string
): Promise<MaintenanceReceipt> {
  if (typeof parent !== 'string' || !isAbsolute(parent)) fault('backup_location_invalid')
  const destination = await realpath(parent)
  if (inside(await realpath(root), destination)) fault('backup_location_invalid')
  const stamp = new Date().toISOString()
  const path = join(
    destination,
    `AI-Memory-${stamp.replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`
  )
  const staging = `${path}.incomplete`
  await mkdir(join(staging, 'data'), { recursive: true, mode: 0o700 })
  let published = false
  try {
    const tree = await scan(root, true)
    const files: Entry[] = []
    let total = 0
    for (const directory of tree.directories)
      await mkdir(join(staging, 'data', directory), { recursive: true, mode: 0o700 })
    for (const name of tree.files) {
      const bytes = await bytesAt(join(root, name))
      total += bytes.length
      if (total > MAX_TOTAL) fault('backup_too_large')
      await write(join(staging, 'data', name), bytes)
      files.push({ path: name, bytes: bytes.length, sha256: digest(bytes) })
    }
    const manifest: Manifest = {
      format: 'flyenv-ai-memory',
      version: 1,
      createdAt: stamp,
      directories: tree.directories,
      files
    }
    await write(join(staging, 'manifest.json'), JSON.stringify(manifest))
    await syncDirectory(staging)
    await rename(staging, path)
    published = true
    // Publication already succeeded; durability warnings do not invite duplicate snapshots.
    const warnings: string[] = []
    await syncDirectory(destination).catch(() => warnings.push('backup_sync_warning'))
    return {
      path,
      createdAt: stamp,
      files: files.length,
      bytes: total,
      ...(warnings.length ? { warnings } : {})
    }
  } finally {
    if (!published) await rm(staging, { recursive: true, force: true }).catch(() => {})
  }
}
async function stageBackup(source: string, stage: string) {
  const manifest: Manifest = JSON.parse(
    (await bytesAt(join(source, 'manifest.json'), 16 * 1024 * 1024)).toString('utf8')
  )
  if (
    manifest?.format !== 'flyenv-ai-memory' ||
    manifest.version !== 1 ||
    !Number.isFinite(Date.parse(manifest.createdAt)) ||
    !Array.isArray(manifest.files) ||
    !Array.isArray(manifest.directories) ||
    manifest.files.length + manifest.directories.length > MAX_ENTRIES
  )
    fault('backup_invalid')
  const names = new Set<string>()
  for (const name of manifest.directories) {
    if (!safeName(name) || names.has(name)) fault('backup_invalid')
    names.add(name)
  }
  for (const item of manifest.files) {
    if (
      !item ||
      !safeName(item.path) ||
      names.has(item.path) ||
      !Number.isSafeInteger(item.bytes) ||
      item.bytes < 0 ||
      item.bytes > MAX_FILE ||
      !/^[a-f0-9]{64}$/.test(item.sha256)
    )
      fault('backup_invalid')
    names.add(item.path)
  }
  const data = join(source, 'data')
  const tree = await scan(data)
  if (
    JSON.stringify(tree.files) !== JSON.stringify(manifest.files.map((item) => item.path).sort()) ||
    JSON.stringify(tree.directories) !== JSON.stringify([...manifest.directories].sort())
  )
    fault('backup_invalid')
  await mkdir(stage, { mode: 0o700 })
  for (const directory of tree.directories)
    await mkdir(join(stage, directory), { recursive: true, mode: 0o700 })
  let total = 0
  for (const item of manifest.files) {
    const bytes = await bytesAt(join(data, item.path))
    total += bytes.length
    if (total > MAX_TOTAL || bytes.length !== item.bytes || digest(bytes) !== item.sha256)
      fault('backup_invalid')
    await write(join(stage, item.path), bytes)
  }
  await syncDirectory(stage)
  return { createdAt: manifest.createdAt, files: manifest.files.length, bytes: total }
}
const journalPath = (root: string) => join(dirname(root), `.${basename(root)}.memory-restore.json`)
const exists = async (path: string) => {
  try {
    await lstat(path)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}
type RestoreJournal = {
  version: 2
  root: string
  stage: string
  rollback: string
  phase: 'moving' | 'installing' | 'committed'
  originalNames: string[]
  incomingNames: string[]
}
const payloadName = (name: unknown): name is string =>
  safeName(name) && !name.includes('/') && name !== '.flyenv-owner.lock'
async function saveJournal(root: string, entry: RestoreJournal) {
  await new AtomicFile().replace(journalPath(root), JSON.stringify(entry))
}
/** Root and its host-owned lock inode stay in place throughout backup, restore and recovery. */
export async function recoverMemoryRestore(
  root: string
): Promise<{ committed: boolean; warnings: string[] }> {
  const journal = journalPath(root)
  if (!(await exists(journal))) return { committed: false, warnings: [] }
  const entry: RestoreJournal = JSON.parse(
    (await bytesAt(journal, 16 * 1024 * 1024)).toString('utf8')
  )
  if (
    entry?.version !== 2 ||
    entry.root !== root ||
    !['moving', 'installing', 'committed'].includes(entry.phase) ||
    ![entry.originalNames, entry.incomingNames].every(
      (names) =>
        Array.isArray(names) &&
        names.length <= MAX_ENTRIES &&
        names.every(payloadName) &&
        new Set(names).size === names.length
    ) ||
    ![entry.stage, entry.rollback].every(
      (value) => typeof value === 'string' && dirname(value) === dirname(root)
    ) ||
    !/^\.memory-restore-stage-[a-f0-9-]{36}$/.test(basename(entry.stage)) ||
    !/^\.memory-restore-previous-[a-f0-9-]{36}$/.test(basename(entry.rollback))
  )
    fault('restore_recovery_required')
  if (!(await lstat(root)).isDirectory()) fault('restore_recovery_required')
  if (entry.phase !== 'committed') {
    // Return installed entries to stage before returning any original entries. This is
    // repeatable after interruption, even if a previous rollback already returned originals.
    if (entry.phase === 'installing') {
      for (const name of entry.incomingNames) {
        const staged = join(entry.stage, name)
        const installed = join(root, name)
        if (!(await exists(staged))) {
          if (!(await exists(installed))) fault('restore_recovery_required')
          await rename(installed, staged)
        }
      }
    }
    for (const name of entry.originalNames) {
      const previous = join(entry.rollback, name)
      const current = join(root, name)
      if (await exists(previous)) {
        if (await exists(current)) fault('restore_recovery_required')
        await rename(previous, current)
      } else if (!(await exists(current))) fault('restore_recovery_required')
    }
    await syncDirectory(root)
  }
  // The required data decision is complete. Cleanup must never disable memory access.
  const warnings: string[] = []
  let journalCleared = true
  await rm(journal).catch(() => {
    journalCleared = false
    warnings.push('restore_cleanup_warning')
  })
  await syncDirectory(dirname(root)).catch(() => warnings.push('restore_cleanup_warning'))
  for (const temporary of journalCleared ? [entry.stage, entry.rollback] : []) {
    await rm(temporary, { recursive: true, force: true }).catch(() =>
      warnings.push('restore_cleanup_warning')
    )
  }
  return { committed: entry.phase === 'committed', warnings: [...new Set(warnings)] }
}
export class RestoreFailure extends Error {
  constructor(
    code: string,
    readonly receipt?: MaintenanceReceipt
  ) {
    super(code)
  }
}
export async function restoreMemoryBackup(
  root: string,
  source: string
): Promise<MaintenanceReceipt> {
  if (typeof source !== 'string' || !isAbsolute(source)) fault('backup_invalid')
  const canonical = await realpath(source)
  const current = await realpath(root)
  if (inside(current, canonical) || inside(canonical, current)) fault('backup_location_invalid')
  const stage = join(dirname(root), `.memory-restore-stage-${randomUUID()}`)
  const rollback = join(dirname(root), `.memory-restore-previous-${randomUUID()}`)
  let safety: MaintenanceReceipt | undefined
  let incoming: Awaited<ReturnType<typeof stageBackup>> | undefined
  const receipt = (): MaintenanceReceipt => ({
    path: canonical,
    ...incoming!,
    safetyBackupPath: safety!.path
  })
  try {
    incoming = await stageBackup(canonical, stage)
    safety = await createMemoryBackup(root, dirname(root))
    const originalNames = (await readdir(root)).filter((name) => name !== '.flyenv-owner.lock')
    const incomingNames = await readdir(stage)
    await mkdir(rollback, { mode: 0o700 })
    const journal: RestoreJournal = {
      version: 2,
      root,
      stage,
      rollback,
      phase: 'moving',
      originalNames,
      incomingNames
    }
    await saveJournal(root, journal)
    for (const name of originalNames) await rename(join(root, name), join(rollback, name))
    journal.phase = 'installing'
    await saveJournal(root, journal)
    for (const name of incomingNames) await rename(join(stage, name), join(root, name))
    await syncDirectory(root)
    journal.phase = 'committed'
    await saveJournal(root, journal)
    const cleanup = await recoverMemoryRestore(root)
    const warnings = [...(safety.warnings ?? []), ...cleanup.warnings]
    return { ...receipt(), ...(warnings.length ? { warnings: [...new Set(warnings)] } : {}) }
  } catch {
    if (await exists(journalPath(root))) {
      let recovered: Awaited<ReturnType<typeof recoverMemoryRestore>>
      try {
        recovered = await recoverMemoryRestore(root)
      } catch {
        throw new RestoreFailure('restore_recovery_required', safety)
      }
      // An uncertain journal sync can still leave a durable committed receipt.
      if (recovered.committed && safety && incoming)
        return { ...receipt(), warnings: recovered.warnings }
    }
    throw new RestoreFailure('restore_failed', safety)
  } finally {
    if (!(await exists(journalPath(root)))) {
      await rm(stage, { recursive: true, force: true }).catch(() => {})
      await rm(rollback, { recursive: true, force: true }).catch(() => {})
    }
  }
}
