import type { SoftInstalled } from '@shared/app'
import { AppModuleEnum } from '@/core/type'
import type { ForkManager } from './ForkManager'

const ALL_FLAGS: string[] = Object.values(AppModuleEnum)

function callFork(
  forkManager: ForkManager,
  module: string,
  fn: string,
  ...args: any[]
): Promise<any> {
  return new Promise((resolve, reject) => {
    let settled = false
    forkManager
      .send(module, fn, ...args)
      .on(() => {
        // 进度消息忽略
      })
      .then((res: any) => {
        if (settled) return
        settled = true
        if (res?.code === 0) {
          resolve(res?.data)
        } else {
          reject(new Error(typeof res?.msg === 'string' ? res.msg : 'fork call failed'))
        }
      })
      .catch((e: any) => {
        if (settled) return
        settled = true
        reject(e instanceof Error ? e : new Error(`${e}`))
      })
  })
}

/**
 * ServiceVersionManager —— 主进程缓存各服务的已安装版本。
 *
 * 设计要点：
 *   - 一次 fork 调用批量拉取多个 flag 的 allInstalledVersions，避免每个 flag 一次往返
 *   - 结果缓存在主进程内存，MCP 查询直接从缓存读
 *   - 安装/卸载后可通过 refresh(flag) 主动刷新
 *   - 单个模块报错不会阻塞其它模块（由 fork 侧 Version.allInstalledVersions 兜底）
 */
type McpNotifyPayload = { type: string; [key: string]: any }
type McpNotifyCallback = (payload: McpNotifyPayload) => void

class ServiceVersionManager {
  private forkManager?: ForkManager
  private cache: Record<string, SoftInstalled[]> = {}
  private notifyCallbacks: McpNotifyCallback[] = []

  setForkManager(fm: ForkManager) {
    this.forkManager = fm
  }

  /** 注册 MCP 需要向渲染进程发送通知的回调 */
  onMcpNotify(cb: McpNotifyCallback) {
    this.notifyCallbacks.push(cb)
  }

  /** MCP 侧通知渲染进程（例如安装完成需要刷新已安装版本） */
  notifyRenderer(payload: McpNotifyPayload) {
    for (const cb of this.notifyCallbacks) {
      try {
        cb(payload)
      } catch (e) {
        console.log('ServiceVersionManager notifyRenderer error: ', e)
      }
    }
  }

  /** 当前完整缓存（浅拷贝） */
  getCache(): Record<string, SoftInstalled[]> {
    return { ...this.cache }
  }

  /** 当前缓存里已有的 flag 列表 */
  getCacheKeys(): string[] {
    return Object.keys(this.cache)
  }

  /** 把已有数据（如前端 IPC 返回的结果）直接写入缓存 */
  updateCache(data: Record<string, SoftInstalled[]>) {
    if (!data || typeof data !== 'object') return
    for (const f in data) {
      const arr = data[f]
      this.cache[f] = Array.isArray(arr) ? arr : []
    }
  }

  /** 读取某个 flag 的已安装版本；缓存缺失时触发一次刷新 */
  async getVersions(flag: string): Promise<SoftInstalled[]> {
    if (this.cache[flag]) {
      return this.cache[flag]!
    }
    await this.refresh([flag])
    return this.cache[flag] ?? []
  }

  /** 批量读取；优先命中缓存，缺失的 flag 一起刷新 */
  async getVersionsBatch(flags: string[]): Promise<Record<string, SoftInstalled[]>> {
    const missing = flags.filter((f) => !this.cache[f])
    if (missing.length) {
      await this.refresh(missing)
    }
    const out: Record<string, SoftInstalled[]> = {}
    for (const f of flags) {
      out[f] = this.cache[f] ?? []
    }
    return out
  }

  /**
   * 刷新指定 flag 的已安装版本；不传 flags 时刷新全部模块。
   * 不再做全局锁合并：某个 flag 卡住不应阻塞其它 flag 的查询。
   */
  async refresh(flags?: string[]): Promise<Record<string, SoftInstalled[]>> {
    const fm = this.forkManager
    if (!fm) {
      throw new Error('ServiceVersionManager: forkManager not set')
    }
    const targetFlags = flags && flags.length ? flags : ALL_FLAGS
    const data = await callFork(fm, 'version', 'allInstalledVersions', targetFlags, {})
    if (data && typeof data === 'object') {
      for (const f of targetFlags) {
        const arr = data[f]
        this.cache[f] = Array.isArray(arr) ? arr : []
      }
    }
    return { ...this.cache }
  }
}

export default new ServiceVersionManager()
