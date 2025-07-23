import { reactive } from 'vue'
import IPC from '@/util/IPC'
import { ElMessage } from 'element-plus'
import { I18nT } from '@lang/index'

export const FlyEnvHelperFix = reactive({
  fixing: false,
  doFix() {
    if (this.fixing) {
      return
    }
    this.fixing = true
    IPC.send('App-Check-FlyEnv-Helper').then((key: string, res: any) => {
      IPC.off(key)
      if (res?.code === 0) {
        ElMessage.success(I18nT('setup.flyenvHelperFixSuccess'))
      } else {
        ElMessage.success(I18nT('setup.flyenvHelperFixFail'))
      }
      this.fixing = false
    })
  }
})
