import { reactive } from 'vue'
import IPC from '@/util/IPC'
import type { SoftInstalled } from '@/store/brew'
import { I18nT } from '@shared/lang'
import { MessageError, MessageSuccess } from '@/util/Element'

export const ServiceActionStore: {
  versionDeling: Record<string, boolean>
  pathSeting: Record<string, boolean>
  allPath: string[]
  fetchPathing: boolean
  fetchPath: () => void
  updatePath: (item: SoftInstalled, typeFlag: string) => void
} = reactive({
  versionDeling: {},
  pathSeting: {},
  allPath: [],
  fetchPathing: false,
  fetchPath() {
    if (ServiceActionStore.fetchPathing) {
      return
    }
    ServiceActionStore.fetchPathing = true
    IPC.send('app-fork:tools', 'fetchPATH').then((key: string, res: any) => {
      IPC.off(key)
      if (res?.code === 0 && res?.data?.length > 0) {
        ServiceActionStore.allPath = reactive([...res.data])
        setTimeout(() => {
          ServiceActionStore.fetchPathing = false
        }, 60000)
      }
    })
  },
  updatePath(item: SoftInstalled, typeFlag: string) {
    if (ServiceActionStore.pathSeting?.[item.bin]) {
      return
    }
    ServiceActionStore.pathSeting[item.bin] = true
    IPC.send('app-fork:tools', 'updatePATH', JSON.parse(JSON.stringify(item)), typeFlag).then(
      (key: string, res: any) => {
        IPC.off(key)
        if (res?.code === 0 && res?.data?.length > 0) {
          ServiceActionStore.allPath = reactive([...res.data])
          MessageSuccess(I18nT('base.success'))
        } else {
          MessageError(res?.msg ?? I18nT('base.fail'))
        }
        delete ServiceActionStore.pathSeting?.[item.bin]
      }
    )
  }
})
