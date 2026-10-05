import { performanceDiagnosticNow, performanceDiagnosticElapsed } from './PerformanceDiagnostics'
import JSON5 from 'json5'
import type { PItem } from './Process'
import { collectProcessSnapshotTree } from './ProcessSnapshot'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { randomUUID } from 'node:crypto'
import { appDebugLog } from '@shared/utils'
import { encodePowerShellCommand } from './PowerShellCommand'
import { windowsPowerShellEnv, resolveWindowsPowerShellPath } from './WindowsSystemPaths'
import { timeOperation, timeOperationSync } from './OperationTiming'
import { windowsTcpConnectionLookup, type WindowsProcessIdentity } from './WindowsProcessSafety'
import { bindServiceStopLogger } from './ServiceStopDiagnostics'

const PROCESS_LIST_TIMEOUT_MS = 60_000
const execFileAsync = promisify(execFile)

const normalizeWindowsProcessList = (parsed: any): PItem[] => {
  const list = Array.isArray(parsed) ? parsed : parsed ? [parsed] : []
  return list.map((m: any) => ({
    PID: `${m.ProcessId}`,
    PPID: `${m.ParentProcessId}`,
    USER: '',
    COMMAND: m.CommandLine ?? '',
    // 该值直接来自同一份 CIM 全量列表，供本次停止把原始 PID 绑定到创建时点。
    CREATED: typeof m.Created === 'string' && m.Created ? m.Created : undefined,
    // worker 可能用相对命令行启动；实际路径区分不同安装目录中的同名程序。
    EXECUTABLE: m.ExecutablePath ?? ''
  }))
}

/**
 * 普通权限 CIM 查询保留六十秒超时，不以 Helper 健康检查作为前置条件。
 * 系统 PowerShell 完整路径 + 参数数组 + EncodedCommand 不经过 shell；结果直接
 * 从 stdout 获取，去掉 TEMP 路径进入双引号脚本的插值和临时 JSON 的清理竞态。
 * 脚本只查询并返回进程数据，不注入临时阶段 logger；启动/总耗时/失败由 Node 外层
 * 记录，既不为调试追加查询，也不把真实查询失败转为成功或空进程表。
 */
export const ProcessPidListStrict = async (): Promise<PItem[]> => {
  const command = `$ErrorActionPreference = 'Stop'; $ProgressPreference = 'SilentlyContinue'; [Console]::OutputEncoding = [Text.Encoding]::UTF8
$rows = @(Get-CimInstance Win32_Process | Select-Object CommandLine,ExecutablePath,ProcessId,ParentProcessId,CreationClassName,@{Name='Created';Expression={ if ($null -eq $_.CreationDate) { '' } else { $_.CreationDate.ToUniversalTime().ToString('o', [Globalization.CultureInfo]::InvariantCulture) } }})
$json = ConvertTo-Json -InputObject $rows -Compress
[Console]::WriteLine($json)`
  // queryId 关联外层启动、结果和错误；标准输出只有业务 JSON，stderr 留给真实错误。
  const queryId = randomUUID()
  const logStop = bindServiceStopLogger()
  const started = performanceDiagnosticNow()
  await logStop('process-list.query-start', { queryId })
  // 外层计时观察器仍获取完整查询耗时，不依赖子脚本内部日志或改变查询次数。
  let output: { stdout: string; stderr: string }
  let queryMs: number
  const executionStarted = performanceDiagnosticNow()
  try {
    output = await timeOperation('process-list.powershell-query', () => {
      const pending = execFileAsync(
        resolveWindowsPowerShellPath(),
        ['-NoProfile', '-NonInteractive', '-EncodedCommand', encodePowerShellCommand(command)],
        {
          timeout: PROCESS_LIST_TIMEOUT_MS,
          windowsHide: true,
          maxBuffer: 10 * 1024 * 1024,
          env: windowsPowerShellEnv()
        }
      )
      // promisify(execFile) 保留真正的 child；此事件只证明进程已创建，不能证明
      // PowerShell 已完成查询；业务成功仍取决于 execFile 结果及 JSON 解析。
      pending.child.once('spawn', () => {
        void logStop('process-list.spawned', { queryId, powershellPid: pending.child.pid })
      })
      return pending
    })
    // 在外层结果日志之前固定查询耗时，避免日志 I/O 被误算成查询执行时间。
    queryMs = performanceDiagnosticElapsed(executionStarted) ?? 0
  } catch (error) {
    // 原异常（包括真实 stderr）继续传播；删除临时打点不改变查询失败的含义。
    await logStop('process-list.query-failed', {
      queryId,
      durationMs: performanceDiagnosticElapsed(started) ?? 0,
      error: String(error)
    })
    throw error
  }
  const parseStarted = performanceDiagnosticNow()
  try {
    const list = timeOperationSync('process-list.parse', () =>
      normalizeWindowsProcessList(JSON5.parse(output.stdout.replace(/^\uFEFF/, '')))
    )
    await logStop('process-list.query-completed', {
      queryId,
      durationMs: performanceDiagnosticElapsed(started) ?? 0,
      queryMs,
      parseMs: performanceDiagnosticElapsed(parseStarted) ?? 0,
      count: list.length
    })
    return list
  } catch (error) {
    await logStop('process-list.parse-failed', { queryId, error: String(error) })
    throw error
  }
}

