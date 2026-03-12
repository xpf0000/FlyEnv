import { defineStore } from 'pinia'
import IPC from '@/util/IPC'
import { computed, reactive, watch } from 'vue'
import { MessageError, MessageSuccess } from '@/util/Element'
import { I18nT } from '@lang/index'
import { ip, type NetworkInterfaceInfo } from '@/util/NodeFn'
import { AppStore } from '@/store/app'

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
let DNSAppHostWatcher: any
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
    initWatchAppHost() {
      const appStore = AppStore()
      const localHosts = computed(() => {
        const all: Set<string> = new Set()
        appStore.hosts.forEach((host) => {
          all.add(host.name)
          const alias = host.alias.split('\n').filter((n) => {
            return n && n.trim().length > 0
          })
          for (const a of alias) {
            all.add(a)
          }
        })
        return JSON.stringify(Array.from(all))
      })
      if (DNSAppHostWatcher) {
        DNSAppHostWatcher()
      }
      DNSAppHostWatcher = watch(
        localHosts,
        (v) => {
          IPC.send('app-fork:dns', 'initAppHosts', JSON.parse(v)).then((key: string) => {
            IPC.off(key)
          })
        },
        {
          immediate: true
        }
      )
    },
    deinitWatchAppHost() {
      if (DNSAppHostWatcher) {
        DNSAppHostWatcher()
      }
      DNSAppHostWatcher = null
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
          this.deinitWatchAppHost()
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
            this.initWatchAppHost()
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
