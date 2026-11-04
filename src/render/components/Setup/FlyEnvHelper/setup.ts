import { reactive } from 'vue'
import IPC from '@/util/IPC'
import { ElMessage } from 'element-plus'
import { I18nT } from '@lang/index'
import { FlyEnvHelperSetup } from '@/components/FlyEnvHelper/setup'

export const FlyEnvHelperFix = reactive({
  fixing: false,
  doFix() {
    if (this.fixing || FlyEnvHelperSetup.show || FlyEnvHelperSetup.loading) {
      return
    }
    this.fixing = true
    if (window.Server.isLinux) {
      // Explicit maintenance also permits approving a new CA on a healthy helper.
      FlyEnvHelperSetup.open().finally(() => {
        this.fixing = false
      })
      return
    }
    IPC.send('APP:FlyEnv-Helper-Check').then((key: string, res: any) => {
      IPC.off(key)
      if (res?.code === 0) {
        ElMessage.success(I18nT('setup.flyenvHelperFixSuccess'))
      } else if (res?.reason === 'helper_binary_missing') {
        ElMessage.error(I18nT('menu.helperInstallFailTips'))
      } else {
        if (!FlyEnvHelperSetup.show) {
          FlyEnvHelperSetup.open()
        }
      }
      this.fixing = false
    })
  }
})
