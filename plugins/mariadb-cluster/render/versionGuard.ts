import { instanceServices, MariadbClusterManager as manager } from './manager'
import { usesInstallation } from './versionUse'
import { MessageError } from './notice'
import type { RemovalGuard } from './RemovalPolicy'
import { t } from './lang'
export const beforeRemove: RemovalGuard = async (candidate) => {
  try {
    if (!manager.initialized) await manager.load()
    await manager.refresh()
    if (instanceServices.items.some((item) => item.running)) {
      MessageError(t('busy'))
      return false
    }
    const affected = manager.catalog.instances.filter(
      (i) =>
        usesInstallation(i.engine, candidate) &&
        ['running', 'unknown'].includes(manager.snapshots[i.id]?.state ?? 'unknown')
    )
    if (affected.length) {
      MessageError(`${t('inUse')}\n${affected.map((i) => i.name).join(', ')}`)
      return false
    }
    return true
  } catch {
    MessageError(t('unknown'))
    return false
  }
}
