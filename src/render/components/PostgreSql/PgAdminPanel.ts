import { ref } from 'vue'
import { I18nT } from '@lang/index'
import { join } from '@/util/path-browserify'
import { BrewStore } from '@/store/brew'
import { PostgreSqlSetup } from './setup'
import { MessageError } from '@/util/Element'
import { shell } from '@/util/NodeFn'
import IPC from '@/util/IPC'
import { ElMessage } from 'element-plus'
import { isWebPanelInstallNotice } from '@shared/WebPanelInstallNotice'

export class PgAdminPanel {
  readonly opening = ref(false)
  private installNotice: { close: () => void } | undefined

  open = async () => {
    if (this.opening.value) return

    const brewStore = BrewStore()
    const version = brewStore.module('postgresql').installed.find((item) => item.run)
    const python = brewStore.currentVersion('python')
    if (!version || !python?.bin) {
      MessageError(I18nT('base.needSelectVersion'))
      return
    }

    this.opening.value = true
    try {
      await PostgreSqlSetup.init()
      const versionTop = version.version?.split('.')?.shift() ?? ''
      const dataDir =
        PostgreSqlSetup.dir[version.bin] ??
        join(window.Server.PostgreSqlDir!, `postgresql${versionTop}`)
      const pgAdminVersion = JSON.parse(JSON.stringify(version))
      const pgAdminPython = JSON.parse(JSON.stringify(python))
      IPC.send('app-fork:postgresql', 'openPGAdmin', pgAdminVersion, dataDir, pgAdminPython).then(
        (key: string, res: any) => this.handleResponse(key, res)
      )
    } catch (error) {
      this.complete()
      MessageError(error instanceof Error ? error.message : 'pgAdmin 4 failed to start')
    }
  }

  private handleResponse(key: string, res: any) {
    if (res?.code === 200) {
      if (isWebPanelInstallNotice(res.msg)) {
        this.installNotice?.close()
        this.installNotice = ElMessage({
          message: I18nT('base.webPanelFirstInstall', { service: res.msg.service }),
          type: 'info',
          duration: 0,
          showClose: true
        })
      }
      return
    }

    this.complete(key)
    if (res?.code === 0 && res.data?.url) {
      shell.openExternal(res.data.url).catch()
      return
    }
    MessageError(res?.msg ?? 'pgAdmin 4 failed to start')
  }

  private complete(key?: string) {
    this.installNotice?.close()
    this.installNotice = undefined
    if (key) IPC.off(key)
    this.opening.value = false
  }
}

export default new PgAdminPanel()
