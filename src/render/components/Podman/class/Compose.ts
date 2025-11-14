import IPC from '@/util/IPC'
import { MessageError } from '@/util/Element'
import { I18nT } from '@lang/index'
import { XTermExec, XTermExecCache } from '@/util/XTermExec'
import { AsyncComponentShow } from '@/util/AsyncComponent'
import { reactiveBind } from '@/util/Index'
import { PodmanManager } from '@/components/Podman/class/Podman'

export class Compose {
  id: string = ''
  name: string = ''
  paths: string[] = []
  flag: string = ''
  comment: string = ''
  services: string[] = []
  run: boolean = false
  running: boolean = false
  statusError?: string
  _onRemove?: (item: Compose) => void

  constructor(obj: any) {
    Object.assign(this, obj)
    this.running = false
    this.statusError = undefined
  }

  start() {
    if (this.running) return
    this.running = true
    IPC.send(
      'app-fork:podman',
      'composeStart',
      JSON.parse(JSON.stringify(this.paths)),
      this.flag,
      PodmanManager.currentSocket
    ).then((key: string, res: any) => {
      IPC.off(key)
      if (res?.code === 0) {
        this.run = true
      } else {
        MessageError(res?.msg ?? I18nT('base.fail'))
      }
      this.running = false
    })
  }

  startWithTerminal() {
    if (this.running) {
      const xtermExec = XTermExecCache?.[this.id]
      if (xtermExec) {
        import('@/components/XTermExecDialog/index.vue').then((res) => {
          AsyncComponentShow(res.default, {
            title: I18nT('podman.StartWithTerminal'),
            item: xtermExec
          }).then(() => {
            this.checkRunningStatus()
          })
        })
      }
      return
    }
    this.running = true
    let xtermExec = XTermExecCache?.[this.id]
    if (!xtermExec) {
      xtermExec = reactiveBind(new XTermExec())
      xtermExec.id = this.id
      const arr: string[] = ['docker-compose', ...this.paths.map((p) => `-f "${p}"`)]
      if (this.flag) {
        arr.push(`-p ${this.flag}`)
      }
      const logs: string[] = [...arr, 'logs']
      arr.push('up -d')
      const cammand = [arr.join(' '), logs.join(' ')]
      if (window.Server.isLinux || window.Server.isMacOS) {
        const socket = PodmanManager.currentSocket()
        cammand.unshift(`export DOCKER_HOST=unix://${socket}`)
      }
      xtermExec.cammand = cammand
      xtermExec.wait().then(() => {
        delete XTermExecCache?.[this.id]
        this.checkRunningStatus()
        this.running = false
      })
      XTermExecCache[this.id] = xtermExec
    }
    import('@/components/XTermExecDialog/index.vue').then((res) => {
      AsyncComponentShow(res.default, {
        title: I18nT('podman.StartWithTerminal'),
        item: xtermExec
      }).then(() => {
        this.checkRunningStatus()
      })
    })
  }

  stopWithTerminal() {
    if (this.running) {
      const xtermExec = XTermExecCache?.[this.id]
      if (xtermExec) {
        import('@/components/XTermExecDialog/index.vue').then((res) => {
          AsyncComponentShow(res.default, {
            title: I18nT('podman.StopWithTerminal'),
            item: xtermExec
          }).then(() => {
            this.checkRunningStatus()
          })
        })
      }
      return
    }
    this.running = true
    let xtermExec = XTermExecCache?.[this.id]
    if (!xtermExec) {
      xtermExec = reactiveBind(new XTermExec())
      xtermExec.id = this.id
      const arr: string[] = ['docker-compose', ...this.paths.map((p) => `-f "${p}"`)]
      if (this.flag) {
        arr.push(`-p ${this.flag}`)
      }
      const logs: string[] = [...arr, 'logs']
      arr.push('down')

      const cammand = [arr.join(' '), logs.join(' ')]
      if (window.Server.isLinux || window.Server.isMacOS) {
        const socket = PodmanManager.currentSocket()
        cammand.unshift(`export DOCKER_HOST=unix://${socket}`)
      }
      xtermExec.cammand = cammand

      xtermExec.wait().then(() => {
        delete XTermExecCache?.[this.id]
        this.checkRunningStatus()
        this.running = false
      })
      XTermExecCache[this.id] = xtermExec
    }
    import('@/components/XTermExecDialog/index.vue').then((res) => {
      AsyncComponentShow(res.default, {
        title: I18nT('podman.StopWithTerminal'),
        item: xtermExec
      }).then(() => {
        this.checkRunningStatus()
      })
    })
  }

  showLogsWithTerminal() {
    const key = `logs-${this.id}`
    let xtermExec = XTermExecCache?.[key]
    if (!xtermExec) {
      xtermExec = reactiveBind(new XTermExec())
      xtermExec.id = key
      const arr: string[] = ['docker-compose', ...this.paths.map((p) => `-f "${p}"`)]
      if (this.flag) {
        arr.push(`-p ${this.flag}`)
      }
      arr.push('logs -f')

      const cammand = [arr.join(' ')]
      if (window.Server.isLinux || window.Server.isMacOS) {
        const socket = PodmanManager.currentSocket()
        cammand.unshift(`export DOCKER_HOST=unix://${socket}`)
      }
      xtermExec.cammand = cammand

      xtermExec.wait().then(() => {
        delete XTermExecCache?.[key]
      })
      XTermExecCache[key] = xtermExec
    }
    import('@/components/XTermExecDialog/index.vue').then((res) => {
      AsyncComponentShow(res.default, {
        title: I18nT('base.log'),
        item: xtermExec,
        exitOnClose: true
      }).then()
    })
  }

  stop() {
    if (this.running) return
    this.running = true
    IPC.send(
      'app-fork:podman',
      'composeStop',
      JSON.parse(JSON.stringify(this.paths)),
      this.flag,
      PodmanManager.currentSocket()
    ).then((key: string, res: any) => {
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
    this.stop()
    this._onRemove?.(this)
  }

  refreshMachineContainer() {
    const machine = PodmanManager.machine.find((m) => m.name === PodmanManager.tab)
    if (machine) {
      machine.fetchContainers()
    }
  }

  checkRunningStatus() {
    return new Promise((resolve) => {
      IPC.send(
        'app-fork:podman',
        'isComposeRunning',
        JSON.parse(JSON.stringify(this.paths)),
        this.flag,
        PodmanManager.currentSocket()
      ).then((key: string, res: any) => {
        IPC.off(key)
        if (res?.code === 0) {
          this.run = res.data
          this.refreshMachineContainer()
          this.statusError = ''
        } else {
          this.statusError = res?.msg ?? I18nT('base.fail')
        }
        resolve(true)
      })
    })
  }
}
