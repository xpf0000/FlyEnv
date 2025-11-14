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
  }

  fetchImages() {
    if (this.ImageFetching) {
      return
    }
    this.ImageFetching = true
    IPC.send('app-fork:podman', 'fetchImageList', this.name).then((key: string, res: any) => {
      IPC.off(key)
      if (res?.code === 0) {
        const images = res?.data ?? []
        for (const img of images) {
          const find = this.images.find((s) => s.id === img.id)
          if (!find) {
            const image = reactiveBind(new Image(img))
            image._onRemove = this.onImageRemove.bind(this)
            this.images.push(image)
          } else {
            find.name = reactive(img.name)
          }
        }
      }
      this.ImageFetching = false
    })
  }

  fetchContainers() {
    if (this.ContainerFetching) {
      return
    }
    this.ContainerFetching = true
    IPC.send('app-fork:podman', 'fetchContainerList', this.name).then((key: string, res: any) => {
      IPC.off(key)
      if (res?.code === 0) {
        const containers = res?.data ?? []
        for (const item of containers) {
          const find = this.container.some((s) => s.id === item.id)
          if (!find) {
            const container = reactiveBind(new Container(item))
            container.machineName = this.name
            container._onRemove = this.onContainerRemove
            this.container.unshift(container)
          }
        }
      }
      this.ContainerFetching = false
    })
  }

  /**
   * Fetch Machine info and containers
   */
  fetchInfoAndContainer() {
    if (this.fetched || !this.run || this.DashboardFetching) {
      return
    }
    this.DashboardFetching = true
    IPC.send('app-fork:podman', 'fetchMachineInfo', this.name).then((key: string, res: any) => {
      IPC.off(key)
      if (res?.code === 0) {
        this.fetched = true
        this.info = reactive(res?.data?.info ?? {})
        const containers = res?.data?.container ?? []
        for (const item of containers) {
          const find = this.container.some((s) => s.id === item.id)
          if (!find) {
            const container = reactiveBind(new Container(item))
            container.machineName = this.name
            container._onRemove = this.onContainerRemove
            this.container.unshift(container)
          }
        }
        const images = res?.data?.images ?? []
        for (const img of images) {
          const find = this.images.find((s) => s.id === img.id)
          if (!find) {
            const image = reactiveBind(new Image(img))
            image._onRemove = this.onImageRemove.bind(this)
            this.images.push(image)
          } else {
            find.name = reactive(img.name)
          }
        }
      }
      this.DashboardFetching = false
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
        xtermExec.cammand = [command]
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
        xtermExec.cammand = [command]
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
