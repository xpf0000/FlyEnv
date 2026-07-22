import type { TrayStartupGroupItem } from '@shared/Tray'
import type { StartupGroup } from './class/StartupGroup'

export type StartupGroupTrayState = {
  readonly busy: boolean
  isGroupRunning(group: StartupGroup): boolean
  isGroupExecuting(group: StartupGroup): boolean
}

export const buildStartupGroupTrayItems = (
  groups: StartupGroup[],
  state: StartupGroupTrayState
): TrayStartupGroupItem[] =>
  groups.map((group) => {
    const running = state.isGroupExecuting(group)
    return {
      id: group.id,
      name: group.name,
      color: group.color,
      run: state.isGroupRunning(group),
      running,
      disabled: state.busy || running || group.empty
    }
  })
