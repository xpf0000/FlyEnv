import IPC from '@/util/IPC'
import { reactiveBind } from '@/util/Index'
import { AsyncComponentShow } from '@/util/AsyncComponent'
import { AppStore } from '@/store/app'
import HelperStore from '@/store/helper'
import { MessageError, MessageSuccess, MessageWarning } from '@/util/Element'
import { I18nT } from '@lang/index'
import type { WindowsElevationMethod } from '@shared/WindowsHelperState'
import type { WindowsPrivilegeSnapshot } from '@shared/WindowsPrivilege'
import type { WindowsPrivilegeChoice } from '@shared/WindowsPrivilegeReason'

/**
 * 跨页面存活的权限 UI 控制器。页面只拥有输入，控制器持有 IPC、超时、
 * 重入保护、通知和对话框队列；导航到其他页面不会丢失尚未结束的请求。
 */
class WindowsPrivilegeController {
  busy = false
  choiceActive = false
  private operation?: Promise<void>
  private operationKey?: string
  private choiceId?: string
  private nextChoice?: WindowsPrivilegeChoice
  // 当前弹窗是被 main 结束还是用户取消，避免已完成选择的关闭再次提交 cancel。
  private choiceClosedByMain = false

  /**
   * 只为已发出的设置/选择/停用 IPC 计时；showChoice 等待用户本身不启动计时器。
   * 进度不清监听；成功、失败和执行超时才是终态，终态移除定时器/回调。
   */
  private request<T>(command: string, ...args: unknown[]): Promise<T> {
    return new Promise((resolve, reject) => {
      const sent = IPC.send(command, ...args)
      const timer = setTimeout(() => {
        IPC.off(sent.key)
        reject(new Error(I18nT('setup.windowsPrivilege.timeout')))
      }, 360_000)
      sent.then((key: string, result: any) => {
        if (result?.code === 200) return
        clearTimeout(timer)
        IPC.off(key)
        if (result?.code === 0) resolve(result.data)
        else reject(new Error(result?.msg || I18nT('setup.windowsPrivilege.failed')))
      })
    })
  }

  /** 主窗口、托盘和请求响应可乱序到达，revision 防止旧快照覆盖新偏好。 */
  apply(snapshot: WindowsPrivilegeSnapshot) {
    if (snapshot.revision < (window.Server.WindowsPrivilegeRevision ?? 0)) return
    window.Server.WindowsPrivilegeRevision = snapshot.revision
    window.Server.WindowsProcessElevated = snapshot.elevated
    window.Server.WindowsElevationMethod = snapshot.method
    window.Server.WindowsElevationChoiceVersion = snapshot.choiceVersion
    const setup = AppStore().config.setup
    setup.windowsElevationMethod = snapshot.method
    setup.windowsElevationChoiceVersion = snapshot.choiceVersion
  }

  /** mount 后再同步，避免首次选择弹窗依赖尚未创建的 renderer 容器。 */
  initialize() {
    return this.request<WindowsPrivilegeSnapshot>('application:windows-privilege-snapshot').then(
      (data) => this.apply(data)
    )
  }

  /** 同一 choiceId 仅展示一次，新请求先关闭旧窗口，等待卸载再展示。 */
  showChoice(choice: WindowsPrivilegeChoice) {
    if (this.choiceId) {
      if (this.choiceId !== choice.id) {
        this.nextChoice = { ...choice }
        this.choiceActive = false
      }
      return
    }
    this.choiceId = choice.id
    this.choiceClosedByMain = false
    this.choiceActive = true
    void import('./Choice.vue')
      .then(({ default: component }) =>
        // 原因随 choiceId 一同传递，排队/延迟加载后仍展示当时动作的快照。
        AsyncComponentShow(component, { operation: choice.operation, reason: choice.reason })
      )
      .then(async (result: any) => {
        if (!result) {
          if (!this.choiceClosedByMain)
            await this.request('application:windows-privilege-cancel', choice.id)
          return
        }
        // 弹窗只返回方式；UAC 固定停用旧 Helper，不能再由弹窗 payload 决定是否停用。
        await this.select(result.method, result.method === 'uac', choice.id)
      })
      .catch(async (error) => {
        if (!this.choiceClosedByMain)
          await this.request('application:windows-privilege-cancel', choice.id).catch(() => {})
        MessageError(error.message)
      })
      .finally(() => {
        this.choiceId = undefined
        this.choiceActive = false
        const next = this.nextChoice
        this.nextChoice = undefined
        if (next) this.showChoice(next)
      })
  }

  /** 主进程取消、应用关闭或其他窗口完成选择时，清除正在显示和排队的旧请求。 */
  dismissChoice(id: string) {
    if (this.nextChoice?.id === id) this.nextChoice = undefined
    if (this.choiceId === id) {
      this.choiceClosedByMain = true
      this.choiceActive = false
    }
  }

  // 设置页和首次授权弹窗都不提供停用勾选：选择 UAC 同时停用旧实例。
  // 独立停用失败不会撤销已保存的 UAC，用户可用维护按钮重试。
  select(
    method: WindowsElevationMethod,
    disableHelper = method === 'uac',
    choiceId?: string
  ): Promise<void> {
    const operationKey = JSON.stringify(['select', method, disableHelper, choiceId])
    if (this.operation)
      return this.operationKey === operationKey
        ? this.operation
        : // 同一请求复用，其他请求说明是哪项操作正在占用权限控制器。
          Promise.reject(new Error(I18nT('setup.windowsPrivilege.busy')))
    this.busy = true
    this.operationKey = operationKey
    this.operation = this.request<WindowsPrivilegeSnapshot>(
      'application:windows-privilege-select',
      method,
      choiceId
    )
      .then(async (snapshot) => {
        this.apply(snapshot)
        if (method === 'uac' && disableHelper) {
          // 偏好保存和旧任务停用是两个终态。停用失败保留已保存的 UAC，
          // 提示用户重新停用；不能把下一次业务执行退回 Helper。
          try {
            await this.request('application:windows-helper-disable')
          } catch (error) {
            MessageWarning(
              `${I18nT('setup.windowsPrivilege.disableFailed')} ${(error as Error).message}`
            )
          }
        }
        // 设置切换/手动修复的完成通知归本次控制器操作；main 广播在 busy 时已过滤。
        // 必须等真实健康/安装响应成功后提示“已就绪”，不能把选择保存当作安装成功。
        // 首次弹窗的挂起业务请求拥有安装；这里再 repair 会在 UAC 取消后重复弹窗。
        if (method === 'helper' && !choiceId && !window.Server.WindowsProcessElevated) {
          const ready = await HelperStore.repair()
          if (ready) MessageSuccess(I18nT('setup.windowsPrivilege.helperReady'))
        }
      })
      .finally(() => {
        this.busy = false
        this.operation = undefined
        this.operationKey = undefined
      })
    return this.operation
  }

  disableHelper(): Promise<void> {
    if (this.operation)
      return this.operationKey === 'disable'
        ? this.operation
        : Promise.reject(new Error(I18nT('setup.windowsPrivilege.busy')))
    this.busy = true
    this.operationKey = 'disable'
    this.operation = this.request('application:windows-helper-disable')
      .then(() => undefined)
      .finally(() => {
        this.busy = false
        this.operation = undefined
        this.operationKey = undefined
      })
    return this.operation
  }

  repair() {
    return this.select('helper')
  }
}

export default reactiveBind(new WindowsPrivilegeController())
