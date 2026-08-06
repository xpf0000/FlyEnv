import { computed, ref } from 'vue'
import { I18nT } from '@lang/index'
import { BrewStore } from '@/store/brew'
import { MessageError } from '@/util/Element'
import { shell } from '@/util/NodeFn'
import IPC from '@/util/IPC'
import { ElMessage } from 'element-plus'
import { isWebPanelInstallNotice } from '@shared/WebPanelInstallNotice'

export class DbGatePanel {
  readonly opening = ref(false)
  readonly nodeAvailable = computed(() => !!BrewStore().currentVersion('node')?.bin)
  private installNotice: { close: () => void } | undefined

  open = () => {
    if (this.opening.value) return

    const node = BrewStore().currentVersion('node')
    if (!node?.bin) {
      MessageError(I18nT('base.needSelectVersion'))
      return
    }

    this.opening.value = true
    try {
      const selectedNode = JSON.parse(JSON.stringify(node))
      IPC.sendSensitive('app-fork:mongodb', 'openDbGate', selectedNode).then(
        (key: string, res: any) => this.handleResponse(key, res)
      )
    } catch (error) {
      this.complete()
      MessageError(error instanceof Error ? error.message : 'DbGate failed to start')
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
    MessageError(res?.msg ?? 'DbGate failed to start')
  }

  private complete(key?: string) {
    this.installNotice?.close()
    this.installNotice = undefined
    if (key) IPC.off(key)
    this.opening.value = false
  }
}

export default new DbGatePanel()
