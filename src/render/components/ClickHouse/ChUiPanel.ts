import { ref } from 'vue'
import { MessageError } from '@/util/Element'
import { shell } from '@/util/NodeFn'
import IPC from '@/util/IPC'

export class ChUiPanel {
  readonly opening = ref(false)

  open = () => {
    if (this.opening.value) return

    this.opening.value = true
    try {
      IPC.send('app-fork:clickhouse', 'openCHUI').then((key: string, res: any) => {
        if (res?.code === 200) return

        this.complete(key)
        if (res?.code === 0 && res.data?.url) {
          shell.openExternal(res.data.url).catch()
          return
        }
        MessageError(res?.msg ?? 'CH-UI failed to start')
      })
    } catch (error) {
      this.complete()
      MessageError(error instanceof Error ? error.message : 'CH-UI failed to start')
    }
  }

  private complete(key?: string) {
    if (key) IPC.off(key)
    this.opening.value = false
  }
}

export default new ChUiPanel()
