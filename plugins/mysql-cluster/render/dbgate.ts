import { I18nT } from '@lang/index'
import { ElMessage } from 'element-plus'
import { BrewStore } from '@/store/brew'
import { AppStore } from '@/store/app'
import { shell } from '@/util/NodeFn'
import { reactiveBind } from '@/util/Index'
import { MysqlClusterManager as manager } from './manager'
import { MysqlClusterDbGateController } from './dbgateController'
import { requestDbGate } from './dbgateRequest'
import { MessageError } from './notice'
import { t } from './lang'

// Read the existing selection without changing shared configuration. A hidden
// Node module can have a cold inventory or a stale selection.
function selectedNode() {
  const installed = BrewStore().module('node').installed
  const preferred = AppStore().config.server?.node?.current
  return (
    installed.find(
      (item) =>
        item.bin &&
        item.enable !== false &&
        item.path === preferred?.path &&
        item.version === preferred?.version
    ) ?? installed.find((item) => item.bin && item.enable !== false)
  )
}

export const MysqlClusterDbGate = reactiveBind(
  new MysqlClusterDbGateController({
    available: () =>
      Object.values(manager.snapshots).some((s) => s.state === 'running') &&
      !manager.allBusy &&
      !Object.values(manager.operations).some(
        (op) => op.busy && ['stop', 'restart', 'remove'].includes(op.action)
      ),
    node: selectedNode,
    loadNode: async () => {
      if (!(await BrewStore().module('node').fetchInstalled()))
        throw new Error(t('dbgateNodeScanFailed'))
      return selectedNode()
    },
    request: requestDbGate,
    openBrowser: (url) => shell.openExternal(url),
    installNotice: () =>
      ElMessage({
        message: I18nT('base.webPanelFirstInstall', { service: 'DbGate' }),
        type: 'info',
        duration: 0,
        showClose: true
      }),
    error: MessageError,
    runtimeRequired: () => t('dbgateRequiresNode'),
    unavailable: () => t('dbgateRequiresInstance'),
    browserFailed: () => t('dbgateBrowserFailed')
  })
)
