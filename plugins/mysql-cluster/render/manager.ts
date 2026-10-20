import { reactive, watch } from 'vue'
import { InstanceServices } from './services'
import { installationAdmission } from './admission'
import { reactiveBind } from '@/util/Index'
import { StorageGetAsync, StorageSetAsync } from '@/util/Storage'
import { AppStore } from '@/store/app'
import { BrewStore } from '@/store/brew'
import { forkTerminalRequest } from '@/util/ForkTerminalRequest'
import { ModuleInstalledItem } from '@/core/Module/ModuleInstalledItem'
import { MessageError, MessageSuccess } from './notice'
import { join } from '@/util/path-browserify'
import { MysqlClusterController } from './controller'
import { t } from './lang'

const flag = 'mysql-cluster'
const key = 'flyenv-plugin-mysql-cluster-v1'
const binFor = (id: string) =>
  join(window.Server.MysqlDir!, 'mysql-cluster', 'instances', id, 'my.cnf')
const moduleFor = () => BrewStore().module(flag)
export const instanceServices = new InstanceServices(
  moduleFor,
  (row) => reactive(new ModuleInstalledItem(row)),
  () => {
    if (AppStore().config.setup.common.showItem?.[flag] === false)
      throw new Error('The module is hidden')
    if (installationAdmission.busy) throw new Error('Installation operation is running')
  }
)
export const MysqlClusterManager = reactiveBind(
  new MysqlClusterController({
    read: () => StorageGetAsync(key),
    write: (value) => StorageSetAsync(key, value),
    notify: (type, message) => {
      ;(type === 'success' ? MessageSuccess : MessageError)(t(message))
    },
    installed: async () => {
      registerLifecycle()
      const response = await forkTerminalRequest(
        `app-fork:${flag}`,
        ['instanceDescriptors'],
        'Instance refresh timed out'
      )
      if (response.code !== 0 || !Array.isArray(response.data))
        throw new Error(response.msg || 'Instance refresh failed')
      instanceServices.sync(response.data)
    },
    service: (id) => {
      return instanceServices.item(binFor(id))
    },
    rpc: async (method, args, progress) => {
      const response = await forkTerminalRequest(
        `app-fork:${flag}`,
        [method, ...args],
        'MySQL operation timed out; inspect instance state before retrying',
        360_000,
        (info) => {
          const event = info?.data?.['APP-Mysql-Cluster-Progress']
          if (event) progress?.(event)
        }
      )
      if (response.code !== 0) throw new Error(response.msg || 'MySQL operation failed')
      return response.data
    }
  })
)
let stopVisibilityWatch: (() => void) | undefined
export function releaseLifecycle() {
  stopVisibilityWatch?.()
  stopVisibilityWatch = undefined
}
export function registerLifecycle() {
  const module = moduleFor()
  module.isOnlyRunOne = false
  if (!stopVisibilityWatch) {
    const store = AppStore()
    stopVisibilityWatch = watch(
      () => store.config.setup.common.showItem?.[flag] !== false,
      (visible) => {
        if (!visible)
          void MysqlClusterManager.stopForVisibility().catch((error) =>
            MessageError(String(error.message ?? error))
          )
      },
      { flush: 'sync' }
    )
  }
  const idFor = (item: ModuleInstalledItem) => {
    const spec = MysqlClusterManager.catalog.instances.find((i) => binFor(i.id) === item.bin)
    if (!spec) throw new Error('Instance is unavailable')
    return spec.id
  }
  module.startExtParam = async (item) => {
    const id = idFor(item)
    return [{ id, credential: MysqlClusterManager.credentials[id] }]
  }
  module.stopExtParam = async (item) => [{ id: idFor(item) }]
  return true
}
