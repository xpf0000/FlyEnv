import { reactive } from 'vue'
import IPC from '@/util/IPC'
import { Machine } from '@/components/Podman/class/Machine'
import { Compose } from '@/components/Podman/class/Compose'
import XTerm from '@/util/XTerm'
import { reactiveBind } from '@/util/Index'
import { StorageGetAsync, StorageSetAsync } from '@/util/Storage'
import { XTermExec, XTermExecCache } from '@/util/XTermExec'
import { AsyncComponentShow } from '@/util/AsyncComponent'
import { I18nT } from '@lang/index'
import { ElMessageBox } from 'element-plus'

class Podman {
  machine: Machine[] = []
  compose: Compose[] = [] // 新增 compose 列表
  version: string = ''
  inited: boolean = false
  loading: boolean = false
  tab: string = ''
  imageVersion: Partial<Record<string, string[]>> = {}

  installEnd: boolean = false
  installing: boolean = false
  xterm: XTerm | undefined

  dockerComposeExists: boolean = false
  dockerComposeInstalling: boolean = false

  onMachineRemove(item: Machine) {
    this.machine = this.machine.filter((f) => f.name !== item.name)
  }

  initImageVersion() {
    if (Object.keys(this.imageVersion).length > 0) {
      return
    }
    const storeKey = 'flyenv-podman-image-version'
    const doFetch = () => {
      IPC.send('app-fork:podman', 'fetchImagesVersion').then((key: string, res: any) => {
        IPC.off(key)
        if (res?.code === 0) {
          const obj: any = res?.data ?? {}
          this.imageVersion = reactive(obj)
          StorageSetAsync(storeKey, obj, 3 * 24 * 60 * 60).catch()
        }
      })
    }
    StorageGetAsync(storeKey)
      .then((res: any) => {
        this.imageVersion = reactive(res)
      })
      .catch(doFetch)
  }

  init() {
    if (this.inited || this.loading) {
      return
    }
    this.initImageVersion()
    this.checkIsComposeExists()
    PodmanManager.loadComposeList().catch()
    IPC.send('app-fork:podman', 'podmanInit').then((key: string, res: any) => {
      IPC.off(key)
      if (res?.code === 0) {
        this.inited = true
        this.version = res?.data?.version ?? ''
        const arr = res?.data?.machine ?? []
        this.machine.splice(0)
        for (const item of arr) {
          const machine = reactiveBind(new Machine(item))
          machine._onRemove = this.onMachineRemove
          this.machine.push(machine)
          if (!this.tab) {
            this.tab = machine.name
            machine.fetchInfoAndContainer()
          }
        }
      } else {
        this.version = ''
        this.machine.splice(0)
      }
      this.loading = false
    })
  }

  reinit() {
    this.loading = false
    this.inited = false
    this.init()
  }

  tabChange(item: Machine) {
    this.tab = item.name
    item.fetchInfoAndContainer()
  }

  async loadComposeList() {
    const storeKey = 'flyenv-podman-compose-list'
    try {
      const arr = await StorageGetAsync(storeKey)
      this.compose = []
      if (Array.isArray(arr)) {
        for (const item of arr) {
          const compose = reactiveBind(new Compose(item))
          compose.checkRunningStatus()
          this.compose.push(compose)
        }
      }
    } catch {
      this.compose = []
    }
  }

  async saveComposeList() {
    const storeKey = 'flyenv-podman-compose-list'
    await StorageSetAsync(storeKey, JSON.parse(JSON.stringify(this.compose)))
  }

  addCompose(item: any) {
    const compose = reactiveBind(new Compose(item))
    this.compose.push(compose)
    this.saveComposeList().catch()
    compose.checkRunningStatus()
  }

  removeCompose(item: Compose) {
    ElMessageBox.confirm(I18nT('base.delAlertContent'), I18nT('host.warning'), {
      confirmButtonText: I18nT('base.confirm'),
      cancelButtonText: I18nT('base.cancel'),
      type: 'warning'
    }).then(() => {
      this.compose = this.compose.filter((f) => f.id !== item.id)
      this.saveComposeList().catch()
    })
  }

  updateCompose(item: Compose) {
    const idx = this.compose.findIndex((f) => f.id === item.id)
    if (idx !== -1) {
      this.compose[idx] = item
      this.saveComposeList().catch()
    }
  }

  currentMachine() {
    return this.machine.find((m) => m.name === this.tab)
  }

  currentSocket() {
    return this.currentMachine()?.info?.ConnectionInfo?.PodmanSocket?.Path
  }

  checkIsComposeExists() {
    IPC.send('app-fork:podman', 'checkIsComposeExists').then((key: string, res: any) => {
      IPC.off(key)
      if (res?.code === 0) {
        this.dockerComposeExists = true
      } else {
        this.dockerComposeExists = false
      }
    })
  }

  installDockerCompose() {
    const id = 'App-Podman-DockerCompose-Install'
    if (this.dockerComposeInstalling) {
      const xtermExec = XTermExecCache?.[id]
      if (xtermExec) {
        import('@/components/XTermExecDialog/index.vue').then((res) => {
          AsyncComponentShow(res.default, {
            title: xtermExec.title,
            item: xtermExec
          }).then(() => {
            this.checkIsComposeExists()
          })
        })
      }
      return
    }

    this.dockerComposeInstalling = true
    let xtermExec = XTermExecCache?.[id]
    if (!xtermExec) {
      xtermExec = reactiveBind(new XTermExec())
      const arr: string[] = ['brew install docker-compose']
      xtermExec.cammand = [arr.join(' ')]
      xtermExec.wait().then(() => {
        delete XTermExecCache?.[id]
        this.checkIsComposeExists()
      })
      XTermExecCache[id] = xtermExec
    }
    import('@/components/XTermExecDialog/index.vue').then((res) => {
      AsyncComponentShow(res.default, {
        title: I18nT('podman.DockerComposeInstallButton'),
        item: xtermExec
      }).then(() => {
        this.checkIsComposeExists()
      })
    })
  }
}

const PodmanManager = reactiveBind(new Podman())

export { PodmanManager }
