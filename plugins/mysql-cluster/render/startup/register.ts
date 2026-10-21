import { reactive, watch } from 'vue'
import type { AppModuleItem } from '@/core/type'
import { AppModules } from '@/core/App'
import { BrewStore } from '@/store/brew'
import { AppStore } from '@/store/app'
import { MysqlClusterManager } from '../manager'
import { MysqlClusterStartupModule } from './ClusterModule'

/** Register only after the host installs this exact descriptor, including hot updates. */
export function registerMysqlClusterStartup(descriptor: AppModuleItem) {
  let owned: MysqlClusterStartupModule | undefined
  const release = () => {
    const module = owned
    if (!module) return
    owned = undefined
    module.dispose()
    const modules = BrewStore().modules as Record<string, unknown>
    if (modules['mysql-cluster'] === module) delete modules['mysql-cluster']
  }
  const unwatch = watch(
    () => AppModules.includes(descriptor),
    (enabled) => {
      if (!enabled) {
        release()
        return
      }
      const module = reactive(
        new MysqlClusterStartupModule(
          MysqlClusterManager,
          () => !!window.Server.DataDirectoryReady,
          () => AppStore().config.setup.common.showItem?.['mysql-cluster'] !== false,
          window.Server.MysqlDir!
        )
      ) as unknown as MysqlClusterStartupModule
      owned = module
      const modules = BrewStore().modules as Record<string, unknown>
      modules['mysql-cluster'] = module
    },
    { immediate: true, flush: 'sync' }
  )
  return () => {
    unwatch()
    release()
  }
}
