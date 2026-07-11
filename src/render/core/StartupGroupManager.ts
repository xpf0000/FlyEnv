import type {
  StartupGroup,
  StartupGroupItem,
  StartupGroupMemberState,
  StartupGroupRunResult,
  StartupGroupRunner
} from './StartupGroup'
import type { StartupGroupInstalledTarget, StartupGroupProjectTarget } from './StartupGroupRuntime'
import type { AllAppModule } from './type'

export type StartupGroupProjectSource = {
  fetched: boolean
  project: StartupGroupProjectTarget[]
  fetchProject(): Promise<unknown>
}

export type StartupGroupManagerDependencies = {
  runner: Pick<StartupGroupRunner, 'isExecuting' | 'run'>
  getInstalled(module: AllAppModule): StartupGroupInstalledTarget[]
  fetchInstalled(module: AllAppModule): Promise<unknown>
  getProjectSource(module: AllAppModule): StartupGroupProjectSource
  getModuleLabel(module: AllAppModule): string | undefined
}

export type StartupGroupResolvedMember =
  | { type: 'service-version'; target: StartupGroupInstalledTarget }
  | { type: 'language-project'; target: StartupGroupProjectTarget }

export class StartupGroupManager {
  private loadingCount = 0

  constructor(private readonly dependencies: StartupGroupManagerDependencies) {}

  get loading() {
    return this.loadingCount > 0
  }

  get busy() {
    return this.loading || this.dependencies.runner.isExecuting
  }

  private installedModule(item: StartupGroupItem): AllAppModule {
    return item.type === 'service-version' && item.module === 'php-fpm' ? 'php' : item.module
  }

  resolveMember(item: StartupGroupItem): StartupGroupResolvedMember | undefined {
    if (item.type === 'service-version') {
      const target = this.dependencies
        .getInstalled(this.installedModule(item))
        .find((candidate) => candidate.path === item.versionPath)
      return target ? { type: item.type, target } : undefined
    }

    const target = this.dependencies
      .getProjectSource(item.module)
      .project.find(
        (candidate) =>
          candidate.id === item.projectId &&
          candidate.path === item.projectPath &&
          candidate.isService
      )
    return target ? { type: item.type, target } : undefined
  }

  getMemberState(item: StartupGroupItem): StartupGroupMemberState {
    const resolved = this.resolveMember(item)
    if (!resolved) return 'invalid'
    if (resolved.type === 'service-version') {
      if (resolved.target.running) return 'executing'
      return this.isMemberRunning(item) ? 'running' : 'stopped'
    }
    if (resolved.target.state.running) return 'executing'
    return this.isMemberRunning(item) ? 'running' : 'stopped'
  }

  isMemberRunning(item: StartupGroupItem) {
    const resolved = this.resolveMember(item)
    console.log('isMemberRunning: ', item, JSON.stringify(resolved))
    if (resolved?.type === 'service-version') return resolved.target.run
    if (resolved?.type === 'language-project') return resolved.target.state.isRun
    return false
  }

  getMemberTitle(item: StartupGroupItem) {
    const resolved = this.resolveMember(item)
    if (item.type === 'service-version') {
      return resolved?.type === 'service-version'
        ? resolved.target.version || item.versionBin
        : item.versionBin
    }
    if (resolved?.type === 'language-project') return resolved.target.comment?.trim() || ''
    return ''
  }

  getMemberModuleLabel(item: StartupGroupItem) {
    return this.dependencies.getModuleLabel(item.module) || item.module
  }

  getMemberDisplayTitle(item: StartupGroupItem, emptyProjectTitle = '') {
    const title =
      item.type === 'language-project'
        ? this.getMemberTitle(item) || emptyProjectTitle
        : this.getMemberTitle(item)
    return `${this.getMemberModuleLabel(item)} · ${title}`
  }

  getMemberPath(item: StartupGroupItem) {
    const resolved = this.resolveMember(item)
    if (resolved?.type === 'service-version') return resolved.target.path
    if (resolved?.type === 'language-project') return resolved.target.path
    return item.type === 'service-version' ? item.versionPath : item.projectPath
  }

  isGroupRunning(group: StartupGroup) {
    return group.items.some((item) => this.isMemberRunning(item))
  }

  isAnyGroupRunning(groups: StartupGroup[]) {
    return groups.some((group) => this.isGroupRunning(group))
  }

  isGroupExecuting(group: StartupGroup) {
    return group.items.some((item) => this.getMemberState(item) === 'executing')
  }

  isMemberDisabled(group: StartupGroup, item: StartupGroupItem) {
    return this.busy || this.isGroupExecuting(group) || this.getMemberState(item) === 'invalid'
  }

  async ensureSources(groups: StartupGroup[]) {
    const installed = new Set<AllAppModule>()
    const projects = new Set<AllAppModule>()
    for (const item of groups.flatMap((group) => group.items)) {
      if (item.type === 'service-version') installed.add(this.installedModule(item))
      else projects.add(item.module)
    }

    this.loadingCount += 1
    try {
      await Promise.all([
        ...[...installed].map((module) => this.dependencies.fetchInstalled(module)),
        ...[...projects].map(async (module) => {
          const source = this.dependencies.getProjectSource(module)
          if (!source.fetched) await source.fetchProject()
        })
      ])
    } finally {
      this.loadingCount -= 1
    }
  }

  setGroupEnabled(
    group: StartupGroup,
    enabled: boolean
  ): Promise<StartupGroupRunResult | undefined> {
    if (this.busy) return Promise.resolve(undefined)
    return this.dependencies.runner.run(group, enabled ? 'start' : 'stop')
  }

  setMemberEnabled(
    group: StartupGroup,
    item: StartupGroupItem,
    enabled: boolean
  ): Promise<StartupGroupRunResult | undefined> {
    if (this.busy) return Promise.resolve(undefined)
    return this.dependencies.runner.run({ ...group, items: [item] }, enabled ? 'start' : 'stop')
  }
}
