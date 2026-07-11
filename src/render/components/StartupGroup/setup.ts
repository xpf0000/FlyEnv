import { ProjectSetup } from '@/components/LanguageProjects/setup'
import { AppModules } from '@/core/App'
import { StartupGroupManager } from '@/core/StartupGroupManager'
import type { AllAppModule } from '@/core/type'
import { BrewStore } from '@/store/brew'
import { reactiveBind } from '@/util/Index'
import { startupGroupRuntime } from './runtime'

export const StartupGroupSetup = reactiveBind(
  new StartupGroupManager({
    runner: startupGroupRuntime.runner,
    getInstalled: (module: AllAppModule) => BrewStore().module(module).installed,
    fetchInstalled: (module: AllAppModule) => BrewStore().module(module).fetchInstalled(),
    getProjectSource: (module: AllAppModule) => ProjectSetup(module),
    getModuleLabel: (module: AllAppModule) => {
      const label = AppModules.find((item) => item.typeFlag === module)?.label
      return typeof label === 'function' ? label() : label
    }
  })
)
