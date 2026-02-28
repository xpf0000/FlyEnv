import axios, { AxiosInstance } from 'axios'
import crypto from 'crypto'
import { isWindows } from '@shared/utils'
import { join } from 'path'
import { serviceStartExecCMD } from '../../util/ServiceStart.win'
import { serviceStartExec } from '../../util/ServiceStart'
import { mkdirp } from '../../Fn'
import { ProcessKill } from '@shared/Process'
import type { CloudflareTunnelDnsRecord } from '@/core/CloudflareTunnel/type'

export class CloudflareTunnel {
  id: string = ''
  apiToken: string = ''
  accountId: string = ''
  cloudflaredBin: string = ''

  tunnelId: string = ''
  tunnelToken: string = ''

  pid: string = ''

  dns: CloudflareTunnelDnsRecord[] = []

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

  /**
   * 获取Tunnel. 查找Tunnel name为 FlyEnv-Tunnel-{md5(apiToken)} 的隧道
   * 如果找到了 更新tunnelId和tunnelToken
   * 未找到, 新建隧道
   */
  async fetchTunnel() {
    const cfClient = this.client()
    // 取 API Token 的 MD5 前 12 位作为标识，保证同一 Token 下名称固定且不泄露明文
    const tokenHash = crypto.createHash('md5').update(this.apiToken).digest('hex').substring(0, 12)
    const tunnelName = `FlyEnv-Tunnel-${tokenHash}`

    console.log(`正在查找或创建隧道: ${tunnelName}`)

    // 1. 查询是否存在同名隧道
    const searchRes = await cfClient.get(`/accounts/${this.accountId}/cfd_tunnel`, {
      params: { name: tunnelName, is_deleted: false }
    })

    const existingTunnel = searchRes.data.result?.[0]

    if (existingTunnel) {
      console.log(`✅ 找到现有隧道 ID: ${existingTunnel.id}`)
      this.tunnelId = existingTunnel.id

      // 获取现有隧道的 Token (GET /cfd_tunnel 接口本身不返回 token)
      const tokenRes = await cfClient.get(
        `/accounts/${this.accountId}/cfd_tunnel/${this.tunnelId}/token`
      )
      this.tunnelToken = tokenRes.data.result
    } else {
      console.log(`未找到现有隧道，正在新建...`)
      // 2. 不存在则创建
      const tunnelSecret = crypto.randomBytes(32).toString('base64')
      const createRes = await cfClient.post(`/accounts/${this.accountId}/cfd_tunnel`, {
        name: tunnelName,
        tunnel_secret: tunnelSecret,
        config_src: 'cloudflare' // 必须是远程配置模式
      })

      this.tunnelId = createRes.data.result.id
      this.tunnelToken = createRes.data.result.token
      console.log(`✅ 新建隧道成功 ID: ${this.tunnelId}`)
    }
  }

  /**
   * 设置DNS记录
   * 先获取解析记录
   * 如果已有记录,且记录等于当前隧道信息, 则跳过
   * 如果已有记录, 且记录不等于当前隧道信息, 则更新
   * 如果没有记录, 则添加
   */
  async initDNSRecords() {
    const cfClient = this.client()
    const targetContent = `${this.tunnelId}.cfargotunnel.com`

    for (const record of this.dns) {
      const fullDomain = `${record.subdomain}.${record.zoneName}`
      console.log(`正在检查 DNS 记录: ${fullDomain}`)

      // 1. 查询现有 CNAME 记录
      const searchRes = await cfClient.get(`/zones/${record.zoneId}/dns_records`, {
        params: { name: fullDomain, type: 'CNAME' }
      })

      const existingRecord = searchRes.data.result?.[0]

      if (existingRecord) {
        if (existingRecord.content !== targetContent) {
          console.log(`🔄 更新现有的 DNS 记录指向当前隧道...`)
          await cfClient.put(`/zones/${record.zoneId}/dns_records/${existingRecord.id}`, {
            type: 'CNAME',
            name: record.subdomain,
            content: targetContent,
            proxied: true
          })
        } else {
          console.log(`⏭️ DNS 记录已存在且指向正确，跳过。`)
        }
      } else {
        console.log(`➕ 创建全新的 DNS 记录...`)
        await cfClient.post(`/zones/${record.zoneId}/dns_records`, {
          type: 'CNAME',
          name: record.subdomain,
          content: targetContent,
          proxied: true
        })
      }
    }
  }

  /**
   * 配置转发规则
   */
  async initTunnelConfig() {
    console.log(`正在同步路由配置(Ingress Rules)...`)
    const cfClient = this.client()

    // 映射 this.dns 数组为 Cloudflare Ingress 规则
    const ingressRules: any[] = this.dns.map((record) => ({
      hostname: `${record.subdomain}.${record.zoneName}`,
      service: record.localService
    }))

    // Cloudflare 强制要求必须以 404 兜底规则结尾
    ingressRules.push({ service: 'http_status:404' })

    await cfClient.put(`/accounts/${this.accountId}/cfd_tunnel/${this.tunnelId}/configurations`, {
      config: {
        ingress: ingressRules
      }
    })
    console.log(`✅ 路由配置同步完成，共 ${this.dns.length} 条转发规则。`)
  }

  /**
   * 启动 cloudflared
   * @param token
   * @private
   */
  private async startCloudflared(token: string) {
    const baseDir = join(global.Server.BaseDir!, `cloudflare-tunnel`)
    await mkdirp(baseDir)
    const pidPath = join(global.Server.BaseDir!, `cloudflare-tunnel/${this.id}.pid`)
    const version: any = {
      typeFlag: 'cloudflare-tunnel',
      version: this.id
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

  /**
   * 启动
   */
  async start() {
    if (!this.accountId || !this.apiToken) {
      throw new Error('缺失 Cloudflare 账户 ID 或 API Token')
    }
    if (!this.dns || this.dns.length === 0) {
      throw new Error('未配置需要穿透的域名列表 (dns 数组为空)')
    }

    try {
      // 1. 获取或创建隧道
      await this.fetchTunnel()

      // 2. 检查并同步 DNS 记录
      await this.initDNSRecords()

      // 3. 将本地服务规则同步到 Cloudflare 边缘节点
      await this.initTunnelConfig()

      // 4. 启动本地守护进程
      console.log('--- 准备启动 cloudflared ---')
      const res = await this.startCloudflared(this.tunnelToken)
      this.pid = res?.['APP-Service-Start-PID']

      console.log(`🚀 穿透服务启动完毕！(PID: ${this.pid})`)
      return res
    } catch (error: any) {
      console.error('启动 Cloudflare Tunnel 失败:', error.response?.data || error.message)
      throw error
    }
  }

  /**
   * 停止
   */
  async stop() {
    if (!this.pid) {
      return
    }
    try {
      console.log(`正在终止 cloudflared 进程 (PID: ${this.pid})...`)
      await ProcessKill('-INT', [this.pid])
      this.pid = ''
      console.log('进程已终止')
    } catch (e) {
      console.error('停止 cloudflared 失败:', e)
    }
  }
}
