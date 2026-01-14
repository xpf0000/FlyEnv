import localForage from 'localforage'
import { reactiveBind } from '@/util/Index'
import IPC from '@/util/IPC'
import { MessageSuccess } from '@/util/Element'
import { I18nT } from '@lang/index'
import { SetupStore } from '@/components/Setup/store'

class CapturerSetup {
  key: string[] = []
  name = 'flyenv-capturer-{timestramp}'
  dir = ''
  trialStartTime: number = 0

  private onConfigUpdate() {
    const setupStore = SetupStore()
    if (!setupStore.isActive && this.trialStartTime > 0) {
      const currentTime = Math.round(new Date().getTime() / 1000)
      if (this.trialStartTime + 3 * 24 * 60 * 60 < currentTime) {
        return
      }
    }
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
        this.trialStartTime = res?.trialStartTime ?? 0
        this.onConfigUpdate()
      }
    })
  }

  save(updateConfig = true) {
    localForage.setItem('flyenv-capturer-setup', JSON.parse(JSON.stringify(this))).catch()
    if (updateConfig) {
      this.onConfigUpdate()
      MessageSuccess(I18nT('base.success'))
    }
  }
}
export default reactiveBind(new CapturerSetup())
