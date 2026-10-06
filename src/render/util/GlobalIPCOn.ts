import { setupMcpIpc } from '@/util/MCP'
import IPC from '@/util/IPC'
import { MessageError, MessageSuccess, MessageWarning } from '@/util/Element'
import { FlyEnvHelperSetup } from '@/components/FlyEnvHelper/setup'
import HelperStore from '@/store/helper'
import { nativeTheme } from '@/util/NodeFn'
import { isEqual } from 'lodash-es'
import { AppStore } from '@/store/app'
import { SetupStore } from '@/components/Setup/store'
import { I18nT } from '@lang/index'
import { syncRendererPluginModules } from '@/core/AppModules'
import WindowsPrivilegeController from '@/components/Setup/WindowsElevationMethod/Controller'
import { WINDOWS_ELEVATION_CHOICE_VERSION } from '@shared/WindowsHelperState'

class GlobalIPCOn {
  public inited = false

  init() {
    IPC.on('App-Native-Theme-Update').then(() => {
      nativeTheme.updateFn.forEach((fn: () => void) => {
        fn()
      })
    })
    IPC.on('APP-Update-Global-Server').then((key: string, res: any) => {
      console.log('APP-Update-Global-Server: ', key, res)
      const server: any = window.Server
      if (isEqual(server, res)) {
        return
      }
      const pluginsChanged = !isEqual(server?.Plugins, res?.Plugins)
      // 全量 Server 广播也可能晚于专用权限广播。替换其他字段后恢复更高
      // revision 的权限快照，避免系统设置刷新把偏好/管理员展示状态退回旧值。
      const privilege = {
        revision: server.WindowsPrivilegeRevision ?? 0,
        method: server.WindowsElevationMethod,
        choiceVersion: server.WindowsElevationChoiceVersion,
        elevated: server.WindowsProcessElevated === true
      }
      for (const key in server) {
        delete server?.[key]
      }
      Object.assign(window.Server, res)
      if ((res?.WindowsPrivilegeRevision ?? 0) < privilege.revision)
        WindowsPrivilegeController.apply(privilege)
      else if (typeof res?.WindowsPrivilegeRevision === 'number') {
        // 全量广播也要更新 AppStore，设置页不能只等下一次专用权限广播。
        WindowsPrivilegeController.apply({
          revision: res.WindowsPrivilegeRevision,
          method: res.WindowsElevationMethod,
          choiceVersion: res.WindowsElevationChoiceVersion,
          elevated: res.WindowsProcessElevated === true
        })
      }
      const store = AppStore()
      store.envIndex += 1
      if (pluginsChanged) {
        // Plugin install/update/toggle/uninstall: hot-sync renderer modules and
        // routes without a restart. The fork side is already refreshed by the
        // same broadcast. Failure here only means the change applies on restart.
        syncRendererPluginModules().catch((error) => {
          console.error('[Plugin] hot sync failed; restart to apply plugin changes', error)
        })
      }
    })
    IPC.on('APP-License-Need-Update').then(() => {
      SetupStore().init()
    })

    // 专用权限广播应用版本保护，并把首次选择/取消事件交给唯一控制器。
    IPC.on('APP-Windows-Elevation-Method-Changed').then((key: string, res: any) => {
      if (res && typeof res.revision === 'number') WindowsPrivilegeController.apply(res)
    })
    IPC.on('APP-Windows-Privilege-Choice').then((_key: string, choice: any) =>
      WindowsPrivilegeController.showChoice(choice)
    )
    IPC.on('APP-Windows-Privilege-Choice-Closed').then((_key: string, id: string) =>
      WindowsPrivilegeController.dismissChoice(id)
    )

    IPC.on('APP-Data-Directory-Failure').then((_key: string, res: any) => {
      const message =
        res?.reason === 'helper-binary-missing'
          ? I18nT('base.helperBinaryMissing')
          : I18nT('base.dataDirectoryRecoveryFailed')
      MessageError(message)
    })

    IPC.on('APP-FlyEnv-Helper-Notice').then((key: string, res: any) => {
      // 用户取消不应立刻触发第二个安装提示；UAC、未选择、管理员模式不显示 Helper 修复通知。
      if (res?.reason === 'elevation_uac_cancelled' || res?.reason === 'elevation_cancelled') return
      if (
        window.Server.isWindows &&
        (window.Server.WindowsProcessElevated ||
          AppStore().config.setup.windowsElevationMethod !== 'helper' ||
          AppStore().config.setup.windowsElevationChoiceVersion !==
            WINDOWS_ELEVATION_CHOICE_VERSION ||
          WindowsPrivilegeController.busy)
      )
        return
      if (res?.code === 0) {
        MessageSuccess(res?.msg)
      } else if (res.code === 1) {
        if (
          res?.status === 'installFaild' &&
          this.inited &&
          !FlyEnvHelperSetup.show &&
          !FlyEnvHelperSetup.loading &&
          !HelperStore.isInstallResultPending()
        ) {
          MessageError(res?.msg)
          HelperStore.showInstallFailDialog(res?.reason)
        } else if (
          (!res?.status || res.status === 'needInstall') &&
          !FlyEnvHelperSetup.show &&
          !FlyEnvHelperSetup.loading &&
          !HelperStore.isInstallResultPending() &&
          HelperStore.shouldShowNeedInstallDialog(res?.reason)
        ) {
          HelperStore.showNeedInstallDialog(res?.reason)
        }
      } else if (res.code === 2) {
        MessageWarning(res?.msg)
      }
    })

    setupMcpIpc()
  }
}

export default new GlobalIPCOn()
