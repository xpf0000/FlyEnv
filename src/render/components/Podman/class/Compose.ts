import IPC from '@/util/IPC'
import { MessageError } from '@/util/Element'
import { I18nT } from '@lang/index'
import { XTermExec, XTermExecCache } from '@/util/XTermExec'
import { AsyncComponentShow } from '@/util/AsyncComponent'
import { reactiveBind } from '@/util/Index'

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
    this.run = false
    this.running = false
  }

  start() {
    if (this.running) return
    this.running = true
    IPC.send(
      'app-fork:podman',
      'composeStart',
      JSON.parse(JSON.stringify(this.paths)),
      this.flag
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

  checkStatusAfterTerminalExec() {
    IPC.send(
      'app-fork:podman',
      'isComposeRunning',
      JSON.parse(JSON.stringify(this.paths)),
      this.flag
    ).then((key: string, res: any) => {
      IPC.off(key)
      if (res?.code === 0) {
        this.run = res.data
      } else {
        this.statusError = res?.msg ?? I18nT('base.fail')
      }
      this.running = false
    })
  }

  startWithTerminal() {
    if (this.running) return
    this.running = true
    let xtermExec = XTermExecCache?.[this.id]
    if (!xtermExec) {
      xtermExec = reactiveBind(new XTermExec())
      const arr: string[] = ['docker-compose', ...this.paths.map((p) => `-f "${p}"`)]
      if (this.flag) {
        arr.push(`-p ${this.flag}`)
      }
      arr.push('up -d')
      xtermExec.cammand = [arr.join(' ')]
      xtermExec.wait().then(() => {
        delete XTermExecCache?.[this.id]
        this.checkStatusAfterTerminalExec()
      })
      XTermExecCache[this.id] = xtermExec
    }
    import('@/components/XTermExecDialog/index.vue').then((res) => {
      AsyncComponentShow(res.default, {
        title: I18nT('podman.StartWithTerminal'),
        item: xtermExec
      }).then(() => {
        this.checkStatusAfterTerminalExec()
      })
    })
  }

  stopWithTerminal() {
    if (this.running) return
    this.running = true
    let xtermExec = XTermExecCache?.[this.id]
    if (!xtermExec) {
      xtermExec = reactiveBind(new XTermExec())
      const arr: string[] = ['docker-compose', ...this.paths.map((p) => `-f "${p}"`)]
      if (this.flag) {
        arr.push(`-p ${this.flag}`)
      }
      arr.push('down')
      xtermExec.cammand = [arr.join(' ')]
      xtermExec.wait().then(() => {
        delete XTermExecCache?.[this.id]
        this.checkStatusAfterTerminalExec()
      })
      XTermExecCache[this.id] = xtermExec
    }
    import('@/components/XTermExecDialog/index.vue').then((res) => {
      AsyncComponentShow(res.default, {
        title: I18nT('podman.StopWithTerminal'),
        item: xtermExec
      }).then(() => {
        this.checkStatusAfterTerminalExec()
      })
    })
  }

  stop() {
    if (this.running) return
    this.running = true
    IPC.send(
      'app-fork:podman',
      'composeStop',
      JSON.parse(JSON.stringify(this.paths)),
      this.flag
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

  checkRunningStatus() {
    IPC.send(
      'app-fork:podman',
      'isComposeRunning',
      JSON.parse(JSON.stringify(this.paths)),
      this.flag
    ).then((key: string, res: any) => {
      IPC.off(key)
      if (res?.code === 0) {
        this.run = res.data
      } else {
        this.statusError = res?.msg ?? I18nT('base.fail')
      }
    })
  }
}
