import type {
  StartupGroupData,
  StartupGroupDraft,
  StartupGroupItem,
  StartupGroupRunnerContract
} from '../type'

export class StartupGroup implements StartupGroupData {
  id: string
  name: string
  description?: string
  color?: string
  items: StartupGroupItem[]
  createdAt: number
  updatedAt: number

  constructor(
    data: StartupGroupData,
    private readonly runner: StartupGroupRunnerContract
  ) {
    this.id = data.id
    this.name = data.name
    this.description = data.description
    this.color = data.color
    this.items = data.items.map((item) => ({ ...item }))
    this.createdAt = data.createdAt
    this.updatedAt = data.updatedAt
  }

  static itemKey(item: StartupGroupItem) {
    return item.type === 'service-version'
      ? `service-version:${item.module}:${item.versionPath}`
      : `language-project:${item.module}:${item.projectId}`
  }

  get empty() {
    return this.items.length === 0
  }

  get canBeDefault() {
    return !this.empty
  }

  get itemKeys() {
    return this.items.map(StartupGroup.itemKey)
  }

  get stopItems() {
    return [...this.items].reverse()
  }

  update(draft: StartupGroupDraft, now = Date.now()) {
    this.name = draft.name
    this.description = draft.description
    this.color = draft.color
    this.replaceItems(draft.items)
    this.updatedAt = now
    return this
  }

  replaceItems(items: StartupGroupItem[]) {
    this.items = items.map((item) => ({ ...item }))
    return this
  }

  /** 用户点击默认为交互；开机入口明确 false，runner 继续持有原运行生命周期。 */
  start(interactive = true) {
    return this.runner.run(this, 'start', interactive)
  }

  /** 停止保持同一授权意图，失败由 runner 记录到成员结果而非伪报停止成功。 */
  stop(interactive = true) {
    return this.runner.run(this, 'stop', interactive)
  }

  async toggle() {
    const states = await Promise.all(this.items.map((item) => this.runner.getItemState(item)))
    return states.some((state) => state === 'running') ? this.stop() : this.start()
  }

  setMemberEnabled(item: StartupGroupItem, enabled: boolean) {
    return this.runner.run({ ...this.toJSON(), items: [item] }, enabled ? 'start' : 'stop')
  }

  toJSON(): StartupGroupData {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      color: this.color,
      items: this.items.map((item) => ({ ...item })),
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    }
  }
}
