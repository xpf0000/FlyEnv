import { defineAsyncComponent } from 'vue'
import { ElMessageBox } from 'element-plus'

import { I18nT } from '@lang/index'
import { registerModuleVisibilityGuard } from '@/core/ModuleVisibility'
import {
  buildStartupGroupStopQueue,
  normalizeStartupGroupConfig,
  type StartupGroupItem
} from '@/core/StartupGroup'
import type { AppModuleItem } from '@/core/type'
import { AppStore } from '@/store/app'
import { MessageError, MessageWarning } from '@/util/Element'

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

  const config = normalizeStartupGroupConfig(AppStore().config.setup.startupGroups)
  const queue = buildStartupGroupStopQueue(config.groups)
  if (queue.length === 0) return true

  const result = await startupGroupRuntime.runner.run(
    {
      id: 'startup-group-hide',
      name: 'startup-group-hide',
      items: [...queue].reverse(),
      createdAt: 0,
      updatedAt: 0
    },
    'stop'
  )
  const failed = result.members.filter((item) => item.outcome === 'failed')
  if (failed.length === 0) return true

  MessageError(
    [
      I18nT('common.startupGroup.hideFailed'),
      ...failed.map((item) => `${itemLabel(item.item)}: ${item.error || I18nT('base.fail')}`)
    ].join('<br/>')
  )
  return false
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
