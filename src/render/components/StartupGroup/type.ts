import type { AllAppModule, AllAppModuleType } from '@/core/type'

export type StartupGroupServiceVersionItem = {
  id: string
  type: 'service-version'
  module: AllAppModule
  versionBin: string
  versionPath: string
}

export type StartupGroupLanguageProjectItem = {
  id: string
  type: 'language-project'
  module: AllAppModule
  projectId: string
  projectPath: string
}

export type StartupGroupItem = StartupGroupServiceVersionItem | StartupGroupLanguageProjectItem

export interface StartupGroupData {
  id: string
  name: string
  description?: string
  color?: string
  items: StartupGroupItem[]
  createdAt: number
  updatedAt: number
}

export interface StartupGroupConfigData {
  groups: StartupGroupData[]
  defaultStartupGroupId?: string
}

export type StartupGroupDraft = Pick<StartupGroupData, 'name' | 'description' | 'color' | 'items'>
export type StartupGroupMemberState = 'stopped' | 'running' | 'executing' | 'invalid'
export type StartupGroupCardState =
  'stopped' | 'running' | 'partial-running' | 'executing' | 'invalid'
export type StartupGroupRunAction = 'start' | 'stop'
export type StartupGroupMemberOutcome =
  'started' | 'stopped' | 'skipped' | 'failed' | 'not-run' | 'invalid'

export interface StartupGroupAdapter {
  exists(item: StartupGroupItem): Promise<boolean>
  getState(item: StartupGroupItem): Promise<StartupGroupMemberState>
  // 启动组只传授权意图，真实进程和 PID 仍由既有服务/项目 lifecycle 持有。
  start(item: StartupGroupItem, interactive?: boolean): Promise<void>
  stop(item: StartupGroupItem, interactive?: boolean): Promise<void>
}

export type StartupGroupRunMemberResult = {
  item: StartupGroupItem
  outcome: StartupGroupMemberOutcome
  error?: string
}

export type StartupGroupRunResult = {
  action: StartupGroupRunAction
  members: StartupGroupRunMemberResult[]
}

export interface StartupGroupRunnerContract {
  executing: boolean
  revision: number
  getItemState(item: StartupGroupItem): Promise<StartupGroupMemberState>
  getGroupState(group: StartupGroupData): Promise<StartupGroupCardState>
  // 默认为手动交互；自动启动必须显式 false，不能因通知关闭而推断权限意图。
  run(
    group: StartupGroupData,
    action: StartupGroupRunAction,
    interactive?: boolean
  ): Promise<StartupGroupRunResult>
}

export type StartupGroupHideStopResult = {
  ok: boolean
  reason?: 'runner-busy' | 'member-busy' | 'stop-failed' | 'not-stopped'
  result?: StartupGroupRunResult
  remaining: Array<{ item: StartupGroupItem; state: StartupGroupMemberState }>
}

export type StartupGroupInstalledTarget = {
  id?: string
  version: string | null
  bin: string
  path: string
  enable: boolean
  run: boolean
  running: boolean
  port?: number
  start(interactive?: boolean): Promise<string | boolean>
  stop(interactive?: boolean): Promise<string | boolean>
}

export type StartupGroupProjectTarget = {
  id: string
  comment?: string
  path: string
  isService: boolean
  projectPort?: number
  state: { isRun: boolean; running: boolean }
  start(
    showMessage?: boolean,
    runInTerminal?: boolean,
    interactive?: boolean
  ): Promise<string | boolean>
  stop(showMessage?: boolean, interactive?: boolean): Promise<boolean>
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

export type StartupGroupCandidateData = {
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

export type StartupGroupStoreDependencies = {
  createId(): string
  now(): number
  get(): Promise<StartupGroupConfigData | undefined>
  set(value: StartupGroupConfigData): Promise<unknown>
}

export type StartupGroupProjectSource = {
  fetched: boolean
  project: StartupGroupProjectTarget[]
  fetchProject(): Promise<unknown>
}

export type StartupGroupManagerDependencies = {
  getInstalled(module: AllAppModule): StartupGroupInstalledTarget[]
  fetchInstalled(module: AllAppModule): Promise<unknown>
  getProjectSource(module: AllAppModule): StartupGroupProjectSource
  getModuleLabel(module: AllAppModule): string | undefined
}

export type StartupGroupResolvedMember =
  | { type: 'service-version'; target: StartupGroupInstalledTarget }
  | { type: 'language-project'; target: StartupGroupProjectTarget }
