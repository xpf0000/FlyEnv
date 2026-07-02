import { Base } from '../Base'
import { ForkPromise } from '@shared/ForkPromise'
import type { SoftInstalled } from '@shared/app'
import { CloudflareTunnel } from './CloudflareTunnel'
import { join } from 'path'
import { readdirSync } from 'fs'

class CloudflareTunnelBase extends Base {
  constructor() {
    super()
    this.type = 'cloudflare-tunnel'
  }

  fetchAllZone(item: CloudflareTunnel) {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const model = new CloudflareTunnel()
        Object.assign(model, item)
        const list = await model.fetchAllZone()
        resolve(list)
      } catch (e) {
        reject(e)
      }
    })
  }

  fetchTunnel(item: CloudflareTunnel) {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const model = new CloudflareTunnel()
        Object.assign(model, item)
        await model.fetchTunnel()
        resolve(JSON.parse(JSON.stringify(model)))
      } catch (e) {
        reject(e)
      }
    })
  }

  start(item: CloudflareTunnel) {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const model = new CloudflareTunnel()
        Object.assign(model, item)
        const res = await model.start()
        await this.saveAppPid(model.pid).catch((e) => {
          console.error('CloudflareTunnelBase save app pid error', e)
        })
        const json = JSON.parse(JSON.stringify(res))
        json['APP-Service-Start-PID'] = model.pid
        resolve(json)
      } catch (e) {
        reject(e)
      }
    })
  }

  stop(item: CloudflareTunnel) {
    return new ForkPromise(async (resolve) => {
      try {
        const model = new CloudflareTunnel()
        Object.assign(model, item)
        await model.stop()
      } catch (e) {
        console.log('CloudflareTunnelBase stop error', e)
      }
      resolve(true)
    })
  }

  getConfigFiles(_version?: SoftInstalled): Array<{ name: string; path: string }> {
    // Cloudflare Tunnel 通过 Cloudflare API 管理配置，无本地配置文件
    return []
  }

  getLogFiles(_version?: SoftInstalled): Array<{ name: string; path: string }> {
    // 日志文件按隧道实例 id 命名，动态扫描 cloudflare-tunnel 目录
    const baseDir = global.Server.BaseDir ? join(global.Server.BaseDir, 'cloudflare-tunnel') : ''
    if (!baseDir) {
      return []
    }
    try {
      const files = readdirSync(baseDir)
      return files
        .filter((f) => f.endsWith('-out.log') || f.endsWith('-error.log'))
        .map((f) => {
          const id = f.replace(/-(out|error)\.log$/, '')
          const name = f.endsWith('-error.log') ? `error-${id}` : `out-${id}`
          return { name, path: join(baseDir, f) }
        })
    } catch {
      return []
    }
  }
}
export default new CloudflareTunnelBase()
