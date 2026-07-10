import { AppModules } from '@/core/App'
import { createStartupGroupRuntime } from '@/core/StartupGroupRuntime'
import type { AllAppModule } from '@/core/type'
import { BrewStore } from '@/store/brew'
import { uuid } from '@/util/Index'
import { ProjectSetup } from '@/components/LanguageProjects/setup'

function platformModules() {
  const platform = window.Server.isMacOS
    ? 'macOS'
    : window.Server.isWindows
      ? 'Windows'
      : window.Server.isLinux
        ? 'Linux'
        : undefined
  return platform
    ? AppModules.filter((item) => !item.platform || item.platform.includes(platform))
    : []
}

export const startupGroupRuntime = createStartupGroupRuntime({
  createId: uuid,
  modules: platformModules(),
  getInstalled: async (module: AllAppModule) => {
    const manager = BrewStore().module(module)
    await manager.fetchInstalled()
    return manager.installed
  },
  getProjects: async (module: AllAppModule) => {
    const project = ProjectSetup(module)
    await project.fetchProject()
    return project.project
  }
})
