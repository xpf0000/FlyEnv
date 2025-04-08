import { reactive } from 'vue'
import IPC from '@/util/IPC'
import { MessageError } from '@/util/Element'
import { I18nT } from '@lang/index'

type RequestTimeItem = {
  Metric: string
  Value: string | number
}

type RequestTimeSetup = {
  list: RequestTimeItem[]
  url: string
  fetching: boolean
  doFetch: () => void
}

export const Setup: RequestTimeSetup = reactive({
  list: [],
  url: '',
  fetching: false,
  doFetch() {
    const url = this.url.trim()
    if (this.fetching || !url) {
      return
    }
    this.fetching = true
    this.list.splice(0)
    IPC.send('app-fork:tools', 'requestTimeFetch', url).then((key: any, res: any) => {
      IPC.off(key)
      this.fetching = false
      if (res?.code === 0) {
        const list: any = reactive(res?.data ?? [])
        this.list.splice(0)
        this.list.push(...list)
      } else {
        MessageError(res?.msg ?? I18nT('base.fail'))
      }
    })
  }
} as RequestTimeSetup)