/**
 * Process.StartTime 因权限拒绝时，通过 CIM 获取绑定 PID 的创建时间和映像路径。
 * 该快照仅用于受控授权恢复；CIM 无法返回完整记录时必须失败，不能退化为信任 PID。
 */
export const ProcessIdentityListByPidsStrict = async (
  pids: number[]
): Promise<WindowsProcessIdentity[]> => {
  if (
    pids.length > 256 ||
    pids.some((pid) => !Number.isSafeInteger(pid) || pid <= 4 || pid > 0x7fffffff)
  )
    throw new Error('Invalid process identity targets')
  if (pids.length === 0) return []
  const literals = [...new Set(pids)].join(', ')
  const command = `$ErrorActionPreference = 'Stop'; [Console]::OutputEncoding = [Text.Encoding]::UTF8
$requestedPids = @(${literals})
$global:FlyEnvIdentityResult = @(foreach ($requestedPid in $requestedPids) {
  $process = Get-CimInstance Win32_Process -Filter ('ProcessId=' + [int]$requestedPid) -ErrorAction Stop
  if ($null -eq $process) { continue }
  if ([string]::IsNullOrWhiteSpace([string]$process.CreationDate) -or [string]::IsNullOrWhiteSpace([string]$process.ExecutablePath)) {
    throw ('Cannot establish process identity from CIM; PID=' + $requestedPid)
  }
  $created = ([DateTime]$process.CreationDate).ToUniversalTime().ToString('o', [Globalization.CultureInfo]::InvariantCulture)
  @{ pid=[int]$process.ProcessId; created=$created; source='cim'; path=[string]$process.ExecutablePath }
})
ConvertTo-Json -InputObject $global:FlyEnvIdentityResult -Compress`
  const { stdout } = await execFileAsync(
    resolveWindowsPowerShellPath(),
    ['-NoProfile', '-NonInteractive', '-EncodedCommand', encodePowerShellCommand(command)],
    {
      timeout: PROCESS_LIST_TIMEOUT_MS,
      windowsHide: true,
      maxBuffer: 2 * 1024 * 1024,
      env: windowsPowerShellEnv()
    }
  )
  const parsed = JSON5.parse(stdout.replace(/^\uFEFF/, ''))
  const list = Array.isArray(parsed) ? parsed : parsed ? [parsed] : []
  return list.map((item: any) => ({
    pid: Number(item.pid),
    created: String(item.created),
    source: 'cim',
    path: String(item.path)
  }))
}

export const ProcessPidList = async (): Promise<PItem[]> => {
  try {
    return await ProcessPidListStrict()
  } catch (error) {
    appDebugLog('[ProcessPidList][error]', `${error}`).catch()
    return []
  }
}

export const ProcessPidListByPid = async (
  pid: string | number,
  processList?: PItem[]
): Promise<string[]> => {
  // This tree is later used for stop ownership, so retain the strict query error.
  const arr = processList ?? (await ProcessPidListStrict())
  return collectProcessSnapshotTree(`${pid}`, arr, true).map(({ PID }) => PID)
}

export const ProcessListSearch = async (
  search: string,
  aA = true,
  processList?: PItem[]
): Promise<PItem[]> => {
  const all: PItem[] = []
  if (!search) {
    return all
  }
  let arr: PItem[] = []
  try {
    arr = processList ?? (await ProcessPidList())
  } catch (e) {
    console.log('ProcessListSearch error: ', e)
    return []
  }
  const find = (ppid: string | number) => {
    ppid = `${ppid}`
    for (const item of arr) {
      if (`${item.PPID}` === `${ppid}`) {
        if (!all.find((f) => `${f.PID}` === `${item.PID}`)) {
          all.push(item)
          find(item.PID!)
        }
      }
    }
  }
  for (const item of arr) {
    const b = `${item.PID}` === `${search}`
    const c = `${item.PPID}` === `${search}`

    if (!aA) {
      search = search.toLowerCase()
      const a = item?.COMMAND && item.COMMAND.toLowerCase().includes(search)
      if (a || b || c) {
        if (!all.find((f) => `${f.PID}` === `${item.PID}`)) {
          all.push(item)
          find(item.PID!)
        }
      }
    } else {
      const a = item?.COMMAND && item.COMMAND.includes(search)
      if (a || b || c) {
        if (!all.find((f) => `${f.PID}` === `${item.PID}`)) {
          all.push(item)
          find(item.PID!)
        }
      }
    }
  }
  return all
}

