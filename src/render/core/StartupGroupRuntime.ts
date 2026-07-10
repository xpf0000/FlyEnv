import type { ModuleStartOptions } from './Module/Module'
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
  stop(): Promise<string | boolean>
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
  modules: StartupGroupRuntimeModule[]
  getInstalled(module: AllAppModule): Promise<StartupGroupInstalledTarget[]>
  getProjects(module: AllAppModule): Promise<StartupGroupProjectTarget[]>
}

export type StartupGroupCandidate = {
  key: string
  label: string
  moduleLabel: string
  item: StartupGroupItem
  port?: number
}

export type StartupGroupCandidateWarning = 'same-module' | 'same-port'

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
  const installedModule = (item: StartupGroupItem): AllAppModule =>
    item.type === 'service-version' && item.module === 'php-fpm' ? 'php' : item.module

  const installedTarget = async (item: StartupGroupItem) => {
    if (item.type !== 'service-version') return undefined
    const installed = await dependencies.getInstalled(installedModule(item))
    return installed.find((target) => target.path === item.versionPath)
  }

  const projectTarget = async (item: StartupGroupItem) => {
    if (item.type !== 'language-project') return undefined
    const projects = await dependencies.getProjects(item.module)
    return projects.find((project) => project.id === item.projectId && project.isService)
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
          stopOtherVersions: false
        })
      )
    },
    stop: async (item) => {
      const target = await installedTarget(item)
      if (!target) throw new Error('Service version not found')
      await ensureSuccess(target.stop())
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
    const serviceModules = dependencies.modules.filter(
      (module) => module.isService && module.moduleType !== 'language'
    )
    const phpFpm = dependencies.modules.find((module) => module.typeFlag === 'php-fpm')
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
          item,
          port: target.port
        })
      }
    }

    for (const module of dependencies.modules.filter((item) => item.moduleType === 'language')) {
      const projects = await dependencies.getProjects(module.typeFlag)
      for (const project of projects.filter((item) => item.isService)) {
        const item: StartupGroupItem = {
          id: dependencies.createId(),
          type: 'language-project',
          module: module.typeFlag,
          projectId: project.id
        }
        candidates.push({
          key: getStartupGroupItemKey(item),
          label: project.comment || project.path,
          moduleLabel: moduleLabel(module),
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
