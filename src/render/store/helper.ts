import { ElMessageBox } from 'element-plus'
import { I18nT } from '@lang/index'
import IPC from '@/util/IPC'
import { app, dialog, shell } from '@/util/NodeFn'
import { join } from '@/util/path-browserify'
import { AsyncComponentShow } from '@/util/AsyncComponent'
import { reactiveBind } from '@/util/Index'

class Helper {
  show: boolean = false

  showNeedInstallDialog() {
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

  showInstallFailDialog() {
    if (window.Server.isWindows) {
      dialog
        .showMessageBox({
          type: 'info',
          title: I18nT('host.warning'),
          message: I18nT('setup.flyenvHelperInstallFailTips'),
          buttons: [I18nT('base.confirm')]
        })
        .then(() => {
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
