import type { AllAppModule } from './type'

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
}

export type StartupGroupItem = StartupGroupServiceVersionItem | StartupGroupLanguageProjectItem

export interface StartupGroup {
  id: string
  name: string
  description?: string
  color?: string
  items: StartupGroupItem[]
  createdAt: number
  updatedAt: number
}

export interface StartupGroupConfig {
  groups: StartupGroup[]
  defaultStartupGroupId?: string
}

export type StartupGroupMemberState = 'stopped' | 'running' | 'executing' | 'invalid'
export type StartupGroupCardState =
  | 'stopped'
  | 'running'
  | 'partial-running'
  | 'executing'
  | 'invalid'
export type StartupGroupRunAction = 'start' | 'stop'
export type StartupGroupMemberOutcome =
  | 'started'
  | 'stopped'
  | 'skipped'
  | 'failed'
  | 'not-run'
  | 'invalid'

export interface StartupGroupAdapter {
  exists(item: StartupGroupItem): Promise<boolean>
  getState(item: StartupGroupItem): Promise<StartupGroupMemberState>
  start(item: StartupGroupItem): Promise<void>
  stop(item: StartupGroupItem): Promise<void>
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

export function normalizeStartupGroupConfig(value: unknown): StartupGroupConfig {
  const candidate = value as Partial<StartupGroupConfig> | undefined
  const groups = Array.isArray(candidate?.groups) ? candidate.groups : []
  const defaultStartupGroupId = groups.some(
    (group) => group.id === candidate?.defaultStartupGroupId && group.items.length > 0
  )
    ? candidate?.defaultStartupGroupId
    : undefined

  return defaultStartupGroupId ? { groups, defaultStartupGroupId } : { groups }
}

export function getStartupGroupItemKey(item: StartupGroupItem) {
  return item.type === 'service-version'
    ? `service-version:${item.module}:${item.versionPath}`
    : `language-project:${item.module}:${item.projectId}`
}

export function resolveDefaultStartupGroup(config: StartupGroupConfig) {
  const group = config.groups.find((item) => item.id === config.defaultStartupGroupId)
  return group && group.items.length > 0 ? group : undefined
}

export function setDefaultStartupGroup(
  config: StartupGroupConfig,
  groupId?: string
): StartupGroupConfig {
  const group = groupId ? config.groups.find((item) => item.id === groupId) : undefined
  const defaultStartupGroupId = group && group.items.length > 0 ? group.id : undefined
  return defaultStartupGroupId ? { ...config, defaultStartupGroupId } : { groups: config.groups }
}

export function getStartupGroupCardState(states: StartupGroupMemberState[]): StartupGroupCardState {
  if (states.includes('invalid')) return 'invalid'
  if (states.includes('executing')) return 'executing'
  if (states.length === 0 || states.every((state) => state === 'stopped')) return 'stopped'
  if (states.every((state) => state === 'running')) return 'running'
  return 'partial-running'
}

export function buildStartupGroupStopQueue(groups: StartupGroup[]) {
  const seen = new Set<string>()
  const queue: StartupGroupItem[] = []

  for (const group of groups) {
    for (const item of [...group.items].reverse()) {
      const key = getStartupGroupItemKey(item)
      if (seen.has(key)) continue
      seen.add(key)
      queue.push(item)
    }
  }

  return queue
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : `${error}`
}

export function createStartupGroupRunner(
  getAdapter: (item: StartupGroupItem) => StartupGroupAdapter | undefined
) {
  let isExecuting = false

  const resolveItem = async (item: StartupGroupItem) => {
    const adapter = getAdapter(item)
    if (!adapter || !(await adapter.exists(item))) return undefined
    return adapter
  }

  const getItemState = async (item: StartupGroupItem): Promise<StartupGroupMemberState> => {
    try {
      const adapter = await resolveItem(item)
      return adapter ? await adapter.getState(item) : 'invalid'
    } catch {
      return 'invalid'
    }
  }

  const getGroupState = async (group: StartupGroup) => {
    const states = await Promise.all(group.items.map((item) => getItemState(item)))
    return getStartupGroupCardState(states)
  }

  const run = async (
    group: StartupGroup,
    action: StartupGroupRunAction
  ): Promise<StartupGroupRunResult> => {
    if (isExecuting) throw new Error('Startup group runner is already executing')
    isExecuting = true
    const members: StartupGroupRunMemberResult[] = []
    const items = action === 'start' ? group.items : [...group.items].reverse()
    let startFailed = false

    try {
      for (const item of items) {
        if (startFailed) {
          members.push({ item, outcome: 'not-run' })
          continue
        }

        try {
          const adapter = await resolveItem(item)
          if (!adapter) {
            members.push({ item, outcome: 'invalid' })
            continue
          }

          const state = await adapter.getState(item)
          if (
            state === 'executing' ||
            (action === 'start' && state === 'running') ||
            (action === 'stop' && state === 'stopped')
          ) {
            members.push({ item, outcome: 'skipped' })
            continue
          }

          if (action === 'start') {
            await adapter.start(item)
            members.push({ item, outcome: 'started' })
          } else {
            await adapter.stop(item)
            members.push({ item, outcome: 'stopped' })
          }
        } catch (error) {
          members.push({ item, outcome: 'failed', error: errorMessage(error) })
          if (action === 'start') startFailed = true
        }
      }
    } finally {
      isExecuting = false
    }

    return { action, members }
  }

  return {
    get isExecuting() {
      return isExecuting
    },
    getItemState,
    getGroupState,
    run
  }
}

export type StartupGroupRunner = ReturnType<typeof createStartupGroupRunner>
