import type { AppServiceModuleItem } from '../../core/ASide'
import type { StartupGroup } from '../../core/StartupGroup'

type ServiceModuleMap = Partial<Record<string, AppServiceModuleItem | undefined>>
type ServiceModuleDef = {
  typeFlag: string
  isService?: boolean
}

export function isGroupManagedServiceModule(serviceModule?: AppServiceModuleItem) {
  return serviceModule?.participatesInGroup !== false
}

export function getGroupManagedTypeFlags(
  modules: ServiceModuleDef[],
  showItem: Record<string, boolean | undefined> | undefined,
  serviceModules: ServiceModuleMap
) {
  return modules
    .filter((module) => module.isService && showItem?.[module.typeFlag] !== false)
    .filter((module) => isGroupManagedServiceModule(serviceModules[module.typeFlag]))
    .map((module) => module.typeFlag)
}

export function getGroupManagedServiceEntries(serviceModules: ServiceModuleMap) {
  return Object.entries(serviceModules)
    .filter(([, module]) => !!module && isGroupManagedServiceModule(module))
    .map(([typeFlag, module]) => ({
      typeFlag,
      module: module!
    }))
}

export function resolveGroupExecutionRoute(
  startupGroupsVisible: boolean,
  defaultGroup: StartupGroup | undefined
) {
  return startupGroupsVisible && defaultGroup ? 'startup-group' : 'legacy'
}

export function resolveGroupAutoStartAction(state: {
  enabled: boolean
  disabled: boolean
  running: boolean
}): 'wait' | 'handled' | 'start' {
  if (!state.enabled || state.disabled) return 'wait'
  return state.running ? 'handled' : 'start'
}