export const fetchProcessPidByPort = async (port: string): Promise<string[]> => {
  // 查询入口也验证数字端口，不能把非法输入当作无监听者交给停止方。
  if (!/^\d{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
    throw new Error('Invalid port')
  }
  // 通用 getPortPids 的语义是查询本地端口的所有 TCP 连接状态，
  // 不把它收窄成监听者；停止监听服务的调用方应使用下面独立的 Listen 查询。
  const command = `${windowsTcpConnectionLookup}
$global:FlyEnvPortPids = @(Get-FlyEnvTcpConnections ${port} | Select-Object -ExpandProperty OwningProcess | Sort-Object -Unique)
ConvertTo-Json -InputObject $global:FlyEnvPortPids -Compress`
  const { stdout } = await execFileAsync(
    resolveWindowsPowerShellPath(),
    ['-NoProfile', '-NonInteractive', '-EncodedCommand', encodePowerShellCommand(command)],
    {
      timeout: PROCESS_LIST_TIMEOUT_MS,
      windowsHide: true,
      maxBuffer: 2 * 1024 * 1024,
      env: windowsPowerShellEnv()
    }
  )
  const parsed = JSON5.parse(stdout.replace(/^\uFEFF/, ''))
  const values = Array.isArray(parsed)
    ? parsed
    : parsed === null || parsed === undefined
      ? []
      : [parsed]
  const pids = values.map((value: unknown) => `${value}`)
  if (pids.some((pid: string) => !/^\d+$/.test(pid))) {
    throw new Error('Invalid Windows port process PID')
  }
  // TIME_WAIT 等通用查询可能报告 OwningProcess=0；它不是可归属进程，
  // 显示/查询时忽略，独立 Listen stop path 会拒绝 PID 0。
  return [...new Set(pids.filter((pid: string) => pid !== '0'))]
}

/** 旧 netstat 文本解析兼容接口；运行时监听查询已改用 Get-NetTCPConnection State 枚举。 */
export function loopbackListeningPidsFromNetstat(content: string, port: string): string[] {
  if (!/^\d{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
    throw new Error('Invalid port')
  }
  const pids = new Set<string>()
  for (const entry of content.split('\n')) {
    const parts = entry.trim().replace(/\s+/g, ' ').split(' ')
    if (parts[0].toUpperCase() !== 'TCP') continue
    // 数据库原生关闭依赖监听者核对，畸形 TCP 行不能被忽略后得到“无监听者”。
    if (parts.length !== 5 || !/^\d+$/.test(parts[4])) {
      throw new Error('Invalid Windows netstat listener row')
    }
    const [_, localAddress, __, state, pid] = parts
    const loopbackAddress = /^(?:127\.0\.0\.1|0\.0\.0\.0|\[::\]|\[::1\]):\d+$/.test(localAddress)
    if (
      loopbackAddress &&
      localAddress.endsWith(`:${port}`) &&
      state === 'LISTENING' &&
      /^\d+$/.test(pid)
    ) {
      pids.add(pid)
    }
  }
  return Array.from(pids)
}

export const fetchLoopbackListeningPids = async (port: string): Promise<string[]> => {
  if (!/^\d{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
    throw new Error('Invalid port')
  }
  // Get-NetTCPConnection 使用枚举 State，不受 Windows 显示语言影响。端口停止
  // 只看 Listen，并保留既有 loopback/wildcard 地址口径；真实查询错误必须传播。
  const command = `${windowsTcpConnectionLookup}
$global:FlyEnvListenerRows = @(Get-FlyEnvTcpConnections ${port} $true | Where-Object { $_.LocalAddress -in @('127.0.0.1', '0.0.0.0', '::1', '::') } | Select-Object -Property LocalAddress,OwningProcess)
ConvertTo-Json -InputObject $global:FlyEnvListenerRows -Compress`
  const { stdout } = await execFileAsync(
    resolveWindowsPowerShellPath(),
    ['-NoProfile', '-NonInteractive', '-EncodedCommand', encodePowerShellCommand(command)],
    {
      timeout: PROCESS_LIST_TIMEOUT_MS,
      windowsHide: true,
      maxBuffer: 2 * 1024 * 1024,
      env: windowsPowerShellEnv()
    }
  )
  const parsed = JSON5.parse(stdout.replace(/^\uFEFF/, ''))
  const rows = Array.isArray(parsed)
    ? parsed
    : parsed === null || parsed === undefined
      ? []
      : [parsed]
  const pids = rows.map((row: any) => `${row.OwningProcess}`)
  if (pids.some((pid: string) => !/^\d+$/.test(pid) || pid === '0')) {
    throw new Error('Invalid Windows listener PID')
  }
  return [...new Set(pids)]
}
