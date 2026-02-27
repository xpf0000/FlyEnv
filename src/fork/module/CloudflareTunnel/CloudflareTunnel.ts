import axios, { AxiosInstance } from 'axios'
import crypto from 'crypto'
import { isWindows } from '@shared/utils'
import { join } from 'path'
import { serviceStartExecCMD } from '../../util/ServiceStart.win'
import { serviceStartExec } from '../../util/ServiceStart'
import { mkdirp } from '../../Fn'
import { ProcessKill } from '@shared/Process'

export class CloudflareTunnel {
  apiToken: string = ''
  accountId: string = ''
  subdomain: string = ''
  localService: string = ''
  zoneId: string = ''
  zoneName: string = ''

  cloudflaredBin: string = ''

  pid: string = ''

  private _client!: AxiosInstance

  constructor() {}

  client() {
    if (!this._client) {
      this._client = axios.create({
        baseURL: 'https://api.cloudflare.com/client/v4',
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json'
        }
      })
    }
    return this._client
  }

  /**
   * 获取所有的Zone
   */
  async fetchAllZone() {
    console.log('正在获取您的域名列表...')
    const zonesRes = await this.client().get('/zones')
    const zones = zonesRes.data.result
    console.log('fetchAllZone: ', zones)
    return zones
  }

  private async startCloudflared(token: string) {
    const fullDomain = `${this.subdomain}.${this.zoneName}`
    const baseDir = join(global.Server.BaseDir!, `cloudflare-tunnel`)
    await mkdirp(baseDir)
    const pidPath = join(global.Server.BaseDir!, `cloudflare-tunnel/${fullDomain}.pid`)
    const version: any = {
      typeFlag: 'cloudflare-tunnel',
      version: fullDomain
    }
    const execEnv = ` `
    const execArgs = `tunnel --no-autoupdate run --token ${token}`

    const on = () => {}

    if (isWindows()) {
      return await serviceStartExecCMD({
        version,
        pidPath,
        baseDir,
        bin: this.cloudflaredBin,
        execArgs,
        execEnv,
        on,
        maxTime: 20,
        timeToWait: 1000,
        checkPidFile: false
      })
    } else {
      return await serviceStartExec({
        version,
        pidPath,
        baseDir,
        bin: this.cloudflaredBin,
        execArgs,
        execEnv,
        on,
        maxTime: 20,
        timeToWait: 1000,
        checkPidFile: false
      })
    }
  }

  async start() {
    const cfClient = this.client()

    // --- 2. 创建 Cloudflare Tunnel ---
    console.log('正在创建隧道...')
    const tunnelSecret = crypto.randomBytes(32).toString('base64')
    const tunnelName = `flyenv-${Date.now()}`

    const tunnelRes = await cfClient.post(`/accounts/${this.accountId}/cfd_tunnel`, {
      name: tunnelName,
      tunnel_secret: tunnelSecret,
      config_src: 'cloudflare' // 关键：使用云端配置模式
    })

    const { id: tunnelId, token: tunnelToken } = tunnelRes.data.result
    console.log(`隧道创建成功! ID: ${tunnelId}`)

    // --- 3. 配置 DNS CNAME 记录 ---
    console.log('正在绑定 DNS...')
    await cfClient.post(`/zones/${this.zoneId}/dns_records`, {
      type: 'CNAME',
      name: this.subdomain,
      content: `${tunnelId}.cfargotunnel.com`,
      proxied: true
    })

    const fullDomain = `${this.subdomain}.${this.zoneName}`
    // --- 4. 配置隧道路由规则 (Ingress) ---
    console.log('正在配置转发规则...')
    await cfClient.put(`/accounts/${this.accountId}/cfd_tunnel/${tunnelId}/configurations`, {
      config: {
        ingress: [
          { hostname: fullDomain, service: this.localService },
          { service: 'http_status:404' }
        ]
      }
    })

    // --- 5. 启动本地进程 ---
    console.log('--- 准备启动 cloudflared ---')
    this.pid = (await this.startCloudflared(tunnelToken))?.['APP-Service-Start-PID']
    return this.pid
  }

  async stop() {
    if (!this.pid) {
      return
    }
    try {
      await ProcessKill('-INT', [this.pid])
    } catch {}
  }
}
