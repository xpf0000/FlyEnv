import { ElMessageBox } from 'element-plus'
import { I18nT } from '@lang/index'
import IPC from '@/util/IPC'
import { dialog } from '@/util/NodeFn'
import { AsyncComponentShow } from '@/util/AsyncComponent'
import { reactiveBind } from '@/util/Index'
import { shouldOpenHelperInstaller } from '@shared/WindowsHelperState'
import { handleWriteHosts } from '@/util/Host'

class Helper {
  show: boolean = false
  private installResultPending = false
  private installPromise?: Promise<any>

  shouldShowNeedInstallDialog(reason?: string) {
    return shouldOpenHelperInstaller(reason)
  }

  isInstallResultPending() {
    return this.installResultPending
  }

  beginInstall() {
    this.installResultPending = true
  }

  completeInstall(res: any) {
    this.handleInstallResult(res)
  }

  repair(): Promise<boolean> {
    if (this.installPromise) {
      return this.installPromise.then((res) => res?.code === 0)
    }

    this.installResultPending = true
    const request = new Promise<any>((resolve, reject) => {
      const sent = IPC.send('APP-FlyEnv-Helper-Install')
      const timer = setTimeout(() => {
        IPC.off(sent.key)
        resolve({ code: 1, reason: 'elevation_status_timeout', msg: I18nT('menu.waitHelper') })
      }, 300_000)
      try {
        sent.then((key: string, res: any) => {
          if (res?.code === 200) return
          clearTimeout(timer)
          IPC.off(key)
          resolve(res)
        })
      } catch (error) {
        clearTimeout(timer)
        IPC.off(sent.key)
        reject(error)
      }
    })

    this.installPromise = request
      .catch((error: any) => ({
        code: 1,
        reason: 'elevation_launch_failed',
        stderr: error?.message
      }))
      .then((res) => {
        this.handleInstallResult(res)
        return res
      })
      .finally(() => {
        this.installResultPending = false
        this.installPromise = undefined
      })

    return this.installPromise.then((res) => res?.code === 0)
  }

  /**
   * 手动安装（终端脚本）走不到安装结果回调，先确认帮助程序真的可用再补写。
   */
  verifyHelperReady() {
    IPC.send('APP:FlyEnv-Helper-Check').then((key: string, res: any) => {
      IPC.off(key)
      if (res?.code === 0) {
        handleWriteHosts().catch(() => {})
      }
    })
  }

  private handleInstallResult(res: any) {
    this.installResultPending = false
    this.show = false
    if (res?.code !== 0) {
      this.showInstallFailDialog(res?.reason, res?.stderr || res?.msg)
      return
    }
    handleWriteHosts().catch(() => {})
  }

  showNeedInstallDialog(reason?: string) {
    if (!shouldOpenHelperInstaller(reason)) {
      return
    }
    if (this.show || this.installResultPending) {
      return
    }
    this.show = true
    ElMessageBox.confirm(I18nT('base.needInstallHelperTips'), I18nT('host.warning'), {
      confirmButtonText: I18nT('base.confirm'),
      cancelButtonText: I18nT('base.cancel'),
      type: 'warning'
    })
      .then(() => {
        this.repair().catch(() => false)
      })
      .catch(() => {
        this.installResultPending = false
        this.show = false
      })
  }

  showInstallFailDialog(reason?: string, stderr?: string) {
    if (window.Server.isWindows) {
      if (reason === 'elevation_uac_cancelled') return
      const message = I18nT('setup.flyenvHelperInstallFailTips')
      const diagnostic = stderr?.trim().slice(0, 1024)
      dialog
        .showMessageBox({
          type: 'info',
          title: I18nT('host.warning'),
          message: diagnostic ? `${message}\n\n${diagnostic}` : message,
          buttons: [I18nT('base.confirm')]
        })
        .catch(() => {})
    } else {
      import('@/components/FlyEnvHelper/index.vue').then((m) => {
        AsyncComponentShow(m.default).then()
      })
    }
  }
}

const obj = reactiveBind(new Helper())
export default obj
