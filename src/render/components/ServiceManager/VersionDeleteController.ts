import { reactiveBind } from '@/util/Index'
import { versionDelete } from '@/util/NodeFn'
import { BrewStore } from '@/store/brew'
import { setInstalledVersionNote } from '@/util/InstalledVersionNote'
import { ElMessage } from 'element-plus'
import { I18nT } from '@lang/index'
import { VersionDeleteOperation } from './VersionDeleteOperation'

export default reactiveBind(
  new VersionDeleteOperation({
    inspect: versionDelete.inspect,
    remove: versionDelete.remove,
    async stop(target) {
      const service = BrewStore()
        .module(target.typeFlag)
        .installed.find((item) => item.bin === target.bin)
      return service ? service.stop() : true
    },
    committed(target) {
      const module = BrewStore().module(target.typeFlag)
      module.installed = module.installed.filter((item) => item.bin !== target.bin)
      module.installedFetched = false
    },
    async refresh(target) {
      const module = BrewStore().module(target.typeFlag)
      // Independent supplementary actions must all get a chance to finish.
      const outcomes = await Promise.allSettled([
        setInstalledVersionNote(
          { ...target, num: null, enable: true, run: false, running: false },
          '',
          target.typeFlag
        ),
        module.fetchInstalled(),
        module.fetchStatic()
      ])
      const failed = outcomes.find((result) => result.status === 'rejected')
      if (failed?.status === 'rejected') throw failed.reason
      module.resetCurrentVersion(true)
    },
    error: (message) => {
      ElMessage.error(message)
    },
    refreshError(error) {
      ElMessage.error(`${I18nT('base.versionDeletedRefreshFailed')} ${String(error)}`)
    }
  })
)
