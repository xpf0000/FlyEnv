import IPC from '@/util/IPC'
import { ZoneType } from '@/core/CloudflareTunnel/type'
import { I18nT } from '@lang/index'

export class CloudflareTunnel {
  id: string = ''
  apiToken: string = ''
  accountId: string = ''
  subdomain: string = ''
  localService: string = ''

  pid: string = ''
  run: boolean = false
  running: boolean = false

  constructor(obj: any) {
    Object.assign(this, obj)
    this.pid = ''
    this.run = false
    this.running = false
  }

  /**
   * 获取所有的Zone
   */
  fetchAllZone(): Promise<ZoneType> {
    return new Promise((resolve) => {
      IPC.send('app-fork:cloudflare-tunnel', 'fetchAllZone').then((key: string, res: any) => {
        IPC.off(key)
        resolve(res?.data ?? [])
      })
    })
  }

  start(): Promise<string | boolean> {
    return new Promise((resolve) => {
      this.running = true
      IPC.send('app-fork:cloudflare-tunnel', 'start', JSON.parse(JSON.stringify(this))).then(
        (key: string, res: any) => {
          IPC.off(key)
          if (res?.code === 0) {
            this.pid = res?.data?.pid ?? ''
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
}
