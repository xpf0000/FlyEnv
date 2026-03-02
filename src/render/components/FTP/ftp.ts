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

export const FtpStore = defineStore('pure-ftpd', {
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
      IPC.send('app-fork:pure-ftpd', 'getPort').then((key: string, res?: any) => {
        IPC.off(key)
        this.port = res?.data
      })
    },
    getAllFtp() {
      return new Promise((resolve) => {
        IPC.send('app-fork:pure-ftpd', 'getAllFtp').then((key: string, res?: any) => {
          IPC.off(key)
          this.allFtp.splice(0)
          const arr = res?.data ?? []
          this.allFtp.push(...arr)
          resolve(true)
        })
      })
    }
  }
})
