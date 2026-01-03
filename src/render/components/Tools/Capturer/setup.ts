import localForage from 'localforage'
import { reactiveBind } from '@/util/Index'
import IPC from '@/util/IPC'
import { MessageSuccess } from '@/util/Element'
import { I18nT } from '@lang/index'

class CapturerSetup {
  key: string[] = []
  name = 'flyenv-capturer-{timestramp}'
  dir = ''

  private onConfigUpdate() {
    IPC.send('Capturer:Config-Update', JSON.parse(JSON.stringify(this))).then((key: string) => {
      IPC.off(key)
    })
  }

  init() {
    localForage.getItem('flyenv-capturer-setup').then((res: any) => {
      if (res) {
        this.key = res.key
        this.name = res.name
        this.dir = res.dir
        this.onConfigUpdate()
      }
    })
  }

  save() {
    localForage.setItem('flyenv-capturer-setup', JSON.parse(JSON.stringify(this))).catch()
    this.onConfigUpdate()
    MessageSuccess(I18nT('base.success'))
  }
}
export default reactiveBind(new CapturerSetup())
