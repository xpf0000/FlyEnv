import { ProjectSetup } from '@/components/LanguageProjects/setup'
import { AppModules } from '@/core/App'
import type { AllAppModule } from '@/core/type'
import { BrewStore } from '@/store/brew'
import { reactiveBind, uuid } from '@/util/Index'
import { fs } from '@/util/NodeFn'
import { StorageGetAsync, StorageSetAsync } from '@/util/Storage'
import { StartupGroup } from './StartupGroup'
import { StartupGroupCandidate } from './StartupGroupCandidate'
import { StartupGroupRuntime } from './StartupGroupRuntime'
import { StartupGroupStore } from './StartupGroupStore'
import type {
  StartupGroupConfigData,
  StartupGroupItem,
  StartupGroupManagerDependencies,
  StartupGroupMemberState,
  StartupGroupResolvedMember
} from '../type'

const storageKey = 'flyenv-startup-groups'

export class StartupGroupManagerService {
  private loadingCount = 0

  constructor(
    readonly store: StartupGroupStore,
    readonly runtime: StartupGroupRuntime,
    readonly candidate: StartupGroupCandidate,
    private readonly dependencies: StartupGroupManagerDependencies
  ) {}

  get runner() {
    return this.runtime.runner
  }

  get loading() {
    return this.loadingCount > 0
  }

  get busy() {
    return this.loading || this.runner.executing
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
      return resolved.target.run ? 'running' : 'stopped'
    }
    if (resolved.target.state.running) return 'executing'
    return resolved.target.state.isRun ? 'running' : 'stopped'
  }

  isMemberRunning(item: StartupGroupItem) {
    const resolved = this.resolveMember(item)
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

  setGroupEnabled(group: StartupGroup, enabled: boolean) {
    if (this.busy) return Promise.resolve(undefined)
    return enabled ? group.start() : group.stop()
  }

  setMemberEnabled(group: StartupGroup, item: StartupGroupItem, enabled: boolean) {
    if (this.busy) return Promise.resolve(undefined)
    return group.setMemberEnabled(item, enabled)
  }
}

const platformModules = () => {
  const platform = window.Server.isMacOS
    ? 'macOS'
    : window.Server.isWindows
      ? 'Windows'
      : window.Server.isLinux
        ? 'Linux'
        : undefined
  return platform
    ? AppModules.filter((item) => !item.platform || item.platform.includes(platform))
    : []
}

const runtime = reactiveBind(
  new StartupGroupRuntime({
    createId: uuid,
    getModules: platformModules,
    getInstalled: async (module: AllAppModule) => {
      const manager = BrewStore().module(module)
      await manager.fetchInstalled()
      return manager.installed
    },
    getProjects: async (module: AllAppModule) => {
      const project = ProjectSetup(module)
      if (!project.fetched) await project.fetchProject()
      return project.project
    },
    pathExists: async (path: string) => fs.existsSync(path)
  })
)
const store = reactiveBind(
  new StartupGroupStore(runtime.runner, {
    createId: uuid,
    now: Date.now,
    get: () => StorageGetAsync<StartupGroupConfigData>(storageKey),
    set: (value) => StorageSetAsync(storageKey, value)
  })
)
const candidate = reactiveBind(new StartupGroupCandidate(uuid))

export const StartupGroupManager = reactiveBind(
  new StartupGroupManagerService(store, runtime, candidate, {
    getInstalled: (module: AllAppModule) => BrewStore().module(module).installed,
    fetchInstalled: (module: AllAppModule) => BrewStore().module(module).fetchInstalled(),
    getProjectSource: (module: AllAppModule) => ProjectSetup(module),
    getModuleLabel: (module: AllAppModule) => {
      const label = AppModules.find((item) => item.typeFlag === module)?.label
      return typeof label === 'function' ? label() : label
    }
  })
)
