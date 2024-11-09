import { defineStore } from 'pinia'
import type { MysqlGroupItem } from '@shared/app'
import { waitTime } from '@web/fn'

interface State {
  inited: boolean
  all: Array<MysqlGroupItem>
}

const state: State = {
  inited: false,
  all: []
}

export const MysqlStore = defineStore('mysqlGroup', {
  state: (): State => state,
  getters: {},
  actions: {
    async init() {},
    async save() {},
    start(item: MysqlGroupItem): Promise<true | string> {
      return new Promise((resolve) => {
        item.version.fetching = true
        waitTime().then(() => {
          item.version.running = true
          item.version.fetching = false
          resolve(true)
        })
      })
    },
    stop(item: MysqlGroupItem): Promise<true | string> {
      return new Promise((resolve) => {
        item.version.fetching = true
        waitTime().then(() => {
          item.version.running = false
          item.version.fetching = false
          resolve(true)
        })
      })
    },
    groupStart(): Promise<true | string> {
      return new Promise(async (resolve) => {
        await this.init()
        if (this.all.length === 0) {
          resolve(true)
          return
        }
        const err: string[] = []
        const all: Array<Promise<boolean | string>> = []
        this.all.forEach((a) => {
          all.push(this.start(a))
        })
        Promise.all(all).then((res) => {
          res.forEach((r) => {
            if (typeof r === 'string') {
              err.push(r)
            }
          })
          resolve(err.length === 0 ? true : err.join('\n'))
        })
      })
    },
    groupStop(): Promise<true | string> {
      return new Promise((resolve) => {
        if (this.all.length === 0) {
          resolve(true)
          return
        }
        const err: string[] = []
        const all: Array<Promise<boolean | string>> = []
        this.all.forEach((a) => {
          all.push(this.stop(a))
        })
        Promise.all(all).then((res) => {
          res.forEach((r) => {
            if (typeof r === 'string') {
              err.push(r)
            }
          })
          resolve(err.length === 0 ? true : err.join('\n'))
        })
      })
    }
  }
})
