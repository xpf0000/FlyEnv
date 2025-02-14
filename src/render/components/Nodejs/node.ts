import { defineStore } from 'pinia'
import IPC from '@/util/IPC'
import { I18nT } from '@shared/lang'
import { MessageError, MessageSuccess } from '@/util/Element'

export interface NodeJSItem {
  fetched: boolean
  local: Array<string>
  current: string
  installing: Record<string, boolean>
  switching: string
}

interface State {
  all: string[]
}

const state: State = {
  all: []
}

export const NodejsStore = defineStore('nodejs', {
  state: (): State => state,
  getters: {},
  actions: {
    fetchAll() {
      if (this.all.length > 0) {
        return
      }
      let saved: any = localStorage.getItem(`fetchVerion-nodejs-all`)
      if (saved) {
        saved = JSON.parse(saved)
        const time = Math.round(new Date().getTime() / 1000)
        if (time < saved.expire) {
          const list: string[] = saved.data
          this.all.splice(0)
          this.all.push(...list)
          return
        }
      }
      IPC.send('app-fork:node', 'allVersion').then((key: string, res: any) => {
        IPC.off(key)
        const list = res?.data?.all ?? []
        if (list.length > 0) {
          localStorage.setItem(
            `fetchVerion-nodejs-all`,
            JSON.stringify({
              expire: Math.round(new Date().getTime() / 1000) + 60 * 60,
              data: list
            })
          )
        }
        this.all.splice(0)
        this.all.push(...list)
      })
    },
  }
})
