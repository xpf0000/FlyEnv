import type { Dirent } from 'node:fs'
import { mkdir, open, opendir, realpath, stat, readdir } from 'node:fs/promises'
import {
  basename,
  isAbsolute,
  join,
  relative,
  sep,
  win32,
  posix,
  resolve,
  dirname
} from 'node:path'
import { randomUUID } from 'node:crypto'
import type {
  MemoryProjectInfo,
  MemoryResult,
  ProjectMappingInspection,
  ProjectRecoveryReport,
  ProjectRelinkInput,
  ProjectRelinkReceipt,
  ResolvedScope,
  ScopeRef
} from '../shared'
import { isUuid, MemoryFault } from '../core/validation'
import { validateProjectMerge, MAX_PROJECT_GROUP_SCOPES } from './ProjectMerge'
import { AtomicFile, AtomicWriteFailure } from './AtomicFile'

type ProjectEntry = {
  id: string
  name: string
  canonical_path: string
  created_at: string
  merged_into?: string
}
type Mapping = { schema_version: 1 | 2; revision: number; projects: ProjectEntry[] }
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
  private readonly relinkProofs = new Map<string, { sourcePath: string; selectedPath?: string }>()
  private groupIndex?: { mapping: Mapping; groups: Map<string, ProjectEntry[]> }
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
  private groupEntries(mapping: Mapping, entry: ProjectEntry) {
    if (this.groupIndex?.mapping !== mapping) {
      const groups = new Map<string, ProjectEntry[]>()
      for (const project of mapping.projects) {
        const id = project.merged_into ?? project.id
        const group = groups.get(id) ?? []
        group.push(project)
        groups.set(id, group)
      }
      for (const [id, group] of groups)
        group.sort((a, b) => Number(b.id === id) - Number(a.id === id) || a.id.localeCompare(b.id))
      this.groupIndex = { mapping, groups }
    }
    return this.groupIndex.groups.get(entry.merged_into ?? entry.id) ?? []
  }
  private projectScope(entry: ProjectEntry): ResolvedScope {
    const group = this.mapping ? this.groupEntries(this.mapping, entry) : [entry]
    return Object.freeze({
      key: `project:${entry.id}`,
      directory: join(this.root, 'projects', entry.id),
      projectId: entry.id,
      ...(group.length > 1
        ? {
            projectGroup: {
              id: entry.merged_into ?? entry.id,
              projectIds: group.map((project) => project.id)
            }
          }
        : {})
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
      if (![1, 2].includes(value?.schema_version))
        throw new MemoryFault('project_registry_schema_unsupported')
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
          !(posix.isAbsolute(entry.canonical_path) || win32.isAbsolute(entry.canonical_path)) ||
          entry.canonical_path.includes('\0') ||
          typeof entry.created_at !== 'string' ||
          !Number.isFinite(Date.parse(entry.created_at)) ||
          ids.has(entry.id) ||
          (!entry.merged_into && paths.has(entry.canonical_path)) ||
          (entry.merged_into !== undefined &&
            (value.schema_version !== 2 ||
              !isUuid(entry.merged_into) ||
              entry.merged_into === entry.id))
        )
          throw new MemoryFault('project_registry_corrupt')
        ids.add(entry.id)
        if (!entry.merged_into) paths.add(entry.canonical_path)
      }
      const entriesById = new Map<string, ProjectEntry>(
        value.projects.map((entry: ProjectEntry) => [entry.id, entry])
      )
      for (const entry of value.projects as ProjectEntry[]) {
        if (
          entry.merged_into &&
          (!entriesById.has(entry.merged_into) || entriesById.get(entry.merged_into)!.merged_into)
        )
          throw new MemoryFault('project_registry_corrupt')
        if (!entry.merged_into && this.groupEntries(value, entry).length > MAX_PROJECT_GROUP_SCOPES)
          throw new MemoryFault('project_registry_corrupt')
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
  private async assertCurrent(mapping: Mapping) {
    const current = await this.readMapping(join(this.root, 'projects.json'))
    if (
      (!current && mapping.revision !== 0) ||
      (current && JSON.stringify(current) !== JSON.stringify(mapping))
    ) {
      this.mapping = undefined
      throw new MemoryFault(current ? 'project_registry_changed' : 'project_registry_missing')
    }
  }
  private async persist(mapping: Mapping, next: Mapping) {
    await this.assertCurrent(mapping)
    await mkdir(this.root, { recursive: true, mode: 0o700 })
    // Both replacements are required; primary was never attempted if preserving previous fails.
    try {
      await this.atomic.replace(join(this.root, 'projects.previous.json'), JSON.stringify(mapping))
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
  }
  relink(raw: ProjectRelinkInput): Promise<MemoryResult<ProjectRelinkReceipt>> {
    let input: ProjectRelinkInput
    try {
      input = structuredClone(raw)
      if (
        !input ||
        typeof input !== 'object' ||
        Object.keys(input).some(
          (key) =>
            ![
              'projectId',
              'expectedPath',
              'newPath',
              'selectedPath',
              'mergeWith',
              'mergeRevision'
            ].includes(key)
        ) ||
        !isUuid(input.projectId) ||
        [input.expectedPath, input.newPath].some(
          (value) =>
            typeof value !== 'string' || !value || value.length > 8192 || value.includes('\0')
        ) ||
        !isAbsolute(input.newPath) ||
        ((input.mergeWith !== undefined || input.mergeRevision !== undefined) &&
          (!isUuid(input.mergeWith) ||
            input.mergeWith === input.projectId ||
            !Number.isSafeInteger(input.mergeRevision) ||
            input.mergeRevision! < 0))
      )
        throw new MemoryFault('invalid_input')
      if (
        typeof input.selectedPath !== 'string' ||
        !input.selectedPath ||
        input.selectedPath.length > 8192 ||
        input.selectedPath.includes('\0') ||
        !isAbsolute(input.selectedPath)
      )
        delete input.selectedPath
    } catch {
      return Promise.resolve({ outcome: 'failed', error_code: 'invalid_input' })
    }
    return this.queued(async () => {
      try {
        const mapping = await this.load()
        const entry = mapping.projects.find((project) => project.id === input.projectId)
        if (!entry) throw new MemoryFault('project_not_found')
        if (entry.merged_into) return { outcome: 'conflict', error_code: 'project_already_merged' }
        let canonical: string
        try {
          canonical = await realpath(input.newPath)
          if (!(await stat(canonical)).isDirectory()) throw new Error()
        } catch {
          throw new MemoryFault('invalid_project_path')
        }
        const proofKey = JSON.stringify([
          entry.id,
          input.expectedPath,
          canonical,
          input.selectedPath ?? null
        ])
        const proof = this.relinkProofs.get(proofKey)
        let sourcePath = proof?.sourcePath ?? entry.canonical_path
        if (!proof && entry.canonical_path === canonical && input.expectedPath !== canonical) {
          // Optional old-selection proof must never negate an already confirmed primary mapping.
          const previous = await this.readMapping(join(this.root, 'projects.previous.json')).catch(
            () => undefined
          )
          if (
            previous?.projects.some(
              (project) => project.id === entry.id && project.canonical_path === input.expectedPath
            )
          )
            sourcePath = input.expectedPath
        }
        const target = mapping.projects.find(
          (project) =>
            !project.merged_into && project.id !== entry.id && project.canonical_path === canonical
        )
        const selectedSources = [
          sourcePath,
          ...(input.mergeWith && target?.id === input.mergeWith
            ? this.groupEntries(mapping, target).map((project) => project.canonical_path)
            : [])
        ]
        let selectedPath = proof?.selectedPath
        if (!selectedPath && input.selectedPath) {
          const normalized = resolve(input.selectedPath)
          const selectedCanonical = await realpath(input.selectedPath).catch(async () => {
            const parent = await realpath(dirname(normalized)).catch(() => undefined)
            return parent ? join(parent, basename(normalized)) : undefined
          })
          if (
            selectedSources.includes(normalized) ||
            (selectedCanonical && selectedSources.includes(selectedCanonical))
          )
            selectedPath = input.selectedPath
        }
        const receipt = (
          changed: boolean,
          mergedIds = this.groupEntries(mapping, entry)
            .filter((project) => project.id !== entry.id)
            .map((project) => project.id)
        ): ProjectRelinkReceipt => ({
          projectId: entry.id,
          name: entry.name,
          previousPath: sourcePath,
          ...(selectedPath ? { selectedPath } : {}),
          project_path: canonical,
          changed,
          ...(mergedIds.length ? { mergedProjectIds: mergedIds } : {}),
          ...(input.mergeWith ? { merged: true } : {})
        })
        // Confirm an uncertain prior commit without writing another mapping revision.
        if (
          entry.canonical_path === canonical &&
          (!input.mergeWith ||
            mapping.projects.some(
              (project) => project.id === input.mergeWith && project.merged_into === entry.id
            ))
        ) {
          await this.assertCurrent(mapping)
          return { outcome: 'success', data: receipt(false) }
        }
        if (entry.canonical_path !== input.expectedPath)
          return { outcome: 'conflict', error_code: 'project_path_changed' }
        const conflict = () => ({
          outcome: 'conflict' as const,
          error_code: 'project_path_in_use',
          project_conflict: target
            ? {
                projectId: target.id,
                name: target.name,
                project_path: target.canonical_path,
                revision: mapping.revision
              }
            : undefined
        })
        if (
          target &&
          (!input.mergeWith ||
            input.mergeWith !== target.id ||
            input.mergeRevision !== mapping.revision)
        )
          return conflict()
        if (input.mergeWith && !target)
          return { outcome: 'conflict', error_code: 'project_merge_choice_stale' }
        let mergedIds: string[] | undefined
        if (target) {
          const members = [
            ...this.groupEntries(mapping, entry),
            ...this.groupEntries(mapping, target)
          ]
          await validateProjectMerge(members.map((project) => this.projectScope(project)))
          mergedIds = members
            .filter((project) => project.id !== entry.id)
            .map((project) => project.id)
        }
        const next: Mapping = {
          ...mapping,
          ...(mergedIds ? { schema_version: 2 as const } : {}),
          revision: mapping.revision + 1,
          projects: mapping.projects.map((project) =>
            project.id === entry.id
              ? { ...project, canonical_path: canonical }
              : mergedIds?.includes(project.id)
                ? { ...project, merged_into: entry.id }
                : project
          )
        }
        if (Buffer.byteLength(JSON.stringify(next)) > MAX_MAPPING_BYTES)
          throw new MemoryFault('project_registry_capacity_exceeded')
        // Preserve verified selection identity independently of the rotating previous mapping.
        this.relinkProofs.set(proofKey, { sourcePath, ...(selectedPath ? { selectedPath } : {}) })
        if (this.relinkProofs.size > 128)
          this.relinkProofs.delete(this.relinkProofs.keys().next().value!)
        await this.persist(mapping, next)
        return { outcome: 'success', data: receipt(true, mergedIds) }
      } catch (error) {
        return this.failure(error)
      }
    })
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
        const known = mapping.projects.find(
          (entry) => !entry.merged_into && entry.canonical_path === canonical
        )
        if (known) return this.projectScope(known)
        const candidates = mapping.projects
          .filter((entry) => !entry.merged_into && isAncestor(entry.canonical_path, canonical))
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
          ...mapping,
          revision: mapping.revision + 1,
          projects: [...mapping.projects, entry]
        }
        if (Buffer.byteLength(JSON.stringify(next)) > MAX_MAPPING_BYTES)
          throw new MemoryFault('project_registry_capacity_exceeded')
        await this.persist(mapping, next)
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
          (await this.load()).projects
            .filter((entry) => !entry.merged_into)
            .map(async (entry) => {
              let path_status: MemoryProjectInfo['path_status'] = 'available'
              try {
                if (
                  !isAbsolute(entry.canonical_path) ||
                  !(await stat(entry.canonical_path)).isDirectory() ||
                  (await realpath(entry.canonical_path)) !== entry.canonical_path
                )
                  path_status = 'missing'
              } catch (error) {
                path_status =
                  (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'missing' : 'unavailable'
              }
              return {
                projectId: entry.id,
                name: entry.name,
                project_path: entry.canonical_path,
                path_status,
                ...(this.groupEntries(this.mapping!, entry).length > 1
                  ? {
                      mergedProjectIds: this.groupEntries(this.mapping!, entry)
                        .filter((project) => project.id !== entry.id)
                        .map((project) => project.id)
                    }
                  : {})
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
      const entries: Dirent[] = await readdir(join(this.root, 'projects'), {
        withFileTypes: true
      }).catch((error) => {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
          warnings.push({ code: 'project_directories_unavailable' })
        return []
      })
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
