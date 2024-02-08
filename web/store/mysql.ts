import { defineStore } from 'pinia'
import type { MysqlGroupItem } from '@shared/app'
import { waitTime } from '@web/fn'

interface State {
  inited: boolean
  all: Array<MysqlGroupItem>
}

const state: State = {
  inited: false,
  all: [
    {
      id: 'I64R2DBT',
      version: {
        version: '8.1.12',
        bin: '/usr/local/Cellar/mysql/8.1.0/bin/mysqld_safe',
        path: '/usr/local/Cellar/mysql/8.1.0/',
        num: 81,
        enable: true,
        run: false
      },
      port: '4600',
      dataDir: '/Users/x/Library/PhpWebStudy/server/mysql/group/mysql-group-I64R2DBT'
    },
    {
      id: 'AJDTJQME',
      version: {
        version: '5.7.44',
        bin: '/usr/local/Cellar/mysql@5.7/5.7.44/bin/mysqld_safe',
        path: '/usr/local/Cellar/mysql@5.7/5.7.44/',
        num: 57,
        enable: true,
        run: true
      },
      port: '4700',
      dataDir: '/Users/x/Library/PhpWebStudy/server/mysql/group/mysql-group-AJDTJQME'
    }
  ]
}

export const MysqlStore = defineStore('mysqlGroup', {
  state: (): State => state,
  getters: {},
  actions: {
    async init() {
      if (this.inited) {
        return
      }
      this.inited = true
    },
    async save() {},
    start(item: MysqlGroupItem): Promise<true | string> {
      return new Promise(async (resolve) => {
        item.version.fetching = true
        await waitTime()
        item.version.running = true
        item.version.fetching = false
        resolve(true)
      })
    },
    stop(item: MysqlGroupItem): Promise<true | string> {
      return new Promise(async (resolve) => {
        item.version.fetching = true
        await waitTime()
        item.version.running = false
        item.version.fetching = false
        resolve(true)
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
