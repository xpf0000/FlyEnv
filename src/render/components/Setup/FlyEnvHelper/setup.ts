import { reactive } from 'vue'
import IPC from '@/util/IPC'
import { ElMessage } from 'element-plus'
import { I18nT } from '@lang/index'
import { FlyEnvHelperSetup } from '@/components/FlyEnvHelper/setup'
import { AsyncComponentShow } from '@/util/AsyncComponent'

export const FlyEnvHelperFix = reactive({
  fixing: false,
  doFix() {
    if (this.fixing) {
      return
    }
    this.fixing = true
    IPC.send('APP:FlyEnv-Helper-Check').then((key: string, res: any) => {
      IPC.off(key)
      if (res?.code === 0) {
        ElMessage.success(I18nT('setup.flyenvHelperFixSuccess'))
      } else {
        if (!FlyEnvHelperSetup.show) {
          import('@/components/FlyEnvHelper/index.vue').then((m) => {
            AsyncComponentShow(m.default).then()
          })
        }
      }
      this.fixing = false
    })
  }
})
