import type { ModuleStartOptions, ModuleStopOptions } from './Module/Module'
import {
  createStartupGroupRunner,
  getStartupGroupItemKey,
  type StartupGroupAdapter,
  type StartupGroupItem
} from './StartupGroup'
import type { AllAppModule, AllAppModuleType } from './type'

export type StartupGroupInstalledTarget = {
  id?: string
  version: string | null
  bin: string
  path: string
  enable: boolean
  run: boolean
  running: boolean
  port?: number
  start(options?: ModuleStartOptions): Promise<string | boolean>
  stop(options?: ModuleStopOptions): Promise<string | boolean>
}

export type StartupGroupProjectTarget = {
  id: string
  comment?: string
  path: string
  isService: boolean
  projectPort?: number
  state: {
    isRun: boolean
    running: boolean
  }
  start(showMessage?: boolean): Promise<string | boolean>
  stop(showMessage?: boolean): Promise<boolean>
}

export type StartupGroupRuntimeModule = {
  typeFlag: AllAppModule
  moduleType?: AllAppModuleType
  label?: string | (() => string)
  isService?: boolean
}

export type StartupGroupRuntimeDependencies = {
  createId(): string
  getModules(): StartupGroupRuntimeModule[]
  getInstalled(module: AllAppModule): Promise<StartupGroupInstalledTarget[]>
  getProjects(module: AllAppModule): Promise<StartupGroupProjectTarget[]>
  pathExists(path: string): Promise<boolean>
}

export type StartupGroupCandidate = {
  key: string
  label: string
  moduleLabel: string
  moduleType: AllAppModuleType
  displayName: string
  displayPath: string
  item: StartupGroupItem
  port?: number
}

export type StartupGroupCandidateWarning = 'same-module' | 'same-port'

export function startupGroupCandidateMatchesItem(
  candidate: StartupGroupCandidate,
  item: StartupGroupItem
) {
  if (getStartupGroupItemKey(candidate.item) !== getStartupGroupItemKey(item)) return false
  return item.type !== 'language-project' || candidate.item.type !== 'language-project'
    ? item.type === candidate.item.type
    : candidate.item.projectPath === item.projectPath
}

export function startupGroupCandidateAllowsMultiple(candidate: StartupGroupCandidate) {
  return candidate.item.type === 'language-project' || candidate.item.module === 'php-fpm'
}

export function updateStartupGroupCandidateSelection(
  selectedKeys: string[],
  candidate: StartupGroupCandidate,
  candidates: StartupGroupCandidate[],
  selected: boolean
) {
  const next = selectedKeys.filter((key) => key !== candidate.key)
  if (!selected) return next

  if (startupGroupCandidateAllowsMultiple(candidate)) {
    return [...next, candidate.key]
  }

  const sameModuleKeys = new Set(
    candidates
      .filter(
        (item) => item.item.type === 'service-version' && item.item.module === candidate.item.module
      )
      .map((item) => item.key)
  )
  return [...next.filter((key) => !sameModuleKeys.has(key)), candidate.key]
}

export function normalizeStartupGroupCandidateSelection(
  selectedKeys: string[],
  candidates: StartupGroupCandidate[]
) {
  const candidateByKey = new Map(candidates.map((candidate) => [candidate.key, candidate]))
  return selectedKeys.reduce<string[]>((next, key) => {
    const candidate = candidateByKey.get(key)
    return candidate
      ? updateStartupGroupCandidateSelection(next, candidate, candidates, true)
      : next
  }, [])
}

export function filterValidStartupGroupItems(
  items: StartupGroupItem[],
  candidates: StartupGroupCandidate[]
) {
  const candidateByKey = new Map(candidates.map((candidate) => [candidate.key, candidate]))
  return items.filter((item) => {
    const candidate = candidateByKey.get(getStartupGroupItemKey(item))
    return candidate ? startupGroupCandidateMatchesItem(candidate, item) : false
  })
}

export function syncStartupGroupSelectedItems(
  items: StartupGroupItem[],
  candidates: StartupGroupCandidate[],
  selectedKeys: string[],
  createId: () => string
) {
  const candidateByKey = new Map(candidates.map((candidate) => [candidate.key, candidate]))
  const selected = new Set(selectedKeys)
  const used = new Set<string>()
  const next: StartupGroupItem[] = []

  for (const item of items) {
    const key = getStartupGroupItemKey(item)
    const candidate = candidateByKey.get(key)
    if (!candidate) {
      next.push(item)
      continue
    }
    if (startupGroupCandidateMatchesItem(candidate, item)) {
      if (selected.has(key)) {
        next.push(item)
        used.add(key)
      }
      continue
    }
    if (selected.has(key)) {
      next.push({ ...candidate.item, id: createId() })
      used.add(key)
    } else {
      next.push(item)
    }
  }

  for (const key of selectedKeys) {
    if (used.has(key)) continue
    const candidate = candidateByKey.get(key)
    if (candidate) {
      next.push({ ...candidate.item, id: createId() })
      used.add(key)
    }
  }
  return next
}

export function getStartupGroupCandidateWarnings(
  candidates: StartupGroupCandidate[],
  selectedKeys: string[]
) {
  const selected = candidates.filter((candidate) => selectedKeys.includes(candidate.key))
  const moduleCount = new Map<string, number>()
  const portCount = new Map<number, number>()

  for (const candidate of selected) {
    if (candidate.item.type === 'service-version') {
      moduleCount.set(candidate.item.module, (moduleCount.get(candidate.item.module) ?? 0) + 1)
    }
    if (candidate.port) {
      portCount.set(candidate.port, (portCount.get(candidate.port) ?? 0) + 1)
    }
  }

  const warnings = new Map<string, StartupGroupCandidateWarning[]>()
  for (const candidate of selected) {
    const itemWarnings: StartupGroupCandidateWarning[] = []
    if (
      candidate.item.type === 'service-version' &&
      (moduleCount.get(candidate.item.module) ?? 0) > 1
    ) {
      itemWarnings.push('same-module')
    }
    if (candidate.port && (portCount.get(candidate.port) ?? 0) > 1) {
      itemWarnings.push('same-port')
    }
    if (itemWarnings.length > 0) warnings.set(candidate.key, itemWarnings)
  }
  return warnings
}

