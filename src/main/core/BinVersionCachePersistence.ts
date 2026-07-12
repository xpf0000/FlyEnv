import Store from 'electron-store'
import type { BinVersionCacheFile } from '@shared/BinVersionCache'
import type { BinVersionCachePersistence } from './BinVersionCacheStore'

export class ElectronStoreBinVersionCachePersistence implements BinVersionCachePersistence {
  private store?: Store<BinVersionCacheFile>

  private getStore() {
    this.store ??= new Store<BinVersionCacheFile>({
      name: 'bin-version-cache',
      clearInvalidConfig: true,
      defaults: {
        schemaVersion: 1,
        entries: {}
      }
    })
    return this.store
  }

  load(): unknown {
    return this.getStore().store
  }

  save(value: BinVersionCacheFile) {
    this.getStore().store = value
  }
}
