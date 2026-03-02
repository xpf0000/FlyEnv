import axios, { AxiosInstance } from 'axios'
import crypto from 'crypto'
import { join } from 'path'
import { mkdirp, remove, writeFile } from '../../Fn'
import { ProcessKill } from '@shared/Process'
import type { CloudflareTunnelDnsRecord } from '@/core/CloudflareTunnel/type'
import { spawn } from 'node:child_process'
import { openSync, closeSync } from 'node:fs'
import { dirname } from 'node:path'

export class CloudflareTunnel {
  id: string = ''
  apiToken: string = ''
  accountId: string = ''
  cloudflaredBin: string = ''

  tunnelName: string = ''
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
    this.tunnelName = tunnelName
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
    const ingressRules: any[] = this.dns.map((record) => {
      const protocol = record.protocol || 'http'
      return {
        hostname: `${record.subdomain}.${record.zoneName}`,
        service: `${protocol}://${record.localService}`,
        originRequest: {
          httpHostHeader: record.localService
        }
      }
    })

    // Cloudflare 强制要求必须以 404 兜底规则结尾
    ingressRules.push({ service: 'http_status:404' })

    await cfClient.put(`/accounts/${this.accountId}/cfd_tunnel/${this.tunnelId}/configurations`, {
      config: {
        ingress: ingressRules
      }
    })
    console.log(`✅ 路由配置同步完成，共 ${this.dns.length} 条转发规则。`)
  }

  private async startCloudflared(token: string): Promise<{ 'APP-Service-Start-PID': string }> {
    const baseDir = join(global.Server.BaseDir!, 'cloudflare-tunnel')
    await mkdirp(baseDir)

    const outLog = join(baseDir, `${this.id}-out.log`)
    const errLog = join(baseDir, `${this.id}-error.log`)
    const pidPath = join(baseDir, `${this.id}.pid`)

    await remove(outLog)
    await remove(errLog)
    await remove(pidPath)

    const out = openSync(outLog, 'a')
    const err = openSync(errLog, 'a')

    const execArgs = ['tunnel', '--no-autoupdate', 'run', '--token', token]

    // 2. 启动进程
    const cp = spawn(this.cloudflaredBin, execArgs, {
      detached: true,
      stdio: ['ignore', out, err],
      cwd: dirname(this.cloudflaredBin),
      windowsHide: true // 隐藏 cmd 窗口
    })

    // 3. 立即关闭父进程中的句柄 (子进程已继承)
    closeSync(out)
    closeSync(err)

    return new Promise((resolve, reject) => {
      // 监听启动瞬间的错误（如文件路径不存在、权限不足）
      cp.on('error', (err) => {
        console.error('Cloudflared 无法启动:', err)
        reject(new Error(`无法执行二进制文件: ${err.message}`))
      })

      let timer: NodeJS.Timeout | undefined = undefined

      // 关键：检测启动后的早期崩溃（例如 Token 错误导致 1-2 秒内退出）
      const startupExitHandler = (code: number) => {
        clearTimeout(timer)
        reject(new Error(`隧道启动后意外退出，代码: ${code}。请检查错误日志: ${errLog}`))
      }
      cp.on('exit', startupExitHandler)

      // 如果 2 秒内没退出，我们认为启动基本成功
      timer = setTimeout(async () => {
        cp.off('exit', startupExitHandler) // 移除早期退出监听

        if (cp.pid) {
          const pid = `${cp.pid}`
          await writeFile(pidPath, pid)
          cp.unref() // 让子进程独立运行，不挂钩主进程
          resolve({ 'APP-Service-Start-PID': pid })
        }
      }, 2000)
    })
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
      return this
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
