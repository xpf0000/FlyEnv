import { mkdir, open, opendir, realpath, stat, readdir } from 'node:fs/promises'
import { basename, isAbsolute, join, relative, sep } from 'node:path'
import { randomUUID } from 'node:crypto'
import type {
  MemoryProjectInfo,
  MemoryResult,
  ProjectMappingInspection,
  ProjectRecoveryReport,
  ResolvedScope,
  ScopeRef
} from '../shared'
import { isUuid, MemoryFault } from '../core/validation'
import { AtomicFile, AtomicWriteFailure } from './AtomicFile'

type ProjectEntry = { id: string; name: string; canonical_path: string; created_at: string }
type Mapping = { schema_version: 1; revision: number; projects: ProjectEntry[] }
const MAX_MAPPING_BYTES = 4 * 1024 * 1024
const empty = (): Mapping => ({ schema_version: 1, revision: 0, projects: [] })
const exists = async (path: string) => {
  try {
    await stat(path)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}
const isAncestor = (parent: string, path: string) => {
  const child = relative(parent, path)
  return !!child && child !== '..' && !child.startsWith(`..${sep}`) && !isAbsolute(child)
}

/** Project registration is serialized separately from per-scope record work. */
export class ProjectRegistry {
  private mapping?: Mapping
  private tail: Promise<void> = Promise.resolve()
  constructor(
    private readonly root: string,
    private readonly atomic: Pick<AtomicFile, 'replace'> = new AtomicFile()
  ) {}

  private queued<T>(work: () => Promise<T>): Promise<T> {
    const task = this.tail.then(work)
    this.tail = task.then(
      () => {},
      () => {}
    )
    return task
  }
  private projectScope(entry: ProjectEntry): ResolvedScope {
    return Object.freeze({
      key: `project:${entry.id}`,
      directory: join(this.root, 'projects', entry.id),
      projectId: entry.id
    })
  }
  private failure(error: unknown): MemoryResult<never> {
    if (error instanceof AtomicWriteFailure)
      return {
        outcome: error.outcome,
        error_code:
          error.outcome === 'unknown'
            ? 'project_registration_unknown'
            : 'project_registration_failed'
      }
    if (error instanceof MemoryFault) return { outcome: error.outcome, error_code: error.code }
    return { outcome: 'failed', error_code: 'project_registry_unavailable' }
  }
  private async readMapping(path: string): Promise<Mapping | undefined> {
    let file: Awaited<ReturnType<typeof open>>
    try {
      file = await open(path, 'r')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
      throw new MemoryFault('project_registry_unavailable')
    }
    try {
      const metadata = await file.stat()
      if (!metadata.isFile() || metadata.size > MAX_MAPPING_BYTES)
        throw new MemoryFault('project_registry_corrupt')
      // Bounded read protects recovery inspection from a damaged oversized mapping.
      const bytes = Buffer.alloc(Math.min(MAX_MAPPING_BYTES + 1, metadata.size + 1))
      const { bytesRead } = await file.read(bytes, 0, bytes.length, 0)
      const value = JSON.parse(bytes.subarray(0, bytesRead).toString('utf8'))
      if (value?.schema_version !== 1) throw new MemoryFault('project_registry_schema_unsupported')
      if (
        !Number.isSafeInteger(value.revision) ||
        value.revision < 0 ||
        !Array.isArray(value.projects)
      )
        throw new MemoryFault('project_registry_corrupt')
      const ids = new Set<string>()
      const paths = new Set<string>()
      for (const entry of value.projects) {
        if (
          !entry ||
          !isUuid(entry.id) ||
          typeof entry.name !== 'string' ||
          !entry.name ||
          entry.name.length > 8192 ||
          typeof entry.canonical_path !== 'string' ||
          !isAbsolute(entry.canonical_path) ||
          entry.canonical_path.includes('\0') ||
          typeof entry.created_at !== 'string' ||
          !Number.isFinite(Date.parse(entry.created_at)) ||
          ids.has(entry.id) ||
          paths.has(entry.canonical_path)
        )
          throw new MemoryFault('project_registry_corrupt')
        ids.add(entry.id)
        paths.add(entry.canonical_path)
      }
      return value as Mapping
    } catch (error) {
      if (error instanceof MemoryFault) throw error
      throw new MemoryFault('project_registry_corrupt')
    } finally {
      await file.close()
    }
  }
  private async load(): Promise<Mapping> {
    if (this.mapping) return this.mapping
    const mapping = await this.readMapping(join(this.root, 'projects.json'))
    if (mapping) return (this.mapping = mapping)
    if (await exists(join(this.root, 'projects.previous.json')))
      throw new MemoryFault('project_registry_missing')
    // Only a missing primary needs this one-entry check. Normal startup never enumerates projects.
    let directory: Awaited<ReturnType<typeof opendir>> | undefined
    try {
      directory = await opendir(join(this.root, 'projects'))
      if (await directory.read()) throw new MemoryFault('project_registry_missing')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    } finally {
      await directory?.close()
    }
    return (this.mapping = empty())
  }
  resolve(
    ref: ScopeRef,
    options: { create: boolean; createProject?: boolean }
  ): Promise<ResolvedScope | MemoryResult<never>> {
    if (ref.scope === 'global')
      return Promise.resolve(Object.freeze({ key: 'global', directory: join(this.root, 'global') }))
    return this.queued(async () => {
      try {
        if (
          typeof ref.project_path !== 'string' ||
          !isAbsolute(ref.project_path) ||
          ref.project_path.includes('\0')
        )
          throw new MemoryFault('invalid_project_path')
        let canonical: string
        try {
          canonical = await realpath(ref.project_path)
          if (!(await stat(canonical)).isDirectory()) throw new Error()
        } catch {
          throw new MemoryFault('invalid_project_path')
        }
        const mapping = await this.load()
        const known = mapping.projects.find((entry) => entry.canonical_path === canonical)
        if (known) return this.projectScope(known)
        const candidates = mapping.projects
          .filter((entry) => isAncestor(entry.canonical_path, canonical))
          .sort((a, b) => b.canonical_path.length - a.canonical_path.length)
          .map((entry) => ({ name: entry.name, project_path: entry.canonical_path }))
        if (!options.create)
          return {
            outcome: 'success' as const,
            error_code: 'project_unregistered',
            ...(candidates.length ? { project_candidates: candidates } : {})
          }
        if (candidates.length && !options.createProject)
          return {
            outcome: 'failed' as const,
            error_code: 'project_selection_required',
            project_candidates: candidates
          }
        const entry: ProjectEntry = {
          id: randomUUID(),
          name: basename(canonical) || canonical,
          canonical_path: canonical,
          created_at: new Date().toISOString()
        }
        const next: Mapping = {
          schema_version: 1,
          revision: mapping.revision + 1,
          projects: [...mapping.projects, entry]
        }
        if (Buffer.byteLength(JSON.stringify(next)) > MAX_MAPPING_BYTES)
          throw new MemoryFault('project_registry_capacity_exceeded')
        const current = await this.readMapping(join(this.root, 'projects.json'))
        if (
          (!current && mapping.revision !== 0) ||
          (current && JSON.stringify(current) !== JSON.stringify(mapping))
        ) {
          this.mapping = undefined
          throw new MemoryFault(current ? 'project_registry_changed' : 'project_registry_missing')
        }
        await mkdir(this.root, { recursive: true, mode: 0o700 })
        // Both replacements are required; primary was never attempted if preserving previous fails.
        try {
          await this.atomic.replace(
            join(this.root, 'projects.previous.json'),
            JSON.stringify(mapping)
          )
        } catch {
          throw new MemoryFault('project_previous_save_failed')
        }
        try {
          await this.atomic.replace(join(this.root, 'projects.json'), JSON.stringify(next))
        } catch (error) {
          // The current call must not write any dependent record. Next call reloads and validates disk.
          if (error instanceof AtomicWriteFailure && error.outcome === 'unknown')
            this.mapping = undefined
          throw error
        }
        this.mapping = next
        return this.projectScope(entry)
      } catch (error) {
        return this.failure(error)
      }
    })
  }
  resolveById(projectId: string): Promise<ResolvedScope | MemoryResult<never>> {
    return this.queued(async () => {
      try {
        if (!isUuid(projectId)) throw new MemoryFault('invalid_project_id')
        const entry = (await this.load()).projects.find((project) => project.id === projectId)
        if (!entry) throw new MemoryFault('project_not_found')
        return this.projectScope(entry)
      } catch (error) {
        return this.failure(error)
      }
    })
  }
  listProjects(): Promise<MemoryResult<MemoryProjectInfo[]>> {
    return this.queued(async () => {
      try {
        const data = await Promise.all(
          (await this.load()).projects.map(async (entry) => {
            let path_status: MemoryProjectInfo['path_status'] = 'available'
            try {
              if (!(await stat(entry.canonical_path)).isDirectory()) path_status = 'missing'
            } catch (error) {
              path_status =
                (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'missing' : 'unavailable'
            }
            return {
              projectId: entry.id,
              name: entry.name,
              project_path: entry.canonical_path,
              path_status
            }
          })
        )
        return { outcome: 'success', data }
      } catch (error) {
        return this.failure(error)
      }
    })
  }
  inspectRecovery(): Promise<ProjectRecoveryReport> {
    return this.queued(async () => {
      const inspect = async (name: string): Promise<ProjectMappingInspection> => {
        try {
          const value = await this.readMapping(join(this.root, name))
          return value
            ? {
                status: 'valid',
                revision: value.revision,
                projectIds: value.projects.map((entry) => entry.id)
              }
            : { status: 'missing' }
        } catch (error) {
          return { status: 'invalid', error_code: this.failure(error).error_code }
        }
      }
      const [primary, previous] = await Promise.all([
        inspect('projects.json'),
        inspect('projects.previous.json')
      ])
      const warnings: ProjectRecoveryReport['warnings'] = []
      const entries = await readdir(join(this.root, 'projects'), { withFileTypes: true }).catch(
        (error) => {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
            warnings.push({ code: 'project_directories_unavailable' })
          return []
        }
      )
      const projectDirectoryIds = entries
        .filter((entry) => entry.isDirectory() && isUuid(entry.name))
        .map((entry) => entry.name)
        .sort()
      return {
        primary,
        previous,
        projectDirectoryIds,
        unmappedProjectIds: projectDirectoryIds.filter((id) => !primary.projectIds?.includes(id)),
        unmappedAfterPreviousRestore: projectDirectoryIds.filter(
          (id) => !previous.projectIds?.includes(id)
        ),
        warnings
      }
    })
  }
}
