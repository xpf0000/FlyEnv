import { reactive } from 'vue'
import IPC from '@/util/IPC'
import { MessageError } from '@/util/Element'
import { I18nT } from '@lang/index'

type PathItem = {
  path: string
  raw: string
  error: boolean
}

type SetupType = {
  list: PathItem[]
  listBack: PathItem[]
  pathCMD: string
  pathPS: string
  fetchListing: boolean
  updating: boolean
  fetchList: () => void
  updatePath: (arr: string[]) => void
  rebackPath: () => void
  savePath: () => void
}

export const Setup: SetupType = reactive<SetupType>({
  list: [],
  listBack: [],
  pathCMD: '',
  pathPS: '',
  fetchListing: false,
  updating: false,
  fetchList() {
    if (this.fetchListing) {
      return
    }
    this.fetchListing = true
    IPC.send('app-fork:tools', 'envPathList').then((key: any, res: any) => {
      IPC.off(key)
      this.fetchListing = false
      if (res?.code === 0) {
        const list: any = reactive(res?.data ?? [])
        this.list.splice(0)
        this.list.push(...list)
        this.listBack = reactive(JSON.parse(JSON.stringify(list)))
      } else {
        MessageError(res?.msg ?? I18nT('base.fail'))
      }
      this.updating = false
    })
  },
  updatePath(arr: string[]) {
    if (this.updating) {
      return
    }
    this.updating = true
    IPC.send('app-fork:tools', 'envPathUpdate', JSON.parse(JSON.stringify(arr))).then(
      (key: any, res: any) => {
        IPC.off(key)
        if (res?.code === 0) {
          this.fetchList()
        } else {
          MessageError(res?.msg ?? I18nT('base.fail'))
        }
      }
    )
  },
  rebackPath() {
    this.list.splice(0)
    this.list.push(...this.listBack)
  },
  savePath() {
    const list = this.list.map((p) => p.path)
    this.updatePath(list)
  }
})
