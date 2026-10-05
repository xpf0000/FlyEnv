import { randomUUID } from 'node:crypto'
import { AppHelperError, type WindowsElevationMethod } from '@shared/WindowsHelperState'
import {
  WINDOWS_ELEVATION_CHOICE_VERSION,
  type WindowsPrivilegeRequest,
  type WindowsPrivilegeSnapshot
} from '@shared/WindowsPrivilege'
import {
  sanitizeWindowsPrivilegeReason,
  type WindowsPrivilegeChoice,
  type WindowsPrivilegeReason
} from '@shared/WindowsPrivilegeReason'

type Choice = WindowsPrivilegeChoice
type Deps = {
  read(): { method?: WindowsElevationMethod; choiceVersion?: number }
  save(method: WindowsElevationMethod, version: number): void
  publish(snapshot: WindowsPrivilegeSnapshot): void
  prompt(choice: Choice): boolean
  dismiss?(id: string): void
  elevated(): Promise<boolean>
  onNotificationError?(error: unknown): void
}

/**
 * 主进程唯一的权限协调器。配置保存、首次选择和执行租约都在此串联，
 * renderer/fork 只发送意图，避免多个服务各自弹选择框或同时启动 UAC。
 * elevated 仅供界面展示；真正执行时仍由执行进程检查自己的有效令牌。
 */
export class WindowsPrivilegeCoordinator {
  private revision = 0
  private choice?: {
    id: string
    operation: string
    /** 首次触发动作的显示快照；后续合并请求不会悄悄改掉用户正在阅读的原因。 */
    reason?: WindowsPrivilegeReason
    promise: Promise<WindowsElevationMethod>
    resolve: (method: WindowsElevationMethod) => void
    reject: (error: Error) => void
  }
  private disposed = false
  // 正常退出仍需用已保存方式清理 hosts；closing 只关闭首次选择/设置入口，
  // 不能像 dispose 一样提前删除正在执行及退出清理所需的租约。
  private closing = false
  private leases = new Map<
    string,
    { resolve: (id: string) => void; reject: (error: Error) => void; owner: object }
  >()
  private activeLease?: string

  constructor(private readonly deps: Deps) {}

  /** 读取一致的偏好和版本快照；令牌探测失败不阻止主窗口启动。 */
  async snapshot(): Promise<WindowsPrivilegeSnapshot> {
    return {
      ...this.deps.read(),
      revision: this.revision,
      elevated: await this.deps.elevated().catch(() => false)
    }
  }

  /** 窗口通知属于显示副作用，不能让已经提交的选择或取消悬空。 */
  private notify(action: () => unknown) {
    try {
      action()
    } catch (error) {
      try {
        this.deps.onNotificationError?.(error)
      } catch {
        // 日志系统异常也不能改变权限请求的终态。
      }
    }
  }

  /**
   * 只有明确点击一种方式才写入 choiceVersion。先同步提交再解除等待，
   * 防止配置保存失败被当成授权成功；旧窗口的 choiceId 不能覆盖新选择。
   */
  async select(method: unknown, choiceId?: string): Promise<WindowsPrivilegeSnapshot> {
    if (method !== 'uac' && method !== 'helper')
      throw new Error('Invalid Windows authorization method')
    if (choiceId && choiceId !== this.choice?.id)
      throw new Error('Authorization choice has expired')
    if (this.disposed || this.closing) throw new Error('Application is closing')
    // 两个字段原子保存；失败时保留原来的选择窗口和所有等待请求。
    this.deps.save(method, WINDOWS_ELEVATION_CHOICE_VERSION)
    this.revision += 1
    const pending = this.choice
    this.choice = undefined
    if (pending) {
      // 终态先于异步令牌读取和窗口通知；退出/通知异常不能遗失这批等待者。
      pending.resolve(method)
      this.notify(() => this.deps.dismiss?.(pending.id))
    }
    const snapshot = await this.snapshot()
    if (!this.disposed) this.notify(() => this.deps.publish(snapshot))
    return snapshot
  }

  /** 取消只结束当前这批请求，既不保存默认值，也不自动改成另一种方式。 */
  cancel(choiceId?: string) {
    if (!this.choice || (choiceId && choiceId !== this.choice.id)) return
    const pending = this.choice
    this.choice = undefined
    pending.reject(
      new AppHelperError(
        'windows_choice_cancelled',
        'Windows authorization selection was cancelled'
      )
    )
    this.notify(() => this.deps.dismiss?.(pending.id))
  }