function moduleLabel(module: StartupGroupRuntimeModule) {
  if (typeof module.label === 'function') return module.label()
  return module.label || module.typeFlag
}

async function ensureSuccess(result: Promise<string | boolean>) {
  const value = await result
  if (typeof value === 'string') throw new Error(value)
  if (value === false) throw new Error('Operation failed')
}

export function createStartupGroupRuntime(dependencies: StartupGroupRuntimeDependencies) {
  const projectSources = new Map<AllAppModule, Promise<StartupGroupProjectTarget[]>>()
  const projectsFor = (module: AllAppModule) => {
    let source = projectSources.get(module)
    if (!source) {
      source = dependencies.getProjects(module).catch((error) => {
        projectSources.delete(module)
        throw error
      })
      projectSources.set(module, source)
    }
    return source
  }

  const installedModule = (item: StartupGroupItem): AllAppModule =>
    item.type === 'service-version' && item.module === 'php-fpm' ? 'php' : item.module

  const installedTarget = async (item: StartupGroupItem) => {
    if (item.type !== 'service-version') return undefined
    const installed = await dependencies.getInstalled(installedModule(item))
    return installed.find((target) => target.path === item.versionPath)
  }

  const projectTarget = async (item: StartupGroupItem) => {
    if (item.type !== 'language-project') return undefined
    const projects = await projectsFor(item.module)
    const project = projects.find(
      (project) =>
        project.id === item.projectId && project.path === item.projectPath && project.isService
    )
    return project && (await dependencies.pathExists(project.path)) ? project : undefined
  }

  const serviceAdapter: StartupGroupAdapter = {
    exists: async (item) => !!(await installedTarget(item)),
    getState: async (item) => {
      const target = await installedTarget(item)
      if (!target) return 'invalid'
      if (target.running) return 'executing'
      return target.run ? 'running' : 'stopped'
    },
    start: async (item) => {
      const target = await installedTarget(item)
      if (!target) throw new Error('Service version not found')
      await ensureSuccess(
        target.start({
          updateCurrent: false,
          stopOtherVersions: false,
          exactTarget: true
        })
      )
    },
    stop: async (item) => {
      const target = await installedTarget(item)
      if (!target) throw new Error('Service version not found')
      await ensureSuccess(target.stop({ exactTarget: true }))
    }
  }

  const projectAdapter: StartupGroupAdapter = {
    exists: async (item) => !!(await projectTarget(item)),
    getState: async (item) => {
      const target = await projectTarget(item)
      if (!target) return 'invalid'
      if (target.state.running) return 'executing'
      return target.state.isRun ? 'running' : 'stopped'
    },
    start: async (item) => {
      const target = await projectTarget(item)
      if (!target) throw new Error('Language project not found')
      await ensureSuccess(target.start(false))
    },
    stop: async (item) => {
      const target = await projectTarget(item)
      if (!target) throw new Error('Language project not found')
      await ensureSuccess(target.stop(false))
    }
  }

  const getAdapter = (item: StartupGroupItem) =>
    item.type === 'service-version' ? serviceAdapter : projectAdapter

  const runner = createStartupGroupRunner(getAdapter)

  const listCandidates = async (): Promise<StartupGroupCandidate[]> => {
    const candidates: StartupGroupCandidate[] = []
    const modules = dependencies.getModules()
    const serviceModules = modules.filter(
      (module) => module.isService && module.moduleType !== 'language'
    )
    const phpFpm = modules.find((module) => module.typeFlag === 'php-fpm')
    if (phpFpm) serviceModules.push(phpFpm)

    for (const module of serviceModules) {
      const installed = await dependencies.getInstalled(
        module.typeFlag === 'php-fpm' ? 'php' : module.typeFlag
      )
      for (const target of installed.filter((item) => item.enable)) {
        const item: StartupGroupItem = {
          id: dependencies.createId(),
          type: 'service-version',
          module: module.typeFlag,
          versionBin: target.bin,
          versionPath: target.path
        }
        const label = moduleLabel(module)
        candidates.push({
          key: getStartupGroupItemKey(item),
          label: `${label} ${target.version || target.bin}`,
          moduleLabel: label,
          moduleType: module.moduleType ?? 'other',
          displayName: target.version || target.bin,
          displayPath: target.path,
          item,
          port: target.port
        })
      }
    }

    for (const module of modules.filter((item) => item.moduleType === 'language')) {
      const projects = await projectsFor(module.typeFlag)
      for (const project of projects.filter((item) => item.isService)) {
        if (!(await dependencies.pathExists(project.path))) continue
        const item: StartupGroupItem = {
          id: dependencies.createId(),
          type: 'language-project',
          module: module.typeFlag,
          projectId: project.id,
          projectPath: project.path
        }
        const label = moduleLabel(module)
        candidates.push({
          key: getStartupGroupItemKey(item),
          label: project.comment || project.path,
          moduleLabel: label,
          moduleType: module.moduleType ?? 'other',
          displayName: project.comment?.trim() || '',
          displayPath: project.path,
          item,
          port: project.projectPort
        })
      }
    }

    return candidates
  }

  return {
    getAdapter,
    listCandidates,
    runner
  }
}

export type StartupGroupRuntime = ReturnType<typeof createStartupGroupRuntime>
