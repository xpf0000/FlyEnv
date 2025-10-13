import IPC from '@/util/IPC'
import { Machine } from '@/components/Podman/class/Machine'
import { Compose } from '@/components/Podman/class/Compose'
import XTerm from '@/util/XTerm'
import { reactiveBind } from '@/util/Index'
import type { AllAppModule } from '@/core/type'
import { StorageGetAsync, StorageSetAsync } from '@/util/Storage'

class Podman {
  machine: Machine[] = []
  compose: Compose[] = [] // 新增 compose 列表
  version: string = ''
  inited: boolean = false
  loading: boolean = false
  tab: string = ''
  imageVersion: Partial<Record<AllAppModule, string[]>> = {}

  installEnd: boolean = false
  installing: boolean = false
  xterm: XTerm | undefined

  onMachineRemove(item: Machine) {
    this.machine = this.machine.filter((f) => f.name !== item.name)
  }

  init() {
    if (this.inited || this.loading) {
      return
    }
    this.loading = true
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
    this.compose = this.compose.filter((f) => f.id !== item.id)
    this.saveComposeList().catch()
  }

  updateCompose(item: Compose) {
    const idx = this.compose.findIndex((f) => f.id === item.id)
    if (idx !== -1) {
      this.compose[idx] = item
      this.saveComposeList().catch()
    }
  }
}

const PodmanManager = reactiveBind(new Podman())

export { PodmanManager }
