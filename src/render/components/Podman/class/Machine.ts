import type { PodmanContainerItem, PodmanImageItem } from '@fork/module/Podman/list'
import type { MachineItemType } from '@/components/Podman/type'
import type { CallbackFn } from '@shared/app'
import IPC from '@/util/IPC'
import { reactive } from 'vue'
import { MessageError } from '@/util/Element'
import { I18nT } from '@lang/index'
import { ElMessageBox } from 'element-plus'
import { Container } from '@/components/Podman/class/Container'
import { Image } from '@/components/Podman/class/Image'
import { XTermExec, XTermExecCache } from '@/util/XTermExec'
import { reactiveBind } from '@/util/Index'
import { dialog } from '@/util/NodeFn'
import { AsyncComponentShow } from '@/util/AsyncComponent'
import { PodmanManager } from '@/components/Podman/class/Podman'

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
  imageImporting = false
  containerImporting = false
  containerCreating = false

  DashboardFetching = false
  ImageFetching = false
  ContainerFetching = false

  constructor(obj: any) {
    Object.assign(this, obj)
    this.running = false
    this.run = false
    // stopped running
    // this.info?.State
    console.log('Machine constructor: ', obj)
    if (this.info?.State === 'running') {
      this.run = true
    }
  }

  fetchImages() {
    if (this.ImageFetching || this.DashboardFetching) {
      return
    }
    this.ImageFetching = true
    IPC.send('app-fork:podman', 'fetchImageList', this.name).then((key: string, res: any) => {
      IPC.off(key)
      if (res?.code === 0) {
        this.updateImages(res?.data ?? [])
      }
      this.ImageFetching = false
    })
  }

  fetchContainers() {
    if (this.ContainerFetching || this.DashboardFetching) {
      return
    }
    this.ContainerFetching = true
    IPC.send('app-fork:podman', 'fetchContainerList', this.name).then((key: string, res: any) => {
      IPC.off(key)
      if (res?.code === 0) {
        this.updateContainers(res?.data ?? [])
      }
      this.ContainerFetching = false
    })
  }

  /**
   * Fetch Machine info and containers
   */
  fetchInfoAndContainer(refresh = false) {
    if (
      (!refresh && this.fetched) ||
      !this.run ||
      this.DashboardFetching ||
      this.ImageFetching ||
      this.ContainerFetching
    ) {
      return
    }
    this.DashboardFetching = true
    IPC.send('app-fork:podman', 'fetchMachineInfo', this.name).then((key: string, res: any) => {
      IPC.off(key)
      if (res?.code === 0) {
        this.fetched = true
        this.info = reactive(res?.data?.info ?? {})
        this.updateContainers(res?.data?.container ?? [])
        this.updateImages(res?.data?.images ?? [])
      }
      this.DashboardFetching = false
    })
  }

  private updateImages(items: PodmanImageItem[]) {
    const existing = new Map(this.images.map((image) => [image.id, image]))
    const pendingPulls = this.images.filter((image) => image.pulling && !image._onRemove)
    this.images = [
      ...pendingPulls,
      ...items.map((item) => {
        const image = existing.get(item.id)
        if (
          image &&
          image.connection?.name === item.connection?.name &&
          image.connection?.uri === item.connection?.uri
        ) {
          image.name = reactive(item.name)
          return image
        }
        const next = reactiveBind(new Image(item))
        next._onRemove = this.onImageRemove.bind(this)
        return next
      })
    ]
  }

  private updateContainers(items: PodmanContainerItem[]) {
    const existing = new Map(this.container.map((container) => [container.id, container]))
    this.container = items
      .slice()
      .reverse()
      .map((item) => {
        const container = existing.get(item.id)
        if (container) return container
        const next = reactiveBind(new Container(item))
        next._onRemove = this.onContainerRemove
        return next
      })
  }

  /**
   * 镜像删除回调
   */
  onImageRemove(item: Image) {
    this.images = this.images.filter((image) => image !== item)
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
        PodmanManager.refreshComposeState()
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

  imageImport() {
    const id = `${this.name}-image-import`
    const xtermExec = XTermExecCache?.[id]
    if (xtermExec) {
      import('@/components/XTermExecDialog/index.vue').then((res) => {
        AsyncComponentShow(res.default, {
          title: xtermExec.title,
          item: xtermExec
        }).then()
      })
      return
    }
    dialog
      .showOpenDialog({
        properties: ['openFile', 'showHiddenFiles']
      })
      .then(({ canceled, filePaths }: any) => {
        if (canceled || filePaths.length === 0) {
          return
        }
        this.imageImporting = true
        const [path] = filePaths
        const command = `podman load -i "${path}"`
        const xtermExec = reactiveBind(new XTermExec())
        xtermExec.id = id
        xtermExec.command = [command]
        xtermExec.wait().then(() => {
          delete XTermExecCache[id]
          this.imageImporting = false
          this.fetchImages()
        })
        xtermExec.whenCancel().then(() => {
          delete XTermExecCache[id]
          this.imageImporting = false
        })
        xtermExec.title = I18nT('base.import')
        XTermExecCache[id] = xtermExec
        import('@/components/XTermExecDialog/index.vue').then((res) => {
          AsyncComponentShow(res.default, {
            title: xtermExec.title,
            item: xtermExec
          }).then()
        })
      })
  }

  containerImport() {
    const id = `${this.name}-container-import`
    const xtermExec = XTermExecCache?.[id]
    if (xtermExec) {
      import('@/components/XTermExecDialog/index.vue').then((res) => {
        AsyncComponentShow(res.default, {
          title: xtermExec.title,
          item: xtermExec
        }).then()
      })
      return
    }
    dialog
      .showOpenDialog({
        properties: ['openFile', 'showHiddenFiles']
      })
      .then(({ canceled, filePaths }: any) => {
        if (canceled || filePaths.length === 0) {
          return
        }
        this.containerImporting = true
        const [path] = filePaths
        const command = `podman import "${path}"`
        const xtermExec = reactiveBind(new XTermExec())
        xtermExec.id = id
        xtermExec.command = [command]
        xtermExec.wait().then(() => {
          delete XTermExecCache[id]
          this.containerImporting = false
          this.fetchContainers()
        })
        xtermExec.whenCancel().then(() => {
          delete XTermExecCache[id]
          this.containerImporting = false
        })
        xtermExec.title = I18nT('base.import')
        XTermExecCache[id] = xtermExec
        import('@/components/XTermExecDialog/index.vue').then((res) => {
          AsyncComponentShow(res.default, {
            title: xtermExec.title,
            item: xtermExec
          }).then()
        })
      })
  }
}
