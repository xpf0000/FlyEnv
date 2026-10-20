import { reactiveBind } from '@/util/Index'
import { StorageGetAsync, StorageSetAsync } from '@/util/Storage'
import { BrewStore } from '@/store/brew'
import { forkTerminalRequest } from '@/util/ForkTerminalRequest'
import { ModuleInstalledItem } from '@/core/Module/ModuleInstalledItem'
import { MessageError, MessageSuccess } from '@/util/Element'
import { join } from '@/util/path-browserify'
import { MysqlClusterController } from './controller'

const flag = 'mysql-cluster'
const key = 'flyenv-plugin-mysql-cluster-v1'
const binFor = (id: string) => join(window.Server.MysqlDir!, 'mysql-cluster', 'instances', id, 'my.cnf')
const moduleFor = () => BrewStore().module(flag)
export const MysqlClusterManager = reactiveBind(new MysqlClusterController({
  read: () => StorageGetAsync(key),
  write: value => StorageSetAsync(key, value),
  notify: (type, message) => { (type === 'success' ? MessageSuccess : MessageError)(message) },
  installed: async () => { const module = moduleFor(); module.installedFetched = false; await module.fetchInstalled() },
  service: id => {
    const item = moduleFor().installed.find(i => i.bin === binFor(id))
    if (!item) throw new Error('Instance lifecycle is unavailable; refresh the list')
    return item
  },
  rpc: async (method, args, progress) => {
    const response = await forkTerminalRequest(`app-fork:${flag}`, [method, ...args], 'MySQL operation timed out; inspect instance state before retrying', 360_000,
      info => { const event = info?.data?.['APP-Mysql-Cluster-Progress']; if (event) progress?.(event) })
    if (response.code !== 0) throw new Error(response.msg || 'MySQL operation failed')
    return response.data
  }
}))
export function registerLifecycle() {
  const module = moduleFor()
  module.isOnlyRunOne = false
  module.persistCurrentVersion = false
  const idFor = (item: ModuleInstalledItem) => {
    const spec = MysqlClusterManager.catalog.instances.find(i => binFor(i.id) === item.bin)
    if (!spec) throw new Error('Instance is unavailable')
    return spec.id
  }
  module.startExtParam = async item => { const id = idFor(item); return [{ id, credential: MysqlClusterManager.credentials[id] }] }
  module.stopExtParam = async item => [{ id: idFor(item) }]
}
