import { defineStore } from 'pinia'
import IPC from '@/util/IPC'
import { ip, type NetworkInterfaceInfo } from '@/util/NodeFn'

export interface FtpItem {
  user: string
  pass: string
  dir: string
  disabled: boolean
  mark: string
}

interface State {
  running: boolean
  ip: string
  ipList: NetworkInterfaceInfo[]
  selectedIp: string
  fetching: boolean
  allFtp: Array<FtpItem>
  port: number
}

const state: State = {
  running: false,
  ip: '',
  ipList: [],
  selectedIp: '',
  fetching: false,
  allFtp: [],
  port: 0
}

export const FtpStore = defineStore('ftp-srv', {
  state: (): State => state,
  getters: {},
  actions: {
    getIP() {
      // 获取所有可用IP列表，让用户选择
      ip.addressList().then((list) => {
        this.ipList = list
        // 优先选择非虚拟网卡的IP
        const physicalIp = list.find((item) => !item.isVirtual)
        if (physicalIp) {
          this.ip = physicalIp.ip
          this.selectedIp = physicalIp.ip
        } else if (list.length > 0) {
          this.ip = list[0].ip
          this.selectedIp = list[0].ip
        }
      })
    },
    setSelectedIp(ip: string) {
      this.selectedIp = ip
      this.ip = ip
    },
    getPort() {
      IPC.send('app-fork:ftp-srv', 'getPort').then((key: string, res?: any) => {
        IPC.off(key)
        this.port = res?.data
      })
    },
    getAllFtp() {
      return new Promise((resolve) => {
        IPC.send('app-fork:ftp-srv', 'getAllFtp').then((key: string, res?: any) => {
          IPC.off(key)
          this.allFtp.splice(0)
          const arr = res?.data ?? []
          this.allFtp.push(...arr)
          resolve(true)
        })
      })
    },
    start(): Promise<string | boolean> {
      return new Promise((resolve) => {
        if (this.running) {
          resolve(true)
          return
        }
        this.fetching = true
        IPC.send('app-fork:ftp-srv', 'startService', { version: '1.0', typeFlag: 'ftp-srv' }).then(
          (key: string, res?: any) => {
            IPC.off(key)
            this.fetching = false
            this.running = res?.data === true
            if (res?.code === 0) {
              resolve(true)
            } else {
              resolve(res?.msg ?? new Error('Ftp start fail!'))
            }
          }
        )
      })
    },
    stop(): Promise<string | boolean> {
      return new Promise((resolve) => {
        if (!this.running) {
          resolve(true)
          return
        }
        this.fetching = true
        IPC.send('app-fork:ftp-srv', 'stopService', { version: '1.0' }).then(
          (key: string, res?: any) => {
            IPC.off(key)
            this.fetching = false
            this.running = false
            if (res?.code === 0) {
              resolve(true)
            } else {
              resolve(res?.msg ?? new Error('Ftp start fail!'))
            }
          }
        )
      })
    },
    reStart(): Promise<string | boolean> {
      return new Promise(async (resolve) => {
        await this.stop()
        await this.start()
        resolve(true)
      })
    }
  }
})
