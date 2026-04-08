import IPC from '@/util/IPC'
import { I18nT } from '@lang/index'
import { MessageError } from '@/util/Element'
import SlimTunnelStore from '@/core/SlimTunnel/SlimTunnelStore'

export class SlimTunnel {
  id: string = ''
  subdomain: string = ''
  port: number = 0
  password: string = ''
  ttl: string = ''

  pid: string = ''
  publicUrl: string = ''
  run: boolean = false
  running: boolean = false

  constructor(obj?: any) {
    if (obj) {
      Object.assign(this, obj)
    }
    this.pid = ''
    this.run = false
    this.running = false
    this.publicUrl = ''
  }

  start(): Promise<string | boolean> {
    return new Promise((resolve) => {
      this.running = true
      IPC.send(
        'app-fork:slim-tunnel',
        'start',
        JSON.parse(JSON.stringify({ ...this, slimBin: SlimTunnelStore.slimBin }))
      ).then((key: string, res: any) => {
        if (res?.code === 200) return // streaming line
        IPC.off(key)
        if (res?.code === 0) {
          this.pid = res?.data?.['APP-Service-Start-PID'] ?? ''
          this.publicUrl = res?.data?.publicUrl ?? ''
          this.run = true
          SlimTunnelStore.save()
          resolve(true)
        } else {
          this.run = false
          resolve(res?.msg ?? I18nT('base.fail'))
        }
        this.running = false
      })
    })
  }

  stop(): Promise<boolean> {
    return new Promise((resolve) => {
      this.running = true
      IPC.send('app-fork:slim-tunnel', 'stop', JSON.parse(JSON.stringify(this))).then(
        (key: string) => {
          IPC.off(key)
          this.pid = ''
          this.publicUrl = ''
          this.run = false
          this.running = false
          SlimTunnelStore.save()
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
