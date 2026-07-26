import { reactive } from 'vue'
import IPC from '@/util/IPC'
import { MessageError } from '@/util/Element'
import { I18nT } from '@lang/index'

type PathItem = {
  path: string
  raw: string
  error: boolean
}

type EnvPathListing = {
  rawPath: string
  list: PathItem[]
}

const SYSTEM_PATH_CHANGED_MESSAGE =
  'The system PATH changed outside FlyEnv. It has been reloaded; review and save again.'

const isSystemPathChangedMessage = (message: unknown): boolean =>
  typeof message === 'string' && message.includes('system_path_changed')

type SetupType = {
  list: PathItem[]
  listBack: PathItem[]
  rawPath: string
  pathCMD: string
  pathPS: string
  fetchListing: boolean
  updating: boolean
  fetchList: () => void
  updatePath: (arr: string[], expectedPath: string) => void
  rebackPath: () => void
  savePath: () => void
}

export const Setup: SetupType = reactive<SetupType>({
  list: [],
  listBack: [],
  rawPath: '',
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
        const data = res?.data as EnvPathListing
        if (typeof data?.rawPath !== 'string' || !Array.isArray(data.list)) {
          MessageError(I18nT('base.fail'))
          this.updating = false
          return
        }
        const list: any = reactive(data.list)
        this.list.splice(0)
        this.list.push(...list)
        this.listBack = reactive(JSON.parse(JSON.stringify(list)))
        this.rawPath = data.rawPath
      } else {
        MessageError(res?.msg ?? I18nT('base.fail'))
      }
      this.updating = false
    })
  },
  updatePath(arr: string[], expectedPath: string) {
    if (this.updating) {
      return
    }
    this.updating = true
    IPC.send('app-fork:tools', 'envPathUpdate', JSON.parse(JSON.stringify(arr)), expectedPath).then(
      (key: any, res: any) => {
        IPC.off(key)
        if (res?.code === 0) {
          this.fetchList()
        } else if (isSystemPathChangedMessage(res?.msg)) {
          this.fetchList()
          MessageError(SYSTEM_PATH_CHANGED_MESSAGE)
        } else {
          this.updating = false
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
    this.updatePath(list, this.rawPath)
  }
})
