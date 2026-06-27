import { ElMessageBox } from 'element-plus'
import { I18nT } from '@lang/index'
import IPC from '@/util/IPC'
import { app, dialog, shell } from '@/util/NodeFn'
import { join } from '@/util/path-browserify'
import { AsyncComponentShow } from '@/util/AsyncComponent'
import { reactiveBind } from '@/util/Index'
import { shouldOpenHelperInstaller } from '@shared/WindowsHelperState'

class Helper {
  show: boolean = false

  shouldShowNeedInstallDialog(reason?: string) {
    return shouldOpenHelperInstaller(reason)
  }

  showNeedInstallDialog(reason?: string) {
    if (!shouldOpenHelperInstaller(reason)) {
      return
    }
    if (this.show) {
      return
    }
    this.show = true
    ElMessageBox.confirm(I18nT('base.needInstallHelperTips'), I18nT('host.warning'), {
      confirmButtonText: I18nT('base.confirm'),
      cancelButtonText: I18nT('base.cancel'),
      type: 'warning'
    })
      .then(() => {
        IPC.send('APP-FlyEnv-Helper-Install').then((key: string) => {
          IPC.off(key)
          this.show = false
        })
      })
      .catch(() => {
        this.show = false
      })
  }

  showInstallFailDialog(reason?: string) {
    if (window.Server.isWindows) {
      const message =
        reason === 'helper_binary_missing'
          ? I18nT('menu.helperInstallFailTips')
          : I18nT('setup.flyenvHelperInstallFailTips')
      dialog
        .showMessageBox({
          type: 'info',
          title: I18nT('host.warning'),
          message,
          buttons: [I18nT('base.confirm')]
        })
        .then(() => {
          if (reason === 'helper_binary_missing') {
            return
          }
          app.getPath('exe').then((path: string) => {
            const item = join(path, 'resources/helper/flyenv-helper.exe')
            shell.showItemInFolder(item).catch()
          })
        })
    } else {
      import('@/components/FlyEnvHelper/index.vue').then((m) => {
        AsyncComponentShow(m.default).then()
      })
    }
  }
}

const obj = reactiveBind(new Helper())
export default obj
