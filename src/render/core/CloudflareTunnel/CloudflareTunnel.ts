import { CloudflareTunnelDnsRecord } from '@/core/CloudflareTunnel/type'
import { I18nT } from '@lang/index'
import { MessageError } from '@/util/Element'
import { md5 } from '@/util/Index'
import CloudflareTunnelStore from '@/core/CloudflareTunnel/CloudflareTunnelStore'
import { forkTerminalRequest, isPositiveHostPid } from '@/util/ForkTerminalRequest'
import { beginServiceStatusPending, noteServiceStatusRevision } from '@/util/mcpServiceStatus'

// 请求属于跨页面存活的实例；WeakMap 避免 Promise 被 JSON 序列化并发送到 fork/持久化。
const operations = new WeakMap<object, { command: string; promise: Promise<boolean> }>()

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
    let snapshot: string
    try {
      snapshot = JSON.stringify(this)
    } catch (error) {
      return Promise.reject(error)
    }
    return forkTerminalRequest(
      'app-fork:cloudflare-tunnel',
      ['fetchTunnel', JSON.parse(snapshot)],
      I18nT('setup.windowsPrivilege.timeout')
    ).then((res: any) => {
      if (res?.code === 0 && res?.data?.tunnelId && res?.data?.tunnelToken) {
        this.tunnelId = res.data.tunnelId
        this.tunnelToken = res.data.tunnelToken
        this.tunnelName = res.data.tunnelName
        return true
      }
      throw new Error(res?.msg ?? I18nT('base.fail'))
    })
  }

  /** 单例实例拥有完整请求生命周期；重复点击共享结果，冲突命令不发送第二份 IPC。 */
  private operate(command: string, action: () => Promise<void>): Promise<boolean> {
    const current = operations.get(this)
    if (current) return current.command === command ? current.promise : Promise.resolve(false)
    this.running = true
    const promise = Promise.resolve()
      .then(action)
      .then(() => true)
      .catch((error) => {
        // 失败只结束操作，不推断进程已退出；按钮调用不会产生未处理 rejection。
        MessageError(error.message || I18nT('base.fail'))
        return false
      })
      .finally(() => {
        this.running = false
        operations.delete(this)
      })
    operations.set(this, { command, promise })
    return promise
  }

  /** 进度不移除监听；超时表示未知结果，保留原 PID 并允许以后重新查询/停止。 */
  private request(command: string): Promise<any> {
    const finishPending = beginServiceStatusPending('cloudflare-tunnel')
    let snapshot: string
    try {
      snapshot = JSON.stringify(this)
    } catch (error) {
      finishPending()
      return Promise.reject(error)
    }
    return forkTerminalRequest(
      'app-fork:cloudflare-tunnel',
      [command, JSON.parse(snapshot)],
      I18nT('setup.windowsPrivilege.timeout')
    )
      .then((res: any) => {
        noteServiceStatusRevision('cloudflare-tunnel', res?.serviceStatusRevision)
        if (res?.code === 0) return res.data
        throw new Error(res?.msg || I18nT('base.fail'))
      })
      .finally(finishPending)
  }

  private async startInternal() {
    if (this.run && this.pid) return
    const data = await this.request('start')
    const pid = data?.['APP-Service-Start-PID']
    if (!isPositiveHostPid(pid)) throw new Error(I18nT('base.fail'))
    this.pid = `${pid}`
    // 只在成功终态提交新身份；保存函数沿用既有模块 Storage 机制。
    if (data?.tunnelId) this.tunnelId = data.tunnelId
    if (data?.tunnelToken) this.tunnelToken = data.tunnelToken
    if (data?.tunnelId || data?.tunnelToken) CloudflareTunnelStore.save()
    this.run = true
  }

  private async stopInternal() {
    // 与应用退出使用同一 stopService；main 恢复运行登记中的 PID/程序路径快照。
    await this.request('stopService')
    // fork 的失败/取消已经 reject，只有实际成功才能清除运行状态。
    this.pid = ''
    this.run = false
  }

  start(): Promise<boolean> {
    return this.operate('start', () => this.startInternal())
  }

  stop(): Promise<boolean> {
    return this.operate('stop', () => this.stopInternal())
  }

  restart(): Promise<boolean> {
    // 整次重启共享一次互斥；内部步骤不用公共入口，避免自己与自己冲突。
    return this.operate('restart', async () => {
      await this.stopInternal()
      await this.startInternal()
    })
  }
}
