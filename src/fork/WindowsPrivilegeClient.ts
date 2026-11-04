import { randomUUID } from 'node:crypto'
import {
  AppHelperError,
  type AppHelperErrorCode,
  type WindowsElevationMethod
} from '@shared/WindowsHelperState'
import {
  applyWindowsPrivilegeSnapshot,
  type WindowsPrivilegeRequest
} from '@shared/WindowsPrivilege'

/**
 * fork 的权限 provider。每次 requestId 唯一，结果和计时器只由本客户端持有；
 * main 调度选择/租约，fork 继续持有业务 action 和进程状态。
 */
export class WindowsPrivilegeClient {
  private pending = new Map<
    string,
    {
      resolve: (data: any) => void
      reject: (error: Error) => void
      /** 选择方式需无限期等待用户；只有执行租约排队设置客户端截止时间。 */
      timer?: ReturnType<typeof setTimeout>
    }
  >()
  constructor(private readonly send: (message: unknown) => void) {}

  /**
   * resolve 包含首次选择，不能用六分钟截止时间让仍可见的弹窗对应业务先失败。
   * acquire 继续最多排队六分钟；超时发送 cancel，main 获得迟到租约时立即归还。
   * Helper 准备/实际 UAC 执行仍由既有安装器和执行器管理自己的执行超时。
   */
  private request(action: 'resolve' | 'acquire', data?: unknown): Promise<any> {
    const requestId = randomUUID()
    return new Promise((resolve, reject) => {
      const timer =
        action === 'acquire'
          ? setTimeout(() => {
              this.pending.delete(requestId)
              try {
                this.send({ type: 'windows-privilege-cancel', requestId })
              } catch {
                // 主进程已经退出时无法发取消；main 的 owner 清理承担最终资源回收。
              }
              reject(
                new AppHelperError(
                  'elevation_status_timeout',
                  'Windows authorization request expired'
                )
              )
            }, 360_000)
          : undefined
      this.pending.set(requestId, { resolve, reject, timer })
      try {
        this.send({ type: 'windows-privilege-request', requestId, action, data })
      } catch (error) {
        if (timer) clearTimeout(timer)
        this.pending.delete(requestId)
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }
  resolve(request: WindowsPrivilegeRequest): Promise<WindowsElevationMethod> {
    return this.request('resolve', request)
  }
  acquire(): Promise<string> {
    return this.request('acquire')
  }
  release(lease: string) {
    try {
      this.send({ type: 'windows-privilege-release', lease })
    } catch {
      // 断连后的发送异常不得覆盖业务结果；main 通过 UtilityProcess exit 清理 owner。
    }
  }
  /** 快照与请求结果分开处理；迟到/重复响应不再创建监听或改变已结束 Promise。 */
  handleMessage(message: any): boolean {
    if (message?.type === 'windows-privilege-changed') {
      applyWindowsPrivilegeSnapshot(message.snapshot)
      return true
    }
    if (message?.type !== 'windows-privilege-response') return false
    const pending = this.pending.get(message.requestId)
    if (!pending) return true
    this.pending.delete(message.requestId)
    if (pending.timer) clearTimeout(pending.timer)
    if (message.error)
      pending.reject(
        new AppHelperError(message.error.code as AppHelperErrorCode, message.error.message)
      )
    else pending.resolve(message.data)
    return true
  }
}
