import type { ContainerPortItem } from '@/components/Podman/type'
import type { CallbackFn } from '@shared/app'
import IPC from '@/util/IPC'
import { MessageError } from '@/util/Element'
import { I18nT } from '@lang/index'
import { ElMessageBox } from 'element-plus'

export class Container {
  id: string = ''
  machineName: string = ''
  name: string = ''
  image: string = ''
  command: string = ''
  ports: string = ''
  portList: ContainerPortItem[] = []
  run: boolean = false
  running: boolean = false

  _onRemove?: CallbackFn

  constructor(obj: any) {
    Object.assign(this, obj)
  }

  start() {
    if (this.run || this.running) {
      return
    }
    this.running = true
    IPC.send('app-fork:podman', 'containerStart', this.name, this.machineName).then(
      (key: string, res: any) => {
        IPC.off(key)
        if (res?.code === 0) {
          this.run = true
        } else {
          MessageError(res?.msg ?? I18nT('base.fail'))
        }
        this.running = false
      }
    )
  }

  stop() {
    if (!this.run || this.running) {
      return
    }
    this.running = true
    IPC.send('app-fork:podman', 'containerStop', this.name, this.machineName).then(
      (key: string, res: any) => {
        IPC.off(key)
        if (res?.code === 0) {
          this.run = false
        } else {
          MessageError(res?.msg ?? I18nT('base.fail'))
        }
        this.running = false
      }
    )
  }

  remove() {
    if (this.running) {
      return
    }
    ElMessageBox.confirm(I18nT('podman.removeContainerTips'), I18nT('host.warning'), {
      confirmButtonText: I18nT('base.confirm'),
      cancelButtonText: I18nT('base.cancel'),
      type: 'warning'
    })
      .then(() => {
        IPC.send('app-fork:podman', 'containerRemove', this.name, this.machineName).then(
          (key: string, res: any) => {
            IPC.off(key)
            if (res?.code === 0) {
              this?._onRemove?.(this)
            } else {
              MessageError(res?.msg ?? I18nT('base.fail'))
            }
          }
        )
      })
      .catch()
  }
}
