import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { AsyncLocalStorage } from 'node:async_hooks'
import { windowsPowerShellEnv, resolveWindowsPowerShellPath } from './WindowsSystemPaths'
import { AppHelperError, type WindowsElevationMethod } from './WindowsHelperState'
import type { WindowsPrivilegeReason } from './WindowsPrivilegeReason'
import { markOperationStage, timeOperation } from './OperationTiming'

// 旧配置默认就是 helper，不能据此推断用户同意安装；此标记只在显式选择时写入。
export { WINDOWS_ELEVATION_CHOICE_VERSION } from './WindowsHelperState'
/** revision 是本次会话内单调递增的广播序号；elevated 是展示值，不能作为执行授权。 */
export type WindowsPrivilegeSnapshot = {
  method?: WindowsElevationMethod
  choiceVersion?: number
  revision: number
  elevated: boolean
}
/** interactive 必须来自本次异步调用上下文；普通后台请求默认 false。 */
export type WindowsPrivilegeRequest = {
  operation: string
  interactive: boolean
  /** 仅用于首次选择的原因展示，不参与执行授权或动作参数。 */
  reason?: WindowsPrivilegeReason
}
/** main 实现协调器，fork 实现 IPC 客户端；业务 action 不直接依赖 Electron。 */
export type WindowsPrivilegeProvider = {
  resolve(request: WindowsPrivilegeRequest): Promise<WindowsElevationMethod>
  acquire(): Promise<string>
  release(lease: string): void
}

let provider: WindowsPrivilegeProvider | undefined
let elevation: Promise<boolean> | undefined
// 并发业务请求不可共用一个全局 interactive 标志，否则手动操作会授权后台操作弹窗。
const interaction = new AsyncLocalStorage<boolean>()
export const withWindowsPrivilegeInteraction = <T>(interactive: boolean, action: () => T): T =>
  interaction.run(interactive, action)
export const getWindowsPrivilegeInteraction = () => interaction.getStore() === true
export const setWindowsPrivilegeProvider = (value: WindowsPrivilegeProvider) => {
  provider = value
}
export const hasWindowsPrivilegeProvider = () => Boolean(provider)

/**
 * 子 PowerShell 继承本进程令牌，判断有效管理员角色，区分“账户在管理员组”
 * 和“进程已通过 UAC 提升”。进程令牌生命周期固定，可缓存成功结果；
 * 探测异常清空 Promise，允许后续重试，不把探测失败当成已提权。
 */
export const isWindowsProcessElevated = (): Promise<boolean> => {
  if (process.platform !== 'win32') return Promise.resolve(false)
  // 路径检查也可能同步抛错；放入 Promise 链保证调用者的 catch 可以接住，
  // 并与进程执行错误一样清缓存、允许后续重试。
  if (elevation) markOperationStage('privilege.token-cache-hit')
  elevation ??= Promise.resolve()
    .then(() =>
      timeOperation('privilege.token-probe', () =>
        promisify(execFile)(
          // 令牌探测也是权限链的一部分，不能回退到 PATH 中的同名可执行文件。
          resolveWindowsPowerShellPath(),
          [
            '-NoProfile',
            '-NonInteractive',
            '-Command',
            '[Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)'
          ],
          { windowsHide: true, timeout: 10_000, env: windowsPowerShellEnv() }
        )
      )
    )
    .then(({ stdout }) => stdout.trim().toLowerCase() === 'true')
    .catch((error) => {
      elevation = undefined
      throw error
    })
  return elevation
}

/** 尚未挂接主进程协调器时明确拒绝；不会从默认配置悄悄选 Helper/UAC。 */
export const resolveWindowsPrivilege = (operation: string, reason?: WindowsPrivilegeReason) => {
  if (!provider) {
    throw new AppHelperError(
      'windows_authorization_required',
      'Choose a Windows authorization method in Settings'
    )
  }
  // 主进程直接调用与 fork IPC 使用同一可选字段；旧调用无需伪造具体原因。
  return timeOperation('privilege.resolve-method', () =>
    provider!.resolve({
      operation,
      interactive: interaction.getStore() === true,
      ...(reason ? { reason } : {})
    })
  )
}

/**
 * 安装/运行可能等待前一个权限操作。获得租约后再次向主进程读取方式，
 * 避免用户已切至 UAC，队列里的旧请求仍启动 Helper（反向切换同理）。
 * 停用 Helper 是用户独立授权的维护命令，因此可不传 expectedMethod。
 */
export const withWindowsElevationLease = async <T>(
  action: () => Promise<T>,
  expectedMethod?: WindowsElevationMethod
): Promise<T> => {
  if (!provider) {
    throw new AppHelperError(
      'windows_authorization_required',
      'Windows authorization coordinator is unavailable'
    )
  }
  const lease = await timeOperation('privilege.acquire-lease', () => provider!.acquire())
  try {
    if (
      expectedMethod &&
      (await resolveWindowsPrivilege('authorization/execute')) !== expectedMethod
    )
      throw new AppHelperError(
        'windows_authorization_required',
        'Authorization method changed while waiting; retry the operation'
      )
    return await action()
  } finally {
    provider.release(lease)
  }
}

/** fork/main 接收快照时忽略旧版本，只同步偏好与展示状态，不保存第二份配置。 */
export const applyWindowsPrivilegeSnapshot = (snapshot: WindowsPrivilegeSnapshot) => {
  if (!global.Server || snapshot.revision < (global.Server.WindowsPrivilegeRevision ?? 0)) return
  global.Server.WindowsElevationMethod = snapshot.method
  global.Server.WindowsElevationChoiceVersion = snapshot.choiceVersion
  global.Server.WindowsPrivilegeRevision = snapshot.revision
  // This is display state; execution still checks its own token.
  global.Server.WindowsProcessElevated = snapshot.elevated
}
