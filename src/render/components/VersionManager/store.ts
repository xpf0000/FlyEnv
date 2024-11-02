import { reactive } from 'vue'
import type { AllAppModule } from '@/core/type'

type StoreType = {
  fetching: Record<AllAppModule, boolean>
  installing: Record<AllAppModule, boolean>
}

export const VersionManagerStore: StoreType = reactive({
  fetching: {},
  installing: {}
} as StoreType)
