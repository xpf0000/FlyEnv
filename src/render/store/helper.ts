import { ElMessage, ElMessageBox } from 'element-plus'
import { I18nT } from '@lang/index'
import IPC from '@/util/IPC'
import { dialog } from '@/util/NodeFn'
import { reactiveBind } from '@/util/Index'
import {
  shouldOpenHelperInstaller,
  formatHelperConnectionErrorMessage
} from '@shared/WindowsHelperState'
import { handleWriteHosts } from '@/util/Host'
import { MessageError } from '@/util/Element'

class Helper {
  show: boolean = false
  private installResultPending = false
  private manualInstallerOpening = false
  private installPromise?: Promise<any>
  private installNotice?: ReturnType<typeof ElMessage>

  shouldShowNeedInstallDialog(reason?: string) {
    return shouldOpenHelperInstaller(reason)
  }

  isInstallResultPending() {
    return this.installResultPending || this.manualInstallerOpening
  }

  isInstalling() {
    return this.installResultPending
  }

  repair(): Promise<boolean> {
    if (this.installPromise) {
      return this.installPromise.then((res) => res?.code === 0)
    }

    this.installResultPending = true
    // 确认后立即反馈，覆盖权限排队与健康预检；不等待 main 判定是否需要重装。
    try {
      this.installNotice = ElMessage({
        message: I18nT('menu.helperInstalling'),
        type: 'info',
        duration: 0,
        showClose: true,
        customClass: 'app-el-message',
        zIndex: 99999
      })
    } catch {
      // 提示属于附加动作，窗口状态不能阻止实际安装请求。
    }
    const request = new Promise<any>((resolve, reject) => {
      const sent = IPC.send('APP-FlyEnv-Helper-Install')
      const timer = setTimeout(() => {
        IPC.off(sent.key)
        resolve({
          code: 1,
          reason: 'elevation_status_timeout',
          msg: I18nT('setup.flyenvHelperInstallTimeout')
        })
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
        const notice = this.installNotice
        this.installNotice = undefined
        try {
          notice?.close()
        } catch {
          // 关闭提示不能覆盖安装终态。
        }
      })

    return this.installPromise.then((res) => res?.code === 0)
  }

  /**
   * 手动安装（终端脚本）走不到安装结果回调，先确认帮助程序真的可用再补写。
   */
  verifyHelperReady(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      IPC.send('APP:FlyEnv-Helper-Check', true).then((key: string, res: any) => {
        if (res?.code === 200) return
        IPC.off(key)
        if (res?.code !== 0) {
          reject(new Error(res?.msg ?? res?.reason ?? 'Helper is unavailable'))
          return
        }
        this.syncHostsAfterInstall()
        resolve(true)
      })
    })
  }

  syncHostsAfterInstall() {
    handleWriteHosts().catch((error) => {
      MessageError(`${I18nT('base.hostsSaveFailed')}: ${error}`)
    })
  }

  private handleInstallResult(res: any) {
    this.installResultPending = false
    this.show = false
    if (res?.code !== 0) {
      this.showInstallFailDialog(res?.reason, res?.stderr || res?.msg)
      return
    }
    this.syncHostsAfterInstall()
  }

  showNeedInstallDialog(reason?: string) {
    if (!shouldOpenHelperInstaller(reason)) {
      return
    }
    if (this.show || this.isInstallResultPending()) {
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
        this.show = false
      })
  }

  showInstallFailDialog(reason?: string, stderr?: string) {
    if (reason === 'elevation_uac_cancelled' || reason === 'elevation_cancelled') return
    if (
      window.Server.isWindows ||
      reason === 'elevation_status_timeout' ||
      (window.Server.isMacOS &&
        ['helper_signature_invalid', 'helper_version_mismatch', 'helper_acl_invalid'].includes(
          reason ?? ''
        ))
    ) {
      const message = I18nT(
        reason === 'elevation_status_timeout'
          ? 'setup.flyenvHelperInstallTimeout'
          : window.Server.isWindows
            ? 'setup.flyenvHelperInstallFailTips'
            : 'menu.helperInstallFailTips'
      )
      const diagnostic = stderr
        ? formatHelperConnectionErrorMessage(stderr.trim(), I18nT('menu.needInstallHelper')).slice(
            0,
            1024
          )
        : undefined
      dialog
        .showMessageBox({
          type: 'info',
          title: I18nT('host.warning'),
          message: diagnostic ? `${message}\n\n${diagnostic}` : message,
          buttons: [I18nT('base.confirm')]
        })
        .catch(() => {})
    } else {
      if (this.manualInstallerOpening) return
      this.manualInstallerOpening = true
      import('@/components/FlyEnvHelper/setup')
        .then(({ FlyEnvHelperSetup }) => FlyEnvHelperSetup.open())
        .catch((error) => MessageError(`${I18nT('menu.helperInstallFailTips')}: ${error}`))
        .finally(() => {
          this.manualInstallerOpening = false
        })
    }
  }
}

const obj = reactiveBind(new Helper())
export default obj
