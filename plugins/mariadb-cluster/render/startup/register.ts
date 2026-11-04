import { reactive, watch } from 'vue'
import type { AppModuleItem } from '@/core/type'
import { AppModules } from '@/core/App'
import { BrewStore } from '@/store/brew'
import { AppStore } from '@/store/app'
import { MariadbClusterManager } from '../manager'
import { MariadbClusterStartupModule } from './ClusterModule'

/** Register only after the host installs this exact descriptor, including hot updates. */
export function registerMariadbClusterStartup(descriptor: AppModuleItem) {
  let owned: MariadbClusterStartupModule | undefined
  const release = () => {
    const module = owned
    if (!module) return
    owned = undefined
    module.dispose()
    const modules = BrewStore().modules as Record<string, unknown>
    if (modules['mariadb-cluster'] === module) delete modules['mariadb-cluster']
  }
  const unwatch = watch(
    () => AppModules.includes(descriptor),
    (enabled) => {
      if (!enabled) {
        release()
        return
      }
      const module = reactive(
        new MariadbClusterStartupModule(
          MariadbClusterManager,
          () => !!window.Server.DataDirectoryReady,
          () => AppStore().config.setup.common.showItem?.['mariadb-cluster'] !== false,
          window.Server.MariaDBDir!
        )
      ) as unknown as MariadbClusterStartupModule
      owned = module
      const modules = BrewStore().modules as Record<string, unknown>
      modules['mariadb-cluster'] = module
    },
    { immediate: true, flush: 'sync' }
  )
  return () => {
    unwatch()
    release()
  }
}
