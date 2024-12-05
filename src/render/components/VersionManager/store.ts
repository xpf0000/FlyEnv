import { reactive } from 'vue'
import type { AllAppModule } from '@/core/type'

type StoreType = {
  fetching: Record<AllAppModule, boolean>
  installing: Record<AllAppModule, boolean>
  uniServicePanelTab: Record<AllAppModule, 'local' | 'lib'>
}

export const VersionManagerStore: StoreType = reactive({
  fetching: {},
  installing: {},
  uniServicePanelTab: {}
} as StoreType)
