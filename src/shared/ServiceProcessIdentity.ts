import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { isWindows } from './utils'
import { encodePowerShellCommand } from './PowerShellCommand'
import { resolveWindowsPowerShellPath, windowsPowerShellEnv } from './WindowsSystemPaths'
import { StopProcessListFetch, fetchStopProcessListLocal } from './StopProcessList'
import { ProcessKillStrict, ProcessPidsByPid, type PItem } from './Process'
import { stopWindowsServiceProcesses, waitForServiceProcessExit } from './ServiceStop'
import { compareProcessCreation, isReadableServiceStopRoot } from './ProcessSnapshot'
import { parseUnixProcessCreated, unixProcessEnv } from './Process.unix'

const execFileAsync = promisify(execFile)

/**
 * fork 从本次实际启动返回的 PID 建立身份。命令/路径并非必要字段：macOS 服务可以
 * 改写进程标题。创建时间在启动阶段采样并只保存在运行登记；启动时间范围只是
 * 拒绝历史 PID 的额外约束，不能单独充当身份凭据。
 */
export type ServiceProcessIdentity = {
  /** 实际启动返回的根 PID；不能从相同 EXE、端口或后来的当前版本替换。 */
  pid: string
  /** 启动请求开始时间，用于拒绝旧 PID 文件，不是独立的停止归属凭据。 */
  launchedAt: number
  /** 返回启动终态前冻结上界，查询重试不能扩大允许范围。 */
  registeredAt: number
  /** 同来源 UTC 创建时间；缺失表示未取得身份，不能在停止阶段补认当前 PID。 */
  created?: string
}

/**
 * 项目与自定义服务的停止参数可能来自不同 IPC 入口。先统一为数字字符串，再
 * 检查安全整数/系统保留 PID，避免空值、负数、指数、溢出值进入查询或信号命令。
 * 数字范围只证明参数合法；真正归属仍由创建时间验证，不能以 PID 大小代替。
 */
export const normalizeServiceRootPid = (value: unknown): string => {
  const pid = `${value ?? ''}`.trim()
  if (
    !/^\d+$/.test(pid) ||
    !Number.isSafeInteger(Number(pid)) ||
    Number(pid) <= 4 ||
    Number(pid) > 0x7fffffff
  ) {
    throw new Error('Invalid service root PID')
  }
  return `${Number(pid)}`
}

/**
 * 查询指定父的原生创建时间。固定程序路径、数字 PID 和参数数组不经过 shell；
 * Windows 使用 CIM UTC 创建时间，Unix 使用英文 UTC ps lstart 转 ISO，兼容进程标题。
 * 不吞权限/执行错误；启动捕获会有限重试，停止时只比较已采样的原身份。
 */
const readCreated = async (pid: string): Promise<string> => {
  pid = normalizeServiceRootPid(pid)
  if (isWindows()) {
    const command = `$ErrorActionPreference='Stop'; [Console]::OutputEncoding=[Text.Encoding]::UTF8; $p=Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}' -ErrorAction Stop; if ($null -eq $p -or $null -eq $p.CreationDate) { throw 'Cannot read service creation time' }; $p.CreationDate.ToUniversalTime().ToString('o',[Globalization.CultureInfo]::InvariantCulture)`
    const result = await execFileAsync(
      resolveWindowsPowerShellPath(),
      ['-NoProfile', '-NonInteractive', '-EncodedCommand', encodePowerShellCommand(command)],
      { windowsHide: true, timeout: 15_000, env: windowsPowerShellEnv() }
    )
    const created = result.stdout.replace(/^\uFEFF/, '').trim()
    if (!Number.isFinite(Date.parse(created))) throw new Error('Cannot read service creation time')
    return created
  }
  const result = await execFileAsync('/bin/ps', ['-p', pid, '-o', 'lstart='], {
    timeout: 15_000,
    env: unixProcessEnv()
  })
  return parseUnixProcessCreated(result.stdout)
}

/**
 * 启动终态先冻结时间上界，暂时查询失败时最多重试三次。使用创建时间取代易变的
 * COMMAND，解决空命令采样导致以后一直无法停止的问题。Unix lstart 为秒精度。
 * 全部采样失败仍登记 PID，供界面显示；停止发现时过滤缺少创建快照的活父。
 * 不能到停止时仅凭固定启动时间窗口补认身份：窗口内同样可能发生 PID 复用。
 */
export const captureServiceProcessIdentity = async (
  pid: string,
  launchedAt: number
): Promise<ServiceProcessIdentity> => {
  const identity: ServiceProcessIdentity = {
    pid: normalizeServiceRootPid(pid),
    launchedAt,
    registeredAt: Date.now()
  }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const created = await readCreated(identity.pid)
      const time = Date.parse(created)
      const earliest = isWindows() ? launchedAt : Math.floor(launchedAt / 1000) * 1000
      if (time < earliest || time > identity.registeredAt) return identity
      identity.created = created
      return identity
    } catch {
      // 重试不扩大时间范围；查询持续被策略阻止时，保留未知状态而非盲信当前 PID。
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }
  return identity
}

/** 明确的候选证明缺失/不匹配，供发现阶段过滤；系统查询异常保留原错误传播。 */
class ServiceProcessIdentityMismatchError extends Error {}

