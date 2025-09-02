import IPC from '@/util/IPC'
import { MessageError } from '@/util/Element'
import { I18nT } from '@lang/index'
import { ElMessageBox } from 'element-plus'

export class Image {
  id: string = ''
  name: string = ''
  tag: string = ''
  size: string = ''
  created: string = ''
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
    })
      .then(() => {
        IPC.send('app-fork:podman', 'imageRemove', this.id).then((key: string, res: any) => {
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
}
