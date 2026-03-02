import { defineStore } from 'pinia'
import IPC from '@/util/IPC'
import { reactive } from 'vue'
import { MessageError, MessageSuccess } from '@/util/Element'
import { I18nT } from '@lang/index'
import { ip, type NetworkInterfaceInfo } from '@/util/NodeFn'

export interface DNSLogItem {
  host: string
  ip: string
  ttl: number
}

interface State {
  running: boolean
  ip: string
  ipList: NetworkInterfaceInfo[]
  selectedIp: string
  fetching: boolean
  log: Array<DNSLogItem>
  inited: boolean
}

const state: State = {
  running: false,
  ip: '',
  ipList: [],
  selectedIp: '',
  fetching: false,
  log: [],
  inited: false
}

export const DnsStore = defineStore('dns', {
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
    init() {
      if (this.inited) {
        return
      }
      this.inited = true
      IPC.send('app-fork:dns', 'initConfig').then((key: string) => {
        IPC.off(key)
      })
      IPC.on('App_DNS_Log').then((key: string, res: DNSLogItem) => {
        console.log('App_DNS_Log: ', res)
        this.log.unshift(reactive(res))
        this.log.splice(1000)
      })
    },
    deinit() {
      IPC.off('App_DNS_Log')
    },
    dnsStop(): Promise<boolean> {
      return new Promise((resolve) => {
        if (!this.running) {
          resolve(true)
          return
        }
        this.fetching = true
        IPC.send('app-fork:dns', 'stopService').then((key: string) => {
          IPC.off(key)
          this.fetching = false
          this.running = false
          MessageSuccess(I18nT('base.success'))
          resolve(true)
        })
      })
    },
    dnsStart(): Promise<boolean> {
      return new Promise((resolve, reject) => {
        if (this.running) {
          resolve(true)
          return
        }
        this.fetching = true
        IPC.send('app-fork:dns', 'startService').then((key: string, res: any) => {
          IPC.off(key)
          this.fetching = false
          console.log('dns res: ', res)
          if (res?.code === 0) {
            this.running = true
            MessageSuccess(I18nT('base.success'))
            resolve(true)
            return
          }
          MessageError(res?.msg ?? I18nT('base.fail'))
          reject(new Error('fail'))
        })
      })
    },
    dnsRestart() {
      this.dnsStop()
        .then(() => this.dnsStart())
        .catch()
    }
  }
})
