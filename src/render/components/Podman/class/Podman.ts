import IPC from '@/util/IPC'
import { reactive } from 'vue'
import { Machine } from '@/components/Podman/class/Machine'
import XTerm from '@/util/XTerm'

class Podman {
  machine: Machine[] = []
  version: string = ''
  inited: boolean = false
  loading: boolean = false
  tab: string = ''
  xtermExec = ''

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
          const machine = reactive(new Machine(item))
          machine.reStart = machine.reStart.bind(machine)
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

const PodmanManager = reactive(new Podman())
PodmanManager.init = PodmanManager.init.bind(PodmanManager)
PodmanManager.onMachineRemove = PodmanManager.onMachineRemove.bind(PodmanManager)
PodmanManager.reinit = PodmanManager.reinit.bind(PodmanManager)
PodmanManager.tabChange = PodmanManager.tabChange.bind(PodmanManager)

export { PodmanManager }
