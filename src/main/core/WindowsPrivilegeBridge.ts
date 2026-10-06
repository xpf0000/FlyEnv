import { AppHelperError } from '@shared/WindowsHelperState'
import type { WindowsPrivilegeCoordinator } from './WindowsPrivilegeCoordinator'
import { sanitizeWindowsPrivilegeReason } from '@shared/WindowsPrivilegeReason'

/** 主进程与可信 UtilityProcess 的请求桥；去重和租约清理都按进程实例隔离。 */
export class WindowsPrivilegeBridge {
  private pending = new WeakMap<object, Set<string>>()
  // 每个 owner 最多缓存 128 份终态，重复 IPC 重放结果而非重新安装/重新排租约。
  private completed = new WeakMap<object, Map<string, unknown>>()
  constructor(
    private readonly coordinator: WindowsPrivilegeCoordinator,
    private readonly ensureHelper?: (interactive: boolean) => Promise<void>
  ) {}

  handle(message: any, owner: object, reply: (message: unknown) => void): boolean {
    // UtilityProcess 已退出或 postMessage 失败时，释放该进程的全部队列资源。
    // 通知失败不能留下一个无人能够归还的 activeLease，阻塞其他窗口/服务。
    const safeReply = (response: unknown) => {
      try {
        reply(response)
      } catch {
        this.detach(owner)
      }
    }
    if (message?.type === 'windows-privilege-release') {
      this.coordinator.release(message.lease, owner)
      return true
    }
    if (message?.type === 'windows-privilege-cancel') {
      // 不取消其他请求共享的首次选择；这份请求后续获得租约时走归还分支。
      this.pending.get(owner)?.delete(message.requestId)
      return true
    }
    if (message?.type !== 'windows-privilege-request') return false
    if (typeof message.requestId !== 'string' || message.requestId.length > 128) return true
    const completed = this.completed.get(owner) ?? new Map<string, unknown>()
    this.completed.set(owner, completed)
    if (completed.has(message.requestId)) {
      safeReply(completed.get(message.requestId))
      return true
    }
    const finish = (response: unknown) => {
      completed.set(message.requestId, response)
      if (completed.size > 128) completed.delete(completed.keys().next().value!)
      safeReply(response)
    }
    const pending = this.pending.get(owner) ?? new Set<string>()
    this.pending.set(owner, pending)
    if (pending.has(message.requestId)) return true
    pending.add(message.requestId)
    const action =
      message.action === 'acquire'
        ? this.coordinator.acquire(owner)
        : message.action === 'resolve' && typeof message.data?.operation === 'string'
          ? this.coordinator
              .resolve({
                operation: message.data.operation.slice(0, 128),
                interactive: message.data.interactive === true,
                // 原因只供 UI 展示；限制 IPC 条目/长度，不能据此增加执行权限。
                reason: sanitizeWindowsPrivilegeReason(message.data.reason)
              })
              .then(async (method) => {
                if (!pending.has(message.requestId))
                  throw new Error('Authorization request expired')
                // helper/ready 才允许主进程检查/安装；普通方式解析不会触碰常驻程序。
                if (method === 'helper' && message.data.operation === 'helper/ready')
                  await this.ensureHelper?.(message.data.interactive === true)
                return method
              })
          : Promise.reject(new Error('Invalid Windows authorization request'))
    void action
      .then((data) => {
        if (!pending.delete(message.requestId)) {
          // fork 超时或退出后，不能把无人接收的 lease 留在队列头。
          if (message.action === 'acquire') this.coordinator.release(data, owner)
          return
        }
        finish({ type: 'windows-privilege-response', requestId: message.requestId, data })
      })
      .catch((error) => {
        if (!pending.delete(message.requestId)) return
        finish({
          type: 'windows-privilege-response',
          requestId: message.requestId,
          error: {
            code: error instanceof AppHelperError ? error.code : 'helper_execution_failed',
            message: error instanceof Error ? error.message : String(error)
          }
        })
      })
    return true
  }
  /** UtilityProcess 退出/发送失败的终态清理，不影响其他 fork 的等待请求。 */
  detach(owner: object) {
    this.pending.get(owner)?.clear()
    this.pending.delete(owner)
    this.completed.delete(owner)
    this.coordinator.releaseOwner(owner)
  }
}
