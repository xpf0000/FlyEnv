import type { AllAppModule } from '@/core/type'
import { reactiveBind } from '@/util/Index'
import { StartupGroup } from './StartupGroup'
import { StartupGroupRunner } from './StartupGroupRunner'
import type {
  StartupGroupAdapter,
  StartupGroupCandidateData,
  StartupGroupInstalledTarget,
  StartupGroupItem,
  StartupGroupProjectTarget,
  StartupGroupRuntimeDependencies,
  StartupGroupRuntimeModule
} from '../type'

class StartupGroupServiceAdapter implements StartupGroupAdapter {
  constructor(private readonly runtime: StartupGroupRuntime) {}
  async exists(item: StartupGroupItem) {
    return !!(await this.runtime.installedTarget(item))
  }
  async getState(item: StartupGroupItem) {
    const target = await this.runtime.installedTarget(item)
    if (!target) return 'invalid' as const
    if (target.running) return 'executing' as const
    return target.run ? ('running' as const) : ('stopped' as const)
  }
  async start(item: StartupGroupItem) {
    const target = await this.runtime.installedTarget(item)
    if (!target) throw new Error('Service version not found')
    await this.runtime.ensureSuccess(target.start())
  }
  async stop(item: StartupGroupItem) {
    const target = await this.runtime.installedTarget(item)
    if (!target) throw new Error('Service version not found')
    await this.runtime.ensureSuccess(target.stop())
  }
}

class StartupGroupProjectAdapter implements StartupGroupAdapter {
  constructor(private readonly runtime: StartupGroupRuntime) {}
  async exists(item: StartupGroupItem) {
    return !!(await this.runtime.projectTarget(item))
  }
  async getState(item: StartupGroupItem) {
    const target = await this.runtime.projectTarget(item)
    if (!target) return 'invalid' as const
    if (target.state.running) return 'executing' as const
    return target.state.isRun ? ('running' as const) : ('stopped' as const)
  }
  async start(item: StartupGroupItem) {
    const target = await this.runtime.projectTarget(item)
    if (!target) throw new Error('Language project not found')
    await this.runtime.ensureSuccess(target.start(false))
  }
  async stop(item: StartupGroupItem) {
    const target = await this.runtime.projectTarget(item)
    if (!target) throw new Error('Language project not found')
    await this.runtime.ensureSuccess(target.stop(false))
  }
}

export class StartupGroupRuntime {
  readonly runner: StartupGroupRunner
  private projectSources = new Map<AllAppModule, Promise<StartupGroupProjectTarget[]>>()
  private serviceAdapter: StartupGroupServiceAdapter
  private projectAdapter: StartupGroupProjectAdapter

  constructor(private readonly dependencies: StartupGroupRuntimeDependencies) {
    this.serviceAdapter = reactiveBind(new StartupGroupServiceAdapter(this))
    this.projectAdapter = reactiveBind(new StartupGroupProjectAdapter(this))
    this.runner = reactiveBind(new StartupGroupRunner((item) => this.getAdapter(item)))
  }

  private projectsFor(module: AllAppModule) {
    let source = this.projectSources.get(module)
    if (!source) {
      source = this.dependencies.getProjects(module).catch((error) => {
        this.projectSources.delete(module)
        throw error
      })
      this.projectSources.set(module, source)
    }
    return source
  }

  private installedModule(item: StartupGroupItem): AllAppModule {
    return item.type === 'service-version' && item.module === 'php-fpm' ? 'php' : item.module
  }

  async installedTarget(item: StartupGroupItem): Promise<StartupGroupInstalledTarget | undefined> {
    if (item.type !== 'service-version') return undefined
    const installed = await this.dependencies.getInstalled(this.installedModule(item))
    return installed.find((target) => target.path === item.versionPath)
  }

  async projectTarget(item: StartupGroupItem): Promise<StartupGroupProjectTarget | undefined> {
    if (item.type !== 'language-project') return undefined
    const projects = await this.projectsFor(item.module)
    const project = projects.find(
      (target) =>
        target.id === item.projectId && target.path === item.projectPath && target.isService
    )
    return project && (await this.dependencies.pathExists(project.path)) ? project : undefined
  }

  getAdapter(item: StartupGroupItem): StartupGroupAdapter {
    return item.type === 'service-version' ? this.serviceAdapter : this.projectAdapter
  }

  moduleLabel(module: StartupGroupRuntimeModule) {
    return typeof module.label === 'function' ? module.label() : module.label || module.typeFlag
  }

  async ensureSuccess(result: Promise<string | boolean>) {
    const value = await result
    if (typeof value === 'string') throw new Error(value)
    if (value === false) throw new Error('Operation failed')
  }

  async listCandidates(): Promise<StartupGroupCandidateData[]> {
    const candidates: StartupGroupCandidateData[] = []
    const modules = this.dependencies.getModules()
    const serviceModules = modules.filter(
      (module) => module.isService && module.moduleType !== 'language'
    )
    const phpFpm = modules.find((module) => module.typeFlag === 'php-fpm')
    if (phpFpm) serviceModules.push(phpFpm)
    for (const module of serviceModules) {
      const installed = await this.dependencies.getInstalled(
        module.typeFlag === 'php-fpm' ? 'php' : module.typeFlag
      )
      for (const target of installed.filter((item) => item.enable)) {
        const item: StartupGroupItem = {
          id: this.dependencies.createId(),
          type: 'service-version',
          module: module.typeFlag,
          versionBin: target.bin,
          versionPath: target.path
        }
        const label = this.moduleLabel(module)
        candidates.push({
          key: StartupGroup.itemKey(item),
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
      const projects = await this.projectsFor(module.typeFlag)
      for (const project of projects.filter((item) => item.isService)) {
        const item: StartupGroupItem = {
          id: this.dependencies.createId(),
          type: 'language-project',
          module: module.typeFlag,
          projectId: project.id,
          projectPath: project.path
        }
        const label = this.moduleLabel(module)
        candidates.push({
          key: StartupGroup.itemKey(item),
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
}
