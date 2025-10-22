import IPC from '@/util/IPC'
import { MessageError } from '@/util/Element'
import { I18nT } from '@lang/index'
import { ElMessageBox } from 'element-plus'
import { dialog, shell } from '@/util/NodeFn'
import { reactiveBind } from '@/util/Index'
import { XTermExec, XTermExecCache } from '@/util/XTermExec'
import { AsyncComponentShow } from '@/util/AsyncComponent'

export class Image {
  id: string = ''
  name: string[] = []
  tag: string = ''
  size: string = ''
  created: string = ''
  pulling: boolean = false

  _onRemove?: (img: Image) => void

  constructor(obj: any) {
    Object.assign(this, obj)
  }

  pull() {
    IPC.send('app-fork:podman', 'imagePull', this.name, this.tag).then((key: string, res: any) => {
      IPC.off(key)
      if (res?.code === 0) {
        // 可根据需要刷新镜像列表
      } else {
        MessageError(res?.msg ?? I18nT('base.fail'))
      }
    })
  }

  remove() {
    ElMessageBox.confirm(I18nT('podman.removeImageTips'), I18nT('host.warning'), {
      confirmButtonText: I18nT('base.confirm'),
      cancelButtonText: I18nT('base.cancel'),
      type: 'warning'
    }).then(() => {
      this.pulling = true
      const id = this.id
      const command = `podman rmi -f ${id}`
      const xtermExec = reactiveBind(new XTermExec())
      xtermExec.cammand = [command]
      xtermExec.wait().then(() => {
        this?._onRemove?.(this)
        delete XTermExecCache[id]
        this.pulling = false
      })
      xtermExec.whenCancel().then(() => {
        delete XTermExecCache[id]
        this.pulling = false
      })
      xtermExec.title = I18nT('base.del')
      XTermExecCache[id] = xtermExec
      import('@/components/XTermExecDialog/index.vue').then((res) => {
        AsyncComponentShow(res.default, {
          title: I18nT('base.del'),
          item: xtermExec
        }).then()
      })
    })
  }

  doExport() {
    const name = this.name?.[0]?.replace?.(/\//g, '-')?.replace?.(/:/g, '-') ?? this.id
    dialog
      .showSaveDialog({
        defaultPath: `${name}.tar`
      })
      .then(({ canceled, filePath }: any) => {
        if (canceled || !filePath) {
          return
        }
        this.pulling = true
        const dir = filePath
        const id = this.id
        const command = `podman save -o "${dir}" ${this.name}`
        const xtermExec = reactiveBind(new XTermExec())
        xtermExec.cammand = [command]
        xtermExec.wait().then(() => {
          delete XTermExecCache[id]
          this.pulling = false
          shell.showItemInFolder(dir).catch()
        })
        xtermExec.whenCancel().then(() => {
          delete XTermExecCache[id]
          this.pulling = false
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

  doRename() {
    return new Promise((resolve) => {
      ElMessageBox.prompt(I18nT('podman.ImageName'), undefined, {
        confirmButtonText: I18nT('base.confirm'),
        cancelButtonText: I18nT('base.cancel'),
        inputValue: this.name?.[0] ?? this.id
      }).then(({ value }) => {
        this.pulling = true
        const id = this.id
        const command = []
        command.push(`podman tag ${this.id} ${value}`)
        for (const name of this.name) {
          command.push(`podman rmi ${name}`)
        }
        const xtermExec = reactiveBind(new XTermExec())
        xtermExec.cammand = command
        xtermExec.wait().then(() => {
          resolve(true)
          delete XTermExecCache[id]
          this.pulling = false
        })
        xtermExec.whenCancel().then(() => {
          delete XTermExecCache[id]
          this.pulling = false
        })
        xtermExec.title = I18nT('podman.Rename')
        XTermExecCache[id] = xtermExec
        import('@/components/XTermExecDialog/index.vue').then((res) => {
          AsyncComponentShow(res.default, {
            title: xtermExec.title,
            item: xtermExec
          }).then()
        })
      })
    })
  }
}
