import { writePerformanceLog } from './PerformanceDiagnostics'
import { dirname } from 'node:path'
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises'
import { getWindowsHelperIdentity } from './WindowsHelperIdentity'
import {
  buildWindowsPrivilegeAction,
  buildWindowsActionPathGuard,
  type WindowsPrivilegeActionContext
} from './WindowsHelperFallback'
import { runWindowsAction } from './WindowsElevation'
import { isAppHelperError } from './WindowsHelperState'
import {
  isWindowsProcessElevated,
  resolveWindowsPrivilege,
  withWindowsElevationLease
} from './WindowsPrivilege'
import {
  windowsProcessSafetyGuard,
  windowsStopProcessLookup,
  windowsStopListenerLookup,
  windowsProcessStartIdentity,
  type WindowsProcessIdentity
} from './WindowsProcessSafety'
import { ProcessIdentityListByPidsStrict } from './Process.win'
import { appDebugLog } from './utils'
import { logServiceStop } from './ServiceStopDiagnostics'
import { buildWindowsPrivilegeReason } from './WindowsPrivilegeReason'
import { timeOperation, timeOperationSync } from './OperationTiming'
import { logWindowsPath } from './WindowsPathDiagnostics'

// 原账户身份必须在 RunAs 前获取并缓存；管理员凭据可能属于另一账户。
// 获取失败清空缓存，避免一次 PowerShell/策略异常永久阻止后续重试。
let identity: ReturnType<typeof getWindowsHelperIdentity> | undefined
const originalIdentity = () =>
  (identity ??= getWindowsHelperIdentity().catch((error) => {
    identity = undefined
    throw error
  }))
// 访问拒绝进入已选授权方式；ENOENT、EBUSY、磁盘/格式错误仍直接返回。
// Node 的 EPERM/EACCES 也可能包含共享锁或安全策略拒绝，不等同于确需管理员。
// 为减少授权前等待，不再用普通 PowerShell 重写一次；授权执行仍返回真实失败。
const isPermissionError = (error: unknown) =>
  isAppHelperError(error, 'windows_permission_denied') ||
  ['EACCES', 'EPERM'].includes((error as NodeJS.ErrnoException)?.code ?? '')

/**
 * Windows 所有业务 Helper.send 的统一分流入口。先验证动作及可信路径，
 * 普通权限可完成就直接结束；访问拒绝或机器级写入时解析已保存方式或首次选择。
 * 已提升进程使用自己的权限，不读 Helper key、不检查常驻任务、不再 RunAs。
 */
