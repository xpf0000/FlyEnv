import { reactiveBind } from '@/util/Index'
import { StartupGroup } from './StartupGroup'
import type {
  StartupGroupConfigData,
  StartupGroupData,
  StartupGroupDraft,
  StartupGroupRunnerContract,
  StartupGroupStoreDependencies
} from '../type'

export class StartupGroupStore {
  groups: StartupGroup[] = []
  defaultStartupGroupId?: string
  loaded = false
  private loading?: Promise<StartupGroupConfigData>

  constructor(
    private readonly runner: StartupGroupRunnerContract,
    private readonly dependencies: StartupGroupStoreDependencies
  ) {}

  get config(): StartupGroupConfigData {
    return this.serialize(this.groups, this.defaultStartupGroupId)
  }

  get defaultGroup() {
    const group = this.groups.find((item) => item.id === this.defaultStartupGroupId)
    return group?.canBeDefault ? group : undefined
  }

  private normalize(value: unknown): StartupGroupConfigData {
    const candidate = value as Partial<StartupGroupConfigData> | undefined
    const groups = Array.isArray(candidate?.groups) ? candidate.groups : []
    const defaultStartupGroupId = groups.some(
      (group) => group.id === candidate?.defaultStartupGroupId && group.items.length > 0
    )
      ? candidate?.defaultStartupGroupId
      : undefined
    return defaultStartupGroupId ? { groups, defaultStartupGroupId } : { groups }
  }

  private hydrate(data: StartupGroupData) {
    return reactiveBind(new StartupGroup(data, this.runner))
  }

  private serialize(groups: StartupGroup[], defaultStartupGroupId?: string) {
    const data = groups.map((group) => group.toJSON())
    const validDefault = data.some(
      (group) => group.id === defaultStartupGroupId && group.items.length > 0
    )
      ? defaultStartupGroupId
      : undefined
    return validDefault ? { groups: data, defaultStartupGroupId: validDefault } : { groups: data }
  }

  private replace(value: StartupGroupConfigData) {
    this.groups.splice(0, this.groups.length, ...value.groups.map((group) => this.hydrate(group)))
    this.defaultStartupGroupId = value.defaultStartupGroupId
    return this.config
  }

  async init() {
    if (this.loaded) return this.config
    if (!this.loading) {
      this.loading = this.dependencies
        .get()
        .catch(() => undefined)
        .then((saved) => {
          this.loaded = true
          return this.replace(this.normalize(saved))
        })
        .finally(() => {
          this.loading = undefined
        })
    }
    return this.loading
  }

  private async persist(groups: StartupGroup[], defaultStartupGroupId?: string) {
    const config = this.serialize(groups, defaultStartupGroupId)
    await this.dependencies.set(JSON.parse(JSON.stringify(config)))
    return config
  }

  isCreationLocked(isLicenseActive: boolean) {
    return !isLicenseActive && this.groups.length >= 1
  }

  async add(draft: StartupGroupDraft) {
    await this.init()
    const group = this.hydrate({
      id: this.dependencies.createId(),
      name: draft.name,
      description: draft.description,
      color: draft.color,
      items: draft.items,
      createdAt: this.dependencies.now(),
      updatedAt: this.dependencies.now()
    })
    const config = await this.persist([...this.groups, group], this.defaultStartupGroupId)
    this.replace(config)
    return this.find(group.id)!
  }

  async update(id: string, draft: StartupGroupDraft) {
    await this.init()
    const index = this.groups.findIndex((group) => group.id === id)
    if (index < 0) return
    const next = this.hydrate(this.groups[index].toJSON()).update(draft, this.dependencies.now())
    const groups = [...this.groups]
    groups[index] = next
    this.replace(await this.persist(groups, this.defaultStartupGroupId))
  }

  async remove(id: string) {
    await this.init()
    const groups = this.groups.filter((group) => group.id !== id)
    const defaultId = this.defaultStartupGroupId === id ? undefined : this.defaultStartupGroupId
    this.replace(await this.persist(groups, defaultId))
  }

  async setDefault(id?: string) {
    await this.init()
    const group = id ? this.find(id) : undefined
    if (id && !group?.canBeDefault) return false
    this.replace(await this.persist(this.groups, group?.id))
    return true
  }

  find(id: string) {
    return this.groups.find((group) => group.id === id)
  }
}