/**
 * 仅验证父，不采样 worker。必须有启动阶段的创建快照，停止时不得补认当前 PID。
 * 兼容旧调用的命令快照，新的停止参数不依赖进程标题或完整二进制路径。
 */
export const verifyServiceProcessIdentity = async (
  pid: string,
  expected: ServiceProcessIdentity | string | undefined,
  command: string,
  observed?: PItem
): Promise<void> => {
  if (typeof expected === 'string') {
    if (!expected || !command || command !== expected)
      throw new ServiceProcessIdentityMismatchError('Service root identity changed')
    return
  }
  if (
    !expected ||
    expected.pid !== pid ||
    !expected.created ||
    !Number.isFinite(expected.launchedAt) ||
    !Number.isFinite(expected.registeredAt) ||
    expected.registeredAt < expected.launchedAt
  ) {
    throw new ServiceProcessIdentityMismatchError('Missing trusted service startup identity')
  }
  // 所有平台直接复用停止发现的同来源创建时间，不为根再查询一次。
  // 缺字段不能用“当前 PID”补认；Unix 不要求映像路径，兼容 macOS 进程标题。
  const created = observed ? observed.CREATED : await readCreated(pid)
  if (created !== expected.created)
    throw new ServiceProcessIdentityMismatchError('Service root identity changed')
}

/**
 * 项目/自定义服务共用的登记根停止。启动 PID 与创建证明是归属依据；根已消失
 * 且仍有历史 PPID worker 时无法补认，只过滤该候选。正常根一旦确认，同一列表
 * 中的全部后代直接属于该树，Windows 发送完整 PID 集合并确认，Unix 保留 TERM/INT。
 */
export const stopRegisteredServiceProcesses = async (
  requestedPid: string,
  expected?: ServiceProcessIdentity | string
): Promise<string[]> => {
  const pid = normalizeServiceRootPid(requestedPid)
  // 项目/自定义服务也参加 main 的首次列表共享，启动证明仍约束列表中的实际根。
  // 后续 TERM/INT 和退出确认保留新查询，不能拿首次缓存作为已退出证据。
  const list = await StopProcessListFetch()
  const root = list.find(({ PID }) => PID === pid)
  // 注册身份是归属证据，不依赖完整命令标题。候选不可用或证明不匹配只过滤；
  // 已有完整表直接比较创建时间，不在停止时重新采样父进程。
  if (!isReadableServiceStopRoot(root, isWindows(), false)) return []
  try {
    await verifyServiceProcessIdentity(pid, expected, root.COMMAND, root)
  } catch (error) {
    if (error instanceof ServiceProcessIdentityMismatchError) return []
    throw error
  }
  const pids = ProcessPidsByPid(pid, list)
  if (isWindows()) {
    // 上面已用同一列表完成启动身份筛选，不把证明再传入执行层重复比较。
    // 确认父后，同一快照中的后代直接进入一次普通权限停止命令。
    await stopWindowsServiceProcesses(pids, list)
  } else {
    await stopUnixServiceProcesses(pids, list)
  }
  return pids
}

/**
 * Unix 项目/自定义服务共用 TERM、短等候、INT 和结果确认。每次只发送给仍存活的
 * 原目标；批量 TERM 可能因某个 PID 自然退出而非零，但其他目标仍需继续 INT。
 * 记录信号错误并继续既有停止策略，只有最终严格查询证明全部消失才接受成功；
 * 仍有残留或查询失败必须报错，不能把“信号命令已返回”视为服务已停止。
 */
export const stopUnixServiceProcesses = async (
  pids: string[],
  initialList?: PItem[]
): Promise<void> => {
  const originalList = initialList ?? (await StopProcessListFetch())
  const original = new Map(originalList.map((item) => [item.PID, item]))
  let signalError: unknown
  const signalRemaining = async (signal: string, list: PItem[]) => {
    const remaining = pids.filter((pid) =>
      list.some(
        (item) =>
          item.PID === pid &&
          original.has(pid) &&
          compareProcessCreation(original.get(pid)?.CREATED, item.CREATED) === 0
      )
    )
    if (!remaining.length) return
    try {
      await ProcessKillStrict(signal, remaining)
    } catch (error) {
      // ESRCH 与权限失败不能仅凭错误文案区分。记录原错误，末次真实退出确认
      // 决定成功；继续发送原策略允许的 INT，不新增强制 KILL 或补选其他进程。
      signalError = error
    }
  }
  await signalRemaining('-TERM', originalList)
  await new Promise((resolve) => setTimeout(resolve, 500))
  await signalRemaining('-INT', await fetchStopProcessListLocal())
  try {
    await waitForServiceProcessExit(pids, 10_000, { initialList: originalList })
  } catch (error) {
    if (signalError) {
      throw new Error(`Service stop did not complete: ${String(signalError)}`, { cause: error })
    }
    throw error
  }
}

/**
 * 执行后的结果确认覆盖父及已发现的全部子孙。查询失败/超时直接传播；这不是
 * worker 停止前的身份校验，也不会自动补杀。父在授权等待期间自行退出时，残留
 * 子孙仍会导致失败，因此调用方不能清空登记并误报停止成功。
 */
export const waitServiceProcessesExited = async (
  pids: string[],
  timeoutMs = 10_000
): Promise<void> => {
  await waitForServiceProcessExit(pids, timeoutMs)
}
