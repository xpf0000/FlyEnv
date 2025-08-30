import type { MachineItemType } from '@/components/Podman/type'
import type { CallbackFn } from '@shared/app'
import IPC from '@/util/IPC'
import { reactive } from 'vue'
import { MessageError } from '@/util/Element'
import { I18nT } from '@lang/index'
import { ElMessageBox } from 'element-plus'
import { Container } from '@/components/Podman/class/Container'

export class Machine {
  name: string = ''
  isDefault: boolean = false
  run: boolean = false
  running: boolean = false
  info?: MachineItemType
  container: Container[] = []
  _onRemove?: CallbackFn

  constructor(obj: any) {
    Object.assign(this, obj)
  }

  /**
   * Fetch Machine info
   */
  fetchInfoAndContainer() {
    IPC.send('app-fork:podman', 'fetchMachineInfo', this.name).then((key: string, res: any) => {
      IPC.off(key)
      if (res?.code === 0) {
        this.info = reactive(res?.data?.info ?? {})
        const arr = res?.data?.machine ?? []
        for (const item of arr) {
          const find = this.container.some((s) => s.id === item.id)
          if (!find) {
            const container = reactive(new Container(item))
            container.machineName = this.name
            container.start = container.start.bind(container)
            container.stop = container.stop.bind(container)
            container.remove = container.remove.bind(container)
            container._onRemove = this.onContainerRemove
            this.container.unshift(container)
          }
        }
      }
    })
  }

  onContainerRemove(item: Container) {
    this.container = this.container.filter((f) => f.id !== item.id)
  }

  start() {
    if (this.run || this.running) {
      return
    }
    this.running = true
    IPC.send('app-fork:podman', 'machineStart', this.name).then((key: string, res: any) => {
      IPC.off(key)
      if (res?.code === 0) {
        this.run = true
      } else {
        MessageError(res?.msg ?? I18nT('base.fail'))
      }
      this.running = false
    })
  }

  stop() {
    if (!this.run || this.running) {
      return
    }
    this.running = true
    IPC.send('app-fork:podman', 'machineStop', this.name).then((key: string, res: any) => {
      IPC.off(key)
      if (res?.code === 0) {
        this.run = false
      } else {
        MessageError(res?.msg ?? I18nT('base.fail'))
      }
      this.running = false
    })
  }

  remove() {
    if (this.running) {
      return
    }
    ElMessageBox.confirm(I18nT('podman.removeMachineTips'), I18nT('host.warning'), {
      confirmButtonText: I18nT('base.confirm'),
      cancelButtonText: I18nT('base.cancel'),
      type: 'warning'
    })
      .then(() => {
        IPC.send('app-fork:podman', 'machineRemove', this.name).then((key: string, res: any) => {
          IPC.off(key)
          if (res?.code === 0) {
            this?._onRemove?.(this)
          } else {
            MessageError(res?.msg ?? I18nT('base.fail'))
          }
        })
      })
      .catch()
  }
}
