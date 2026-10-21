import { I18nT } from '@lang/index'
import { ElMessage } from 'element-plus'
import { BrewStore } from '@/store/brew'
import { shell } from '@/util/NodeFn'
import { reactiveBind } from '@/util/Index'
import { MysqlClusterManager as manager } from './manager'
import { MysqlClusterDbGateController } from './dbgateController'
import { requestDbGate } from './dbgateRequest'
import { MessageError } from './notice'
import { t } from './lang'

export const MysqlClusterDbGate = reactiveBind(
  new MysqlClusterDbGateController({
    available: () =>
      Object.values(manager.snapshots).some((s) => s.state === 'running') &&
      !manager.allBusy &&
      !Object.values(manager.operations).some(
        (op) => op.busy && ['stop', 'restart', 'remove'].includes(op.action)
      ),
    node: () => BrewStore().currentVersion('node'),
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
    runtimeRequired: () =>
      I18nT('base.serviceRequiresRuntime', {
        service: 'DbGate',
        runtime: 'NodeJS',
        module: 'NodeJS'
      }),
    unavailable: () => t('dbgateRequiresInstance'),
    browserFailed: () => t('dbgateBrowserFailed')
  })
)
