import { reactive } from 'vue'
import IPC from '@/util/IPC'
import { MessageError } from '@/util/Element'
import { I18nT } from '@shared/lang'

type ConnentType = {
  user: string
  password: string
  host?: string
  port?: number
}

type CodeMakeType = ConnentType & {
  isConnent: boolean
  databases: string[]
  connect: () => void
}

export const CodeMake: CodeMakeType = reactive({
  user: '',
  password: '',
  host: '127.0.0.1',
  port: 3306,
  isConnent: false,
  databases: [],
  connect() {
    let data: ConnentType = { ...this }
    if (!data.host) {
      delete data?.host
    }
    data = JSON.parse(JSON.stringify(data))
    console.log('data: ', data)
    IPC.send('app-fork:codemake', 'connect', data).then((key: string, res: any) => {
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
} as CodeMakeType)
