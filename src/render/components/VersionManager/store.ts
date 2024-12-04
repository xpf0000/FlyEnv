import { reactive } from 'vue'
import type { AllAppModule } from '@/core/type'

type StoreType = {
  fetching: Record<AllAppModule, boolean>
  installing: Record<AllAppModule, boolean>
  _sourceFetching: Record<AllAppModule, { brew: boolean; port: boolean; static: boolean }>
  sourceFetching: (type: AllAppModule) => { brew: boolean; port: boolean; static: boolean }
  uniServicePanelTab: Record<AllAppModule, 'local' | 'lib'>
}

export const VersionManagerStore: StoreType = reactive({
  fetching: {},
  _sourceFetching: {},
  installing: {},
  uniServicePanelTab: {},
  sourceFetching(type: AllAppModule) {
    if (!this._sourceFetching.hasOwnProperty(type)) {
      this._sourceFetching[type] = reactive({
        brew: false,
        port: false,
        static: false
      })
    }
    return this._sourceFetching[type]
  }
} as StoreType)
