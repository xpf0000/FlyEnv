import { defineAsyncComponent } from 'vue'
import { ElMessageBox } from 'element-plus'

import { I18nT } from '@lang/index'
import { registerModuleVisibilityGuard } from '@/core/ModuleVisibility'
import { stopStartupGroupsForHide, type StartupGroupItem } from '@/core/StartupGroup'
import type { AppModuleItem } from '@/core/type'
import { MessageError, MessageWarning } from '@/util/Element'
import { useStartupGroupStore } from './store'

const itemLabel = (item: StartupGroupItem) =>
  item.type === 'service-version'
    ? `${item.module} · ${item.versionBin}`
    : `${item.module} · ${item.projectId}`

registerModuleVisibilityGuard('startup-group', async (visible) => {
  if (visible) return true

  const { startupGroupRuntime } = await import('./runtime')
  if (startupGroupRuntime.runner.isExecuting) {
    MessageWarning(I18nT('common.startupGroup.hideBusy'))
    return false
  }

  try {
    await ElMessageBox.confirm(I18nT('common.startupGroup.hideConfirm'), I18nT('host.warning'), {
      type: 'warning'
    })
  } catch {
    return false
  }

  const config = useStartupGroupStore().config.value
  const stopped = await stopStartupGroupsForHide(config.groups, startupGroupRuntime.runner)
  if (['runner-busy', 'member-busy'].includes(stopped.reason ?? '')) {
    MessageWarning(I18nT('common.startupGroup.hideBusy'))
    return false
  }

  const summary =
    stopped.result?.members.map((member) => {
      const error = member.error ? `: ${member.error}` : ''
      return `${itemLabel(member.item)} — ${I18nT(
        `common.startupGroup.outcome.${member.outcome}`
      )}${error}`
    }) ?? []
  summary.push(
    ...stopped.remaining.map(
      (member) =>
        `${itemLabel(member.item)} — ${I18nT(`common.startupGroup.state.${member.state}`)}`
    )
  )

  if (!stopped.ok) {
    MessageError([I18nT('common.startupGroup.hideFailed'), ...summary].join('<br/>'))
    return false
  }
  if (stopped.result?.members.some((member) => ['invalid', 'skipped'].includes(member.outcome))) {
    MessageWarning(summary.join('<br/>'))
  }
  return true
})

const module: AppModuleItem = {
  moduleType: 'console',
  typeFlag: 'startup-group',
  label: () => I18nT('common.startupGroup.title'),
  icon: import('@/svg/switch.svg?raw'),
  index: defineAsyncComponent(() => import('./Index.vue')),
  aside: defineAsyncComponent(() => import('./aside.vue')),
  asideIndex: 1,
  isService: false,
  isTray: false
}

export default module
