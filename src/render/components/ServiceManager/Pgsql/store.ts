import { reactive } from 'vue'

type StoreStateType = {
  pgvector: 'noinstalled' | 'installed' | 'installing'
}

type StoreType = {
  state: Record<string, StoreStateType>
}

export const Store: StoreType = reactive({
  state: {}
})