export const executeWindowsPrivilegeOperation = async <T>(
  module: string,
  fn: string,
  args: unknown[],
  // 服务模式传完整有序集合；后代仅携带首次创建时点，不独立校验服务归属。
  helper: (processes?: WindowsPrivilegeActionContext['processes']) => Promise<T>
): Promise<T> => {
  const context: WindowsPrivilegeActionContext = {
    // 目录只从 main 提供的 Server 路径派生，不接受 renderer 任意新增 allowed-root。
    roots: [
      ...new Set(
        [global.Server?.BaseDir, global.Server?.AppDir]
          .filter(Boolean)
          .map((root) => dirname(root!))
      )
    ],
    userDocuments: global.Server?.UserDocuments ?? ''
  }
  if (fn === 'ensureFlyEnvDataDirectory' || fn === 'setAutoStartWin')
    context.userSid = (await originalIdentity()).sid
  if (fn === 'kill' || fn === 'killPorts') {
    // 此处只服务显式 Helper/端口工具动作；普通服务已经使用首次列表与
    // ProcessKillStrict，不再经过旧服务 ALS 身份上下文或本权限采样链。
    // 在展示 UAC 前记录 PID + 创建时间。等待期间 PID/端口可被复用，
    // action 必须核对同一个进程身份，禁止结束后来占用相同编号的进程。
    const requested = fn === 'kill' ? args[1] : args[0]
    if (
      !Array.isArray(requested) ||
      requested.length > (fn === 'kill' && args[2] === true ? 4096 : 256) ||
      requested.some(
        (value) =>
          !/^\d+$/.test(String(value)) ||
          !Number.isSafeInteger(Number(value)) ||
          Number(value) <= (fn === 'kill' ? 4 : 0) ||
          Number(value) > (fn === 'kill' ? 2147483647 : 65535)
      )
    )
      throw new Error('Invalid process targets')
    // kill 与 killPorts 都去重，避免同一 PID 的多份快照误判身份变化。
    const targetIds = [...new Set(requested.map(Number))].join(', ')
    const targets =
      fn === 'kill'
        ? `@(${targetIds})`
        : `@(@(${targetIds}) | ForEach-Object { Get-FlyEnvStopListenerPids ([int]$_) } | Sort-Object -Unique)`

    // 先使用完整精度的 Process.StartTime；权限拒绝时才以当前 CIM 创建时间和
    // 可执行路径固定候选，再要求授权后的执行端重查相同来源。只读查询不启动 Helper。
    // 若这两种来源都不能证明身份，失败必须保留，不能授权后盲信 PID 数字。
    try {
      // 这是独立的普通权限身份采样动作，管道初始化成本也计入该阶段。
      // 与随后真正执行停止的 ordinary.attempt 分开，便于看见重复启动成本。
      context.processes = await timeOperation('process-stop.capture-identity', () =>
        runWindowsAction<WindowsProcessIdentity[]>(
          `${windowsStopProcessLookup}
${windowsStopListenerLookup}
$targetPids = ${targets}
$global:FlyEnvActionResult = @(foreach ($targetPid in $targetPids) {
  $target = Get-FlyEnvStopTarget $targetPid
  if ($null -eq $target) { continue }
  try {
    $created = ${windowsProcessStartIdentity}
    ${windowsProcessSafetyGuard('$target')}
  } catch {
    if ($target.HasExited) { continue }
    throw
  }
  @{ pid=[int]$target.Id; created=$created; source='startTime'; path='' }
})`,
          false,
          { readOnly: true }
        )
      )
    } catch (error) {
      // Process.StartTime 被拒绝时，只有 CIM 能先固定当前创建时间和映像路径，
      // 才可继续授权。CIM 也无法建立证据时传播原失败；提权不能把裸 PID 变成可信目标。
      if (!isPermissionError(error)) throw error
      let targetPids: number[]
      if (fn === 'kill') {
        targetPids = [...new Set(requested.map(Number))]
      } else {
        const portIds = [...new Set(requested.map(Number))].join(', ')
        const owners = await timeOperation('process-stop.fallback-listeners', () =>
          runWindowsAction<unknown>(
            `${windowsStopListenerLookup}
$global:FlyEnvActionResult = @(@(${portIds}) | ForEach-Object { Get-FlyEnvStopListenerPids ([int]$_) } | Sort-Object -Unique)`,
            false,
            { readOnly: true }
          )
        )
        const ownerList = Array.isArray(owners)
          ? owners
          : owners === null || owners === undefined
            ? []
            : [owners]
        targetPids = ownerList.map(Number)
        if (targetPids.some((pid) => !Number.isSafeInteger(pid) || pid <= 4 || pid > 0x7fffffff))
          throw new Error('Invalid port process targets')
      }
      context.processes = await timeOperation('process-stop.fallback-cim-identity', () =>
        ProcessIdentityListByPidsStrict(targetPids)
      )
    }

    // 只记录已验证数字 PID/身份时间，不记录命令行或业务参数；按 PID 可与退出
    // 选中树日志关联。日志写失败不干扰授权/停止；这里等待记录，避免退出时丢失。
    await writePerformanceLog(appDebugLog, '[WindowsPrivilege][process-stop][snapshot]', () => ({
      fn,
      tree: fn === 'kill' && args[2] === true,
      requested,
      processes: context.processes
    }))
    await logServiceStop('privilege.snapshot', { fn, requested, processes: context.processes })
  }
  // 所有计时只观察真实步骤；错误继续走原有权限分类，不伪造普通权限拒绝。
  const actionScript = timeOperationSync('privilege.validate-action', () =>
    buildWindowsPrivilegeAction(module, fn, args, context)
  )
  // 与实际脚本在同一时点生成显示快照，后续普通权限尝试/等待不会改掉已确认的目标。
  const reason = buildWindowsPrivilegeReason(module, fn, args)
  // 构造阶段验证后，执行阶段仍检查 reparse point，覆盖等待 UAC 期间的路径变化。
  const paths = [
    'readFileByRoot',
    'writeFileByRoot',
    'writeBufferBase64ByRoot',
    'rm',
    'ensureFlyEnvDataDirectory',
    'sslAddTrustedCert'
  ].includes(fn)
    ? [String(args[0])]
    : []
  if (module === 'host' && fn === 'sslAddTrustedCert')
    paths.push(String(args[0]) + '/' + String(args[1]))
  const script = buildWindowsActionPathGuard(paths) + actionScript
  // 重放例外只来自固定动作名，不接受 renderer 传入的“只读”标志。
  const readOnly =
    (module === 'tools' &&
      ['readFileByRoot', 'processListWin', 'getPortPids', 'getSystemPath'].includes(fn)) ||
    (module === 'host' && fn === 'sslFindCertificate')
  // 明确的机器级写操作无需先以普通令牌制造一次拒绝；其余操作先按原权限尝试。
  const machineWrite =
    fn === 'setSystemPath' ||
    fn === 'setSystemEnv' ||
    fn === 'sslAddTrustedCert' ||
    fn === 'ensureFlyEnvDataDirectory'
  // 普通文件成功时不探测令牌，PowerShell 被企业策略限制也不影响 Node 文件操作。
  const elevated = machineWrite ? await isWindowsProcessElevated() : false
  logWindowsPath('privilege.route', { fn, elevated, machineWrite })
  const direct = async (): Promise<T> => {
    // Node 操作也在真正执行前重新核对路径；不能仅依赖进入授权分流前的构造检查。
    buildWindowsPrivilegeAction(module, fn, args, context)
    // 三种文件操作继续走 Node API；脚本生成器已完成同一组路径/参数约束。
    if (module === 'tools' && fn === 'readFileByRoot')
      return (await readFile(String(args[0]), 'utf8')).replace(/^\uFEFF/, '') as T
    if (module === 'tools' && (fn === 'writeFileByRoot' || fn === 'writeBufferBase64ByRoot')) {
      await mkdir(dirname(String(args[0])), { recursive: true })
      // 创建父目录后再检查，降低路径链被并发替换为 junction 的时间窗口。
      buildWindowsPrivilegeAction(module, fn, args, context)
      await timeOperation('ordinary.node-write', () =>
        writeFile(
          String(args[0]),
          fn === 'writeFileByRoot' ? String(args[1]) : Buffer.from(String(args[1]), 'base64')
        )
      )
      return true as T
    }
    if (module === 'tools' && fn === 'rm') {
      await rm(String(args[0]), { recursive: true, force: true })
      return true as T
    }
    return await runWindowsAction<T>(script, false, { readOnly })
  }
  if (elevated || !machineWrite) {
    try {
      const result = await timeOperation('ordinary.attempt', direct)
      if (fn === 'kill' || fn === 'killPorts') {
        // 此日志只在完整动作成功后产生；记录的是已确认身份的 PID，不泄露命令行。
        await writePerformanceLog(
          appDebugLog,
          '[WindowsPrivilege][process-stop][ordinary-completed]',
          () => ({ fn, pids: context.processes?.map(({ pid }) => pid) })
        )
      }
      if (fn === 'setSystemEnv' || fn === 'setSystemPath') {
        // 通用权限层只确认提交结果；缓存由实际写入调用处理，通知由业务方法
        // resolve/reject 后安排，不能在这里提前启动并打断环境/列表刷新。
        // 提升状态的直接执行也记录写入与后续刷新分界；写入完成不等于 UI 列表已返回。
        logWindowsPath('path.system-write-completed', { method: 'administrator', fn })
      }
      return result
    } catch (error) {
      // 非访问拒绝直接失败；已经提升时也不重复请求 UAC。普通 Node 成功不探测令牌，
      // 只有拒绝访问后才检查当前进程身份，随后直接进入下方已选 UAC/Helper 路由。
      // 同一普通令牌的 PowerShell 复核通常仍失败，却需要完整的进程/认证管道启动。
      // EPERM 若实际来自文件占用，允许本次进入授权，再由实际执行保留共享锁错误。
      if (fn === 'kill' || fn === 'killPorts') {
        // 原错误码决定提权，诊断只补充实际 PID/阶段；不能将身份失败改为权限拒绝。
        await appDebugLog('[WindowsPrivilege][process-stop][ordinary-error]', String(error)).catch(
          () => {}
        )
      }
      if (!isPermissionError(error) || elevated || (await isWindowsProcessElevated())) throw error
    }
  }
  // 动作已经通过同一白名单/路径校验，原因只摘取目标路径、PATH 增删及环境键值，
  // 不把文件内容或执行脚本带给 renderer；执行仍使用上面的原始业务参数。
  const method = await resolveWindowsPrivilege(`${module}/${fn}`, reason)
  logWindowsPath('privilege.method-selected', { method, fn })
  // helper 回调由既有签名 RPC 实现；UAC 使用独立管道，无任何 Helper 安装依赖。
  const result =
    method === 'helper'
      ? // Helper 合计包含其准备、租约和签名 RPC；不把它误报为纯 Go kill 耗时。
        await timeOperation('privilege.helper-dispatch', async () => {
          await logServiceStop('privilege.helper-dispatch', { fn, processes: context.processes })
          return helper(context.processes)
        })
      : await withWindowsElevationLease(
          () => runWindowsAction<T>(script, true, { readOnly }),
          'uac'
        )
  if (fn === 'kill' || fn === 'killPorts') {
    // 与普通权限完成日志区分实际执行方式，便于核对是否进入用户选定的授权分支。
    await writePerformanceLog(
      appDebugLog,
      '[WindowsPrivilege][process-stop][authorized-completed]',
      () => ({ fn, method, pids: context.processes?.map(({ pid }) => pid) })
    )
  }
  if (fn === 'setSystemEnv' || fn === 'setSystemPath') {
    // 三种权限方式均只返回写入结果；Go Helper 也不再提前广播，
    // 通知统一由具体环境业务 resolve/reject 后安排，避免重复通知或新增权限租约。
    logWindowsPath('path.system-write-completed', { method, fn })
    // UAC/Helper 均只返回实际写入结果；缓存失效归 writePath/setAlias 等业务调用。
    // 不在通用权限层隐式处理业务缓存。
  }
  return result
}
