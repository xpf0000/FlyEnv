import IPC from '@/util/IPC'
import { Machine } from '@/components/Podman/class/Machine'
import XTerm from '@/util/XTerm'
import { reactiveBind } from '@/util/Index'
import type { AllAppModule } from '@/core/type'
import { reactive } from 'vue'
import { StorageGetAsync, StorageSetAsync } from '@/util/Storage'

class Podman {
  machine: Machine[] = []
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
}

const PodmanManager = reactiveBind(new Podman())

export { PodmanManager }
