import { reactive } from 'vue'
import IPC from '@/util/IPC'
import { MessageError } from '@/util/Element'
import { I18nT } from '@shared/lang'

type ConnentType = {
  user: string
  password: string
  host?: string
}

type CodeMakeType = {
  isConnent: boolean
  databases: string[]
  connent: (opt: ConnentType) => void
}

export const CodeMake: CodeMakeType = reactive({
  isConnent: false,
  databases: [],
  connent(opt: ConnentType) {
    const data = { ...opt }
    if (!data.host) {
      delete data.host
    }
    IPC.send('app-fork:codemake', 'connent', data).then((key: string, res: any) => {
      IPC.off(key)
      if (res.code === 0) {
        this.databases = res?.data ?? []
        this.isConnent = true
      } else {
        MessageError(res?.msg ?? I18nT('codemake.connentFail'))
        this.isConnent = false
      }
    })
  }
}) as any
