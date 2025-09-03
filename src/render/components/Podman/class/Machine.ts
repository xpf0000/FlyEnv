import type { MachineItemType } from '@/components/Podman/type'
import type { CallbackFn } from '@shared/app'
import IPC from '@/util/IPC'
import { reactive } from 'vue'
import { MessageError } from '@/util/Element'
import { I18nT } from '@lang/index'
import { ElMessageBox } from 'element-plus'
import { Container } from '@/components/Podman/class/Container'
import { Image } from '@/components/Podman/class/Image'
import { XTermExec } from '@/util/XTermExec'
import { reactiveBind } from '@/util/Index'

export class Machine {
  name: string = ''
  isDefault: boolean = false
  run: boolean = false
  running: boolean = false
  info?: MachineItemType
  container: Container[] = []
  images: Image[] = [] // 新增镜像列表
  _onRemove?: CallbackFn
  fetched: boolean = false
  tab: string = 'Dashboard'

  ImageXTerm: XTermExec
  ContainerXTerm: XTermExec

  constructor(obj: any) {
    Object.assign(this, obj)
    this.ImageXTerm = reactiveBind(new XTermExec())
    this.ContainerXTerm = reactiveBind(new XTermExec())
  }

  /**
   * Fetch Machine info and containers
   */
  fetchInfoAndContainer() {
    if (this.fetched || !this.run) {
      return
    }
    IPC.send('app-fork:podman', 'fetchMachineInfo', this.name).then((key: string, res: any) => {
      IPC.off(key)
      if (res?.code === 0) {
        this.fetched = true
        this.info = reactive(res?.data?.info ?? {})
        const containers = res?.data?.container ?? []
        for (const item of containers) {
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
        const images = res?.data?.images ?? []
        for (const img of images) {
          const find = this.images.some((s) => s.id === img.id)
          if (!find) {
            const image = reactive(new Image(img))
            image._onRemove = this.onImageRemove.bind(this)
            this.images.push(image)
          }
        }
      }
    })
  }

  /**
   * 镜像删除回调
   */
  onImageRemove(item: Image) {
    this.images = this.images.filter((img) => img.id !== item.id)
  }

  onContainerRemove(item: Container) {
    this.container = this.container.filter((f) => f.id !== item.id)
  }

  reStart() {
    if (this.running) {
      return
    }
    this.running = true
    IPC.send('app-fork:podman', 'machineReStart', this.name).then((key: string, res: any) => {
      IPC.off(key)
      if (res?.code === 0) {
        this.run = true
      } else {
        MessageError(res?.msg ?? I18nT('base.fail'))
      }
      this.running = false
    })
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
        this.fetchInfoAndContainer()
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
