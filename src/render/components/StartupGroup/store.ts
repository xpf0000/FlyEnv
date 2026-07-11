import { computed, reactive } from 'vue'

import {
  createStartupGroup,
  deleteStartupGroup,
  normalizeStartupGroupConfig,
  setDefaultStartupGroup,
  updateStartupGroup,
  type StartupGroup,
  type StartupGroupConfig,
  type StartupGroupDraft
} from '@/core/StartupGroup'
import { uuid } from '@/util/Index'
import { StorageGetAsync, StorageSetAsync } from '@/util/Storage'

const storageKey = 'flyenv-startup-groups'
const state = reactive<{ config: StartupGroupConfig }>({
  config: normalizeStartupGroupConfig(undefined)
})
const config = computed(() => state.config)
const groups = computed(() => state.config.groups)

let loaded = false
let loading: Promise<StartupGroupConfig> | undefined

const replaceConfig = (value: unknown) => {
  state.config = normalizeStartupGroupConfig(value)
  return state.config
}

export const initStartupGroupStore = async (): Promise<StartupGroupConfig> => {
  if (loaded) return state.config

  if (!loading) {
    loading = StorageGetAsync<StartupGroupConfig>(storageKey)
      .catch(() => normalizeStartupGroupConfig(undefined))
      .then((saved) => {
        loaded = true
        return replaceConfig(saved)
      })
      .finally(() => {
        loading = undefined
      })
  }

  return loading
}

const save = async (next: StartupGroupConfig) => {
  await initStartupGroupStore()
  const normalized = normalizeStartupGroupConfig(next)
  await StorageSetAsync(storageKey, JSON.parse(JSON.stringify(normalized)))
  replaceConfig(normalized)
}

export function useStartupGroupStore() {
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

  return { config, groups, init: initStartupGroupStore, add, update, remove, setDefault, find }
}
