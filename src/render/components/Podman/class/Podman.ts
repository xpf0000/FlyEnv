import IPC from '@/util/IPC'
import { reactive } from 'vue'
import { Machine } from '@/components/Podman/class/Machine'

class Podman {
  machine: Machine[] = []
  version: string = ''
  inited: boolean = false
  loading: boolean = false
  tab: string = ''

  onMachineRemove() {}

  init() {
    if (this.inited || this.loading) {
      return
    }
    this.loading = true
    this.inited = true
    IPC.send('app-fork:podman', 'podmanInit').then((key: string, res: any) => {
      IPC.off(key)
      if (res?.code === 0) {
        this.version = res?.data?.version ?? ''
        const arr = res?.data?.machine ?? []
        this.machine.splice(0)
        for (const item of arr) {
          const machine = reactive(new Machine(item))
          machine.start = machine.start.bind(machine)
          machine.stop = machine.stop.bind(machine)
          machine.onContainerRemove = machine.onContainerRemove.bind(machine)
          machine.fetchInfoAndContainer = machine.fetchInfoAndContainer.bind(machine)
          machine.remove = machine.remove.bind(machine)
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
      this.loading = true
    })
  }

  tabChange(item: Machine) {
    this.tab = item.name
    item.fetchInfoAndContainer()
  }
}

const PodmanManager = reactive(new Podman())

export { PodmanManager }
