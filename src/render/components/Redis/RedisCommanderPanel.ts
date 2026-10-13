import { ref } from 'vue'
import { I18nT } from '@lang/index'
import { BrewStore } from '@/store/brew'
import { MessageError } from '@/util/Element'
import { shell } from '@/util/NodeFn'
import IPC from '@/util/IPC'
import { ElMessage } from 'element-plus'
import { isWebPanelInstallNotice } from '@shared/WebPanelInstallNotice'
import { redisCommanderRequest } from './RedisCommanderRequest'

export class RedisCommanderPanel {
  readonly opening = ref(false)
  private installNotice: { close: () => void } | undefined

  open = async () => {
    if (this.opening.value) return

    this.opening.value = true
    try {
      const brewStore = BrewStore()
      const fetched = await brewStore.module('node').fetchInstalled(true)
      if (!fetched) {
        throw new Error(`NodeJS: ${I18nT('base.versionError')}`)
      }
      const node = brewStore.currentVersion('node')
      if (!node?.bin) {
        throw new Error(`NodeJS: ${I18nT('base.needSelectVersion')}`)
      }
      const redis = brewStore.module('redis').installed.find((item) => item.run)
      if (!redis) {
        throw new Error(I18nT('tray.notRun'))
      }
      const request = redisCommanderRequest(node, redis)
      IPC.sendSensitive('app-fork:redis', 'openRedisCommander', request.node, request.redis).then(
        (key: string, res: any) => this.handleResponse(key, res)
      )
    } catch (error) {
      this.complete()
      MessageError(error instanceof Error ? error.message : 'Redis Commander failed to start')
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
    MessageError(res?.msg ?? 'Redis Commander failed to start')
  }

  private complete(key?: string) {
    this.installNotice?.close()
    this.installNotice = undefined
    if (key) IPC.off(key)
    this.opening.value = false
  }
}

export default new RedisCommanderPanel()
