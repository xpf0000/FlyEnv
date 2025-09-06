import IPC from '@/util/IPC'
import { MessageError } from '@/util/Element'
import { I18nT } from '@lang/index'

export class Compose {
  name: string = ''
  path: string = ''
  command: string = ''
  services: string[] = []
  run: boolean = false
  running: boolean = false
  statusError?: string
  _onRemove?: (item: Compose) => void

  constructor(obj: any) {
    Object.assign(this, obj)
  }

  start() {
    if (this.running) return
    this.running = true
    IPC.send('app-fork:podman', 'composeUp', this.path).then((key: string, res: any) => {
      IPC.off(key)
      if (res?.code === 0) {
        this.run = true
      } else {
        MessageError(res?.msg ?? I18nT('base.fail'))
      }
    })
  }

  stop() {
    if (!this.running) return
    this.running = false
    IPC.send('app-fork:podman', 'composeDown', this.path).then((key: string, res: any) => {
      IPC.off(key)
      if (res?.code === 0) {
        this.run = false
      } else {
        MessageError(res?.msg ?? I18nT('base.fail'))
      }
    })
  }

  remove() {
    this.stop()
    this._onRemove?.(this)
  }

  checkRunningStatus() {
    IPC.send('app-fork:podman', 'isComposeRunning', this.name).then((key: string, res: any) => {
      IPC.off(key)
      if (res?.code === 0) {
        this.running = res.data
      } else {
        this.statusError = res?.msg ?? I18nT('base.fail')
      }
    })
  }
}
