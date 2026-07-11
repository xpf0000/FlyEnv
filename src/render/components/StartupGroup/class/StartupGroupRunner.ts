import { StartupGroup } from './StartupGroup'
import type {
  StartupGroupAdapter,
  StartupGroupCardState,
  StartupGroupData,
  StartupGroupHideStopResult,
  StartupGroupItem,
  StartupGroupMemberState,
  StartupGroupRunAction,
  StartupGroupRunMemberResult,
  StartupGroupRunResult,
  StartupGroupRunnerContract
} from '../type'

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : `${error}`)

export class StartupGroupRunner implements StartupGroupRunnerContract {
  executing = false
  revision = 0
  private activeItems = new Set<string>()

  constructor(
    private readonly getAdapter: (item: StartupGroupItem) => StartupGroupAdapter | undefined
  ) {}

  get isExecuting() {
    return this.executing
  }

  private changed() {
    this.revision += 1
  }

  private async resolveItem(item: StartupGroupItem) {
    const adapter = this.getAdapter(item)
    if (!adapter || !(await adapter.exists(item))) return undefined
    return adapter
  }

  async getItemState(item: StartupGroupItem): Promise<StartupGroupMemberState> {
    if (this.activeItems.has(StartupGroup.itemKey(item))) return 'executing'
    try {
      const adapter = await this.resolveItem(item)
      return adapter ? await adapter.getState(item) : 'invalid'
    } catch {
      return 'invalid'
    }
  }

  async getGroupState(group: StartupGroupData) {
    const states = await Promise.all(group.items.map((item) => this.getItemState(item)))
    return this.cardState(states)
  }

  cardState(states: StartupGroupMemberState[]): StartupGroupCardState {
    if (states.includes('invalid')) return 'invalid'
    if (states.includes('executing')) return 'executing'
    if (states.length === 0 || states.every((state) => state === 'stopped')) return 'stopped'
    if (states.every((state) => state === 'running')) return 'running'
    return 'partial-running'
  }

  buildStopQueue(groups: StartupGroupData[]) {
    const seen = new Set<string>()
    const queue: StartupGroupItem[] = []
    for (const group of groups) {
      for (const item of [...group.items].reverse()) {
        const key = StartupGroup.itemKey(item)
        if (seen.has(key)) continue
        seen.add(key)
        queue.push(item)
      }
    }
    return queue
  }

  async stopForHide(groups: StartupGroupData[]): Promise<StartupGroupHideStopResult> {
    if (this.executing) return { ok: false, reason: 'runner-busy', remaining: [] }
    const queue = this.buildStopQueue(groups)
    const before = await Promise.all(
      queue.map(async (item) => ({ item, state: await this.getItemState(item) }))
    )
    const executing = before.filter((item) => item.state === 'executing')
    if (executing.length > 0 || this.executing) {
      return { ok: false, reason: 'member-busy', remaining: executing }
    }
    if (queue.length === 0) return { ok: true, remaining: [] }
    const result = await this.run(
      {
        id: 'startup-group-hide',
        name: 'startup-group-hide',
        items: [...queue].reverse(),
        createdAt: 0,
        updatedAt: 0
      },
      'stop'
    )
    const after = await Promise.all(
      queue.map(async (item) => ({ item, state: await this.getItemState(item) }))
    )
    const remaining = after.filter((item) => ['running', 'executing'].includes(item.state))
    if (result.members.some((item) => item.outcome === 'failed')) {
      return { ok: false, reason: 'stop-failed', result, remaining }
    }
    if (remaining.length > 0) return { ok: false, reason: 'not-stopped', result, remaining }
    return { ok: true, result, remaining: [] }
  }

  async run(
    group: StartupGroupData,
    action: StartupGroupRunAction
  ): Promise<StartupGroupRunResult> {
    if (this.executing) throw new Error('Startup group runner is already executing')
    this.executing = true
    this.changed()
    const members: StartupGroupRunMemberResult[] = []
    const items = action === 'start' ? group.items : [...group.items].reverse()
    let startFailed = false
    try {
      for (const item of items) {
        if (startFailed) {
          members.push({ item, outcome: 'not-run' })
          continue
        }
        let active = false
        try {
          const adapter = await this.resolveItem(item)
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
          this.activeItems.add(StartupGroup.itemKey(item))
          active = true
          this.changed()
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
        } finally {
          if (active) {
            this.activeItems.delete(StartupGroup.itemKey(item))
            this.changed()
          }
        }
      }
    } finally {
      this.executing = false
      this.changed()
    }
    return { action, members }
  }
}