  /** renderer 尚未就绪时保留选择，窗口完成初始化后再次调用呈现。 */
  present() {
    if (this.closing || this.disposed) return
    const choice = this.choice
    if (choice) {
      this.notify(() =>
        this.deps.prompt({
          id: choice.id,
          operation: choice.operation,
          ...(choice.reason ? { reason: choice.reason } : {})
        })
      )
    }
  }

  /**
   * 后台请求只能使用已明确选择的 Helper；UAC/首次选择必须来自交互请求。
   * 多个真实权限失败合并为一个窗口；阅读/离开期间不自动取消，等待用户决定。
   * 选择、取消或 dispose 才结束这批请求；实际执行和租约的超时由各自所有者负责。
   */
  resolve(request: WindowsPrivilegeRequest): Promise<WindowsElevationMethod> {
    if (this.disposed) return Promise.reject(new Error('Application is closing'))
    const saved = this.deps.read()
    if (!request.interactive) {
      if (saved.choiceVersion === WINDOWS_ELEVATION_CHOICE_VERSION && saved.method === 'helper')
        return Promise.resolve('helper')
      return Promise.reject(
        new AppHelperError(
          'windows_authorization_required',
          'This operation requires interactive Windows authorization'
        )
      )
    }
    if (
      saved.choiceVersion === WINDOWS_ELEVATION_CHOICE_VERSION &&
      (saved.method === 'helper' || saved.method === 'uac')
    ) {
      return Promise.resolve(saved.method)
    }
    // 退出清理可以使用已确认的方式，但不能让尚未选择的用户在退出期间
    // 等待一个新的无限期首次弹窗。普通/管理员能完成的文件操作不经过这里。
    if (this.closing)
      return Promise.reject(
        new AppHelperError(
          'windows_authorization_required',
          'Choose a Windows authorization method before quitting'
        )
      )
    if (this.choice) return this.choice.promise
    let resolve!: (method: WindowsElevationMethod) => void
    let reject!: (error: Error) => void
    const promise = new Promise<WindowsElevationMethod>((yes, no) => {
      resolve = yes
      reject = no
    })
    const id = randomUUID()
    // main 自身的文件写入不经过 fork 桥，也必须经过同样的原因载荷校验/复制。
    this.choice = {
      id,
      operation: request.operation,
      reason: sanitizeWindowsPrivilegeReason(request.reason),
      promise,
      resolve,
      reject
    }
    this.present()
    return promise
  }

  /** FIFO 租约跨所有 fork 串行化安装、停用及权限执行；持有者必须 finally 释放。 */
  acquire(owner: object): Promise<string> {
    if (this.disposed) return Promise.reject(new Error('Application is closing'))
    const id = randomUUID()
    return new Promise((resolve, reject) => {
      this.leases.set(id, { resolve, reject, owner })
      this.nextLease()
    })
  }

  /** UUID 不是唯一保护，必须同时匹配持有此租约的 UtilityProcess/主进程对象。 */
  release(id: string, owner: object) {
    if (this.leases.get(id)?.owner !== owner) return
    this.leases.delete(id)
    if (id === this.activeLease) this.activeLease = undefined
    this.nextLease()
  }

  /**
   * 先批量移除退出者的全部租约再唤醒队列。逐个 release 会在清理过程中
   * 错误授予同一退出者的下一份租约，使已断开的请求仍进入执行阶段。
   */
  releaseOwner(owner: object) {
    for (const [id, lease] of [...this.leases]) {
      if (lease.owner === owner) {
        lease.reject(new Error('Authorization requester exited'))
        this.leases.delete(id)
        if (id === this.activeLease) this.activeLease = undefined
      }
    }
    this.nextLease()
  }

  private nextLease() {
    if (this.activeLease) return
    const next = this.leases.entries().next().value
    if (!next) return
    this.activeLease = next[0]
    next[1].resolve(next[0])
  }

  /** 退出第一阶段：结束首次选择，保留已选授权与租约直到服务/hosts 并行清理全部结束。 */
  beginShutdown() {
    this.closing = true
    this.cancel()
  }

  /** Helper 准备在退出期间只能检查已有实例，不能为清理重新弹安装或修复。 */
  isClosing() {
    return this.closing || this.disposed
  }

  /** 应用关闭使所有尚未授予的请求结束，不依赖 renderer 再返回取消消息。 */
  dispose() {
    this.disposed = true
    this.cancel()
    for (const lease of this.leases.values()) lease.reject(new Error('Application is closing'))
    this.leases.clear()
    this.activeLease = undefined
  }
}
