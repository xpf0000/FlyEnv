import type { ContainerPortItem } from '@/components/Podman/type'
import type { CallbackFn } from '@shared/app'
import IPC from '@/util/IPC'
import { MessageError } from '@/util/Element'
import { I18nT } from '@lang/index'
import { ElMessageBox } from 'element-plus'
import { XTermExec, XTermExecCache } from '@/util/XTermExec'
import { AsyncComponentShow } from '@/util/AsyncComponent'
import { reactiveBind } from '@/util/Index'
import { dialog, shell } from '@/util/NodeFn'

export class Container {
  id: string = ''
  machineName: string = ''
  name: string[] = []
  Image: string = ''
  ImageID = ''
  Mounts: string[] = []
  Networks: string[] = []
  command: string = ''
  Ports: ContainerPortItem[] = []
  run: boolean = false
  running: boolean = false
  statusError?: string
  exporting: boolean = false

  _onRemove?: CallbackFn

  constructor(obj: any) {
    Object.assign(this, obj)
    this.running = false
    this.statusError = undefined
  }

  start() {
    if (this.run || this.running) {
      return
    }
    this.running = true
    IPC.send('app-fork:podman', 'containerStart', this.id, this.machineName).then(
      (key: string, res: any) => {
        IPC.off(key)
        if (res?.code === 0) {
          this.run = true
        } else {
          MessageError(res?.msg ?? I18nT('base.fail'))
        }
        this.running = false
      }
    )
  }

  stop() {
    if (!this.run || this.running) {
      return
    }
    this.running = true
    IPC.send('app-fork:podman', 'containerStop', this.id, this.machineName).then(
      (key: string, res: any) => {
        IPC.off(key)
        if (res?.code === 0) {
          this.run = false
        } else {
          MessageError(res?.msg ?? I18nT('base.fail'))
        }
        this.running = false
      }
    )
  }

  remove() {
    if (this.running) {
      return
    }
    ElMessageBox.confirm(I18nT('podman.removeContainerTips'), I18nT('host.warning'), {
      confirmButtonText: I18nT('base.confirm'),
      cancelButtonText: I18nT('base.cancel'),
      type: 'warning'
    })
      .then(() => {
        IPC.send('app-fork:podman', 'containerRemove', this.name, this.machineName).then(
          (key: string, res: any) => {
            IPC.off(key)
            if (res?.code === 0) {
              this?._onRemove?.(this)
            } else {
              MessageError(res?.msg ?? I18nT('base.fail'))
            }
          }
        )
      })
      .catch()
  }

  checkStatusAfterTerminalExec() {
    IPC.send('app-fork:podman', 'isContainerRunning', this.id, this.machineName).then(
      (key: string, res: any) => {
        IPC.off(key)
        if (res?.code === 0) {
          this.run = res.data
        } else {
          this.statusError = res?.msg ?? I18nT('base.fail')
        }
        this.running = false
      }
    )
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
            this.checkStatusAfterTerminalExec()
          })
        })
      }
      return
    }
    this.running = true
    let xtermExec = XTermExecCache?.[this.id]
    if (!xtermExec) {
      xtermExec = reactiveBind(new XTermExec())
      const arr: string[] = ['podman start', this.id]
      const logs: string[] = ['podman logs', this.id]
      xtermExec.cammand = [arr.join(' '), logs.join(' ')]
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
    if (this.running) {
      const xtermExec = XTermExecCache?.[this.id]
      if (xtermExec) {
        import('@/components/XTermExecDialog/index.vue').then((res) => {
          AsyncComponentShow(res.default, {
            title: I18nT('podman.StopWithTerminal'),
            item: xtermExec
          }).then(() => {
            this.checkStatusAfterTerminalExec()
          })
        })
      }
      return
    }
    this.running = true
    let xtermExec = XTermExecCache?.[this.id]
    if (!xtermExec) {
      xtermExec = reactiveBind(new XTermExec())
      const arr: string[] = ['podman stop', this.id]
      const logs: string[] = ['podman logs', this.id]
      xtermExec.cammand = [arr.join(' '), logs.join(' ')]
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

  showLogsWithTerminal() {
    const key = `logs-${this.id}`
    let xtermExec = XTermExecCache?.[key]
    if (!xtermExec) {
      xtermExec = reactiveBind(new XTermExec())
      const logs: string[] = ['podman logs -f', this.id]
      xtermExec.cammand = [logs.join(' ')]
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

  doExport() {
    const xtermExec = XTermExecCache?.[this.id]
    if (xtermExec) {
      import('@/components/XTermExecDialog/index.vue').then((res) => {
        AsyncComponentShow(res.default, {
          title: xtermExec.title,
          item: xtermExec
        }).then()
      })
    }

    const name = this.name
    dialog
      .showSaveDialog({
        defaultPath: `${name}.tar`
      })
      .then(({ canceled, filePath }: any) => {
        if (canceled || !filePath) {
          return
        }
        this.exporting = true
        const dir = filePath
        const id = this.id
        const command = `podman save -o "${dir}" ${this.name}`
        const xtermExec = reactiveBind(new XTermExec())
        xtermExec.cammand = [command]
        xtermExec.wait().then(() => {
          delete XTermExecCache[id]
          this.exporting = false
          shell.showItemInFolder(dir).catch()
        })
        xtermExec.whenCancel().then(() => {
          delete XTermExecCache[id]
          this.exporting = false
        })
        xtermExec.title = I18nT('base.export')
        XTermExecCache[id] = xtermExec
        import('@/components/XTermExecDialog/index.vue').then((res) => {
          AsyncComponentShow(res.default, {
            title: I18nT('base.export'),
            item: xtermExec
          }).then()
        })
      })
  }

  showInfo() {
    import('@/components/Podman/container/info.vue').then((res) => {
      AsyncComponentShow(res.default, {
        item: this
      }).then()
    })
  }
}
