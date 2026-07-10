import { computed, reactive } from 'vue'

import {
  createStartupGroup,
  deleteStartupGroup,
  normalizeStartupGroupConfig,
  setDefaultStartupGroup,
  updateStartupGroup,
  type StartupGroup,
  type StartupGroupDraft
} from '@/core/StartupGroup'
import { AppStore } from '@/store/app'
import { uuid } from '@/util/Index'

export function useStartupGroupStore() {
  const appStore = AppStore()
  const config = computed(() => normalizeStartupGroupConfig(appStore.config.setup.startupGroups))
  const groups = computed(() => config.value.groups)

  const save = async (next: ReturnType<typeof normalizeStartupGroupConfig>) => {
    appStore.config.setup.startupGroups = reactive(next)
    await appStore.saveConfig()
  }

  const add = async (draft: StartupGroupDraft) => {
    const result = createStartupGroup(config.value, draft, uuid(), Date.now())
    await save(result.config)
    return result.group
  }

  const update = async (id: string, draft: StartupGroupDraft) => {
    await save(updateStartupGroup(config.value, id, draft, Date.now()))
  }

  const remove = async (id: string) => {
    await save(deleteStartupGroup(config.value, id))
  }

  const setDefault = async (id?: string) => {
    const group = id ? groups.value.find((item) => item.id === id) : undefined
    if (id && (!group || group.items.length === 0)) return false
    await save(setDefaultStartupGroup(config.value, id))
    return true
  }

  const find = (id: string): StartupGroup | undefined =>
    groups.value.find((group) => group.id === id)

  return { config, groups, add, update, remove, setDefault, find }
}
