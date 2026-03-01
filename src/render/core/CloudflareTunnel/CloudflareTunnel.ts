import IPC from '@/util/IPC'
import { CloudflareTunnelDnsRecord } from '@/core/CloudflareTunnel/type'
import { I18nT } from '@lang/index'
import { MessageError } from '@/util/Element'
import { md5 } from '@/util/Index'

export class CloudflareTunnel {
  id: string = ''
  apiToken: string = ''
  tunnelName: string = ''
  tunnelId: string = ''
  tunnelToken: string = ''
  cloudflaredBin: string = ''
  accountId: string = ''

  dns: CloudflareTunnelDnsRecord[] = []

  pid: string = ''
  run: boolean = false
  running: boolean = false

  constructor(obj: any) {
    Object.assign(this, obj)
    this.pid = ''
    this.run = false
    this.running = false
    if (this.apiToken && !this.tunnelName) {
      this.tunnelName = `FlyEnv-Tunnel-${md5(this.apiToken).substring(0, 12)}`
    }
  }

  fetchTunnel(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      IPC.send('app-fork:cloudflare-tunnel', 'fetchTunnel', JSON.parse(JSON.stringify(this))).then(
        (key: string, res: any) => {
          IPC.off(key)
          if (res?.data?.tunnelId && res?.data?.tunnelToken) {
            this.tunnelId = res?.data?.tunnelToken
            this.tunnelToken = res?.data?.tunnelToken
            this.tunnelName = res?.data?.tunnelName
            resolve(true)
          }
          reject(new Error(res?.msg ?? I18nT('base.fail')))
        }
      )
    })
  }

  start(): Promise<string | boolean> {
    return new Promise((resolve) => {
      this.running = true
      IPC.send('app-fork:cloudflare-tunnel', 'start', JSON.parse(JSON.stringify(this))).then(
        (key: string, res: any) => {
          IPC.off(key)
          if (res?.code === 0) {
            this.pid = res?.data?.['APP-Service-Start-PID'] ?? ''
            this.run = true
            resolve(true)
          } else {
            this.run = false
            resolve(res?.msg ?? I18nT('base.fail'))
          }
          this.running = false
        }
      )
    })
  }

  stop(): Promise<boolean> {
    return new Promise((resolve) => {
      this.running = true
      IPC.send('app-fork:cloudflare-tunnel', 'stop', JSON.parse(JSON.stringify(this))).then(
        (key: string) => {
          IPC.off(key)
          this.pid = ''
          this.run = false
          this.running = false
          resolve(true)
        }
      )
    })
  }

  restart(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this.stop()
        .then(() => this.start())
        .then(() => resolve(true))
        .catch((err) => {
          MessageError(`${err}`)
          reject(err)
        })
    })
  }
}
